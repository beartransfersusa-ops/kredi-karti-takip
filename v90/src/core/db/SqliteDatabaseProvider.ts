// Tek DatabaseProvider — docs/v90/02-architecture.md §2.1, §12.2, ADR-002.
//
// Şifreleme bir SOYUTLAMA arkasındadır (R93.3): şifreli ve şifresiz yol aynı
// `Db` portunu döndürür, bu yüzden domain kodu hangisinin çalıştığını bilmez.
// Fark yalnızca bağlantı açılırken uygulanan `PRAGMA key`'dir.
//
// Web'de (sql.js, ADR-013) dosya bellektedir: sağlayıcı her başarılı COMMIT'ten
// ve transaction dışı her yazmadan sonra `persist()` ile görüntüyü depoya
// yazdırır. Okumalar (get/all) depoya dokunmaz.

import { DbOpenError, DbWriteError } from './errors.ts';
import type { DbKeyManager } from './keys/DbKeyManager.ts';
import type { SqliteConnection, SqliteDriver } from './SqliteDriver.ts';
import type { Db, DatabaseProvider, ExecResult, Tx } from './types.ts';

export class EncryptionUnsupportedError extends DbOpenError {
  constructor(driver: string) {
    super(`sürücü şifreleme desteklemiyor: ${driver} (SQLCipher gerekli, R93.2)`);
  }
}

class Conn implements Tx {
  protected readonly c: SqliteConnection;
  constructor(c: SqliteConnection) { this.c = c; }
  exec(sql: string, params?: readonly unknown[]): Promise<ExecResult> { return this.c.exec(sql, params); }
  execScript(sql: string): Promise<void> { return this.c.execScript(sql); }
  get<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined> { return this.c.get<T>(sql, params); }
  all<T>(sql: string, params?: readonly unknown[]): Promise<T[]> { return this.c.all<T>(sql, params); }
}

/**
 * Kuyrukta bu kadar bekleyen çağrı "kendini bekliyor" sayılır (iç içe çağrı).
 * Meşru bekleme milisaniyelerdir (bir ekranın okuması, bir komut + persist);
 * 15 s yalnızca programlama hatasını gizlemek yerine adlandırmak içindir.
 */
export const LOCK_TIMEOUT_MS = 15_000;

class DbImpl extends Conn implements Db {
  readonly path: string;
  readonly isEncrypted: boolean;
  /** `fn`'e verilen Tx: aynı bağlantı, ama kilit ALMAZ (kilit dışarıda tutulur). */
  readonly #scope: Conn;
  /** FIFO kuyruğun kuyruğu: her çağrı bir öncekinin bitişini bekler. */
  #tail: Promise<void> = Promise.resolve();
  readonly #lockTimeoutMs: number;

  constructor(c: SqliteConnection, path: string, isEncrypted: boolean, lockTimeoutMs = LOCK_TIMEOUT_MS) {
    super(c);
    this.path = path;
    this.isEncrypted = isEncrypted;
    this.#scope = new Conn(c);
    this.#lockTimeoutMs = lockTimeoutMs;
  }

  /**
   * Tek bağlantı = tek sıra (02 §3). Eşzamanlı çağrılar — iki ekranın aynı anda
   * okuması, bir komut ve onun tetiklediği yeniden okuma, sekmeye dönüşte
   * yinelenen sorgu — FIFO kuyrukta bekler; hiçbiri diğerinin BEGIN/COMMIT'i
   * arasına giremez. İç içe çağrı (fn içinden `db.withTransaction`) ise kendi
   * kendini beklerdi: eşik aşılınca sessiz kilitlenme yerine açık hata verir.
   */
  async #exclusive<T>(what: string, task: () => Promise<T>): Promise<T> {
    const prev = this.#tail;
    let release!: () => void;
    this.#tail = new Promise<void>((r) => { release = r; });

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(
        `transaction kuyrukta ${this.#lockTimeoutMs} ms bekledi — iç içe çağrı olabilir (02 §3): ${what}`)),
        this.#lockTimeoutMs);
    });
    try {
      await Promise.race([prev, timeout]);
    } catch (e) {
      // Sıra bize gelmedi. Yerimizi öncekine bağlıyoruz ki arkamızdakiler
      // gerçek tutucuyu beklemeye devam etsin (kuyruk kopmaz).
      void prev.then(release);
      throw e;
    } finally {
      clearTimeout(timer);
    }

    try {
      return await task();
    } finally {
      release();
    }
  }

  withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.#exclusive('withTransaction', async () => {
      await this.c.execScript('BEGIN IMMEDIATE');
      let out: T;
      try {
        out = await fn(this.#scope);
        await this.c.execScript('COMMIT');
      } catch (e) {
        await this.c.execScript('ROLLBACK').catch(() => { /* zaten kapalı */ });
        throw e;
      }
      // COMMIT başarılı: bellek içi motor görüntüyü kalıcı depoya yazar.
      // Depo hatası YUTULMAZ; kullanıcı "Kaydedilemedi" görür (02 §15).
      // Persist kilit İÇİNDE: sıradaki transaction, görüntü yazılmadan başlamaz.
      await this.#persist();
      return out;
    });
  }

  /** Transaction dışı tekil yazma da sıraya girer ve kalıcılaştırılır. */
  override exec(sql: string, params?: readonly unknown[]): Promise<ExecResult> {
    return this.#exclusive('exec', async () => {
      const r = await this.c.exec(sql, params);
      await this.#persist();
      return r;
    });
  }

  override execScript(sql: string): Promise<void> {
    return this.#exclusive('execScript', async () => {
      await this.c.execScript(sql);
      await this.#persist();
    });
  }

  /** Transaction dışı okuma da sıraya girer: açık bir transaction'ın ortasına düşmez. */
  override get<T>(sql: string, params?: readonly unknown[]): Promise<T | undefined> {
    return this.#exclusive('get', () => this.c.get<T>(sql, params));
  }

  override all<T>(sql: string, params?: readonly unknown[]): Promise<T[]> {
    return this.#exclusive('all', () => this.c.all<T>(sql, params));
  }

  async #persist(): Promise<void> {
    if (!this.c.persist) return;       // dosya tabanlı sürücü: SQLite zaten yazdı
    try {
      await this.c.persist();
    } catch (e) {
      throw new DbWriteError(`kalıcı depoya yazılamadı: ${(e as Error).message}`, e);
    }
  }

  /** Kapatma da sırayı bekler: yarıda kalan transaction yok. */
  close(): Promise<void> {
    return this.#exclusive('close', () => this.c.close());
  }
}

export interface SqliteDatabaseProviderOptions {
  driver: SqliteDriver;
  path: string;
  /** Verilirse bağlantı şifreli açılır; verilmezse düz (yalnızca geliştirme). */
  keyManager?: DbKeyManager;
  /** Bağlantı düzeyi PRAGMA'lar (02 §7.1 dayanıklılık). */
  pragmas?: readonly string[];
  /** Kuyrukta bekleme eşiği (ms); aşılırsa iç içe çağrı hatası. Testler kısaltır. */
  lockTimeoutMs?: number;
}

export const DEFAULT_PRAGMAS: readonly string[] = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = FULL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
];

export class SqliteDatabaseProvider implements DatabaseProvider {
  readonly path: string;
  readonly isEncrypted: boolean;
  readonly #o: SqliteDatabaseProviderOptions;

  constructor(o: SqliteDatabaseProviderOptions) {
    this.#o = o;
    this.path = o.path;
    // İki dürüst kaynak: SQLCipher anahtarı (keyManager) ya da sürücünün
    // SQLite dışı şifrelemesi (encryptsAtRest, web görüntüsü). Başka hiçbir
    // şey "şifreli" saydırmaz (R93.4, R93.7).
    this.isEncrypted = o.keyManager != null || o.driver.encryptsAtRest === true;
    if (o.keyManager && !o.driver.supportsEncryption) {
      throw new EncryptionUnsupportedError(o.driver.name);
    }
  }

  async open(): Promise<Db> {
    // Anahtar bağlantıdan ÖNCE çözülür. SQLite dosyayı açılışta oluşturur;
    // önce açsaydık DbKeyManager'ın "zaten bir DB var mı?" kontrolü daima
    // true görür, "anahtar yok" ile "anahtar şu an okunamıyor" ayrımı bozulurdu
    // (ADR-002). Ayrıca anahtar alınamadığında ortada dosya da kalmaz.
    const key = this.#o.keyManager ? await this.#o.keyManager.getOrCreate() : null;

    const conn = await this.#o.driver.open(this.#o.path);
    try {
      if (key !== null) {
        // PRAGMA key bağlantının İLK ifadesi olmak zorundadır.
        await conn.execScript(`PRAGMA key = "x'${key}'"`);
        await this.#assertReadable(conn);
      }
      const pragmas = this.#o.pragmas ?? DEFAULT_PRAGMAS;
      for (const p of pragmas) {
        if (this.#o.path === ':memory:' && p.includes('journal_mode')) continue;
        await conn.execScript(p);
      }
      return new DbImpl(conn, this.#o.path, this.isEncrypted, this.#o.lockTimeoutMs ?? LOCK_TIMEOUT_MS);
    } catch (e) {
      await conn.close().catch(() => {});
      if (e instanceof DbOpenError) throw e;
      // Hata mesajına anahtar SIZMAZ: yalnızca sürücünün metni taşınır.
      throw new DbOpenError(`veritabanı açılamadı (${this.#o.driver.name}): ${(e as Error).message}`, e);
    }
  }

  /** Yanlış anahtar ancak veriye dokununca anlaşılır (SQLCipher davranışı). */
  async #assertReadable(conn: SqliteConnection): Promise<void> {
    try {
      await conn.get('SELECT count(*) AS n FROM sqlite_master');
    } catch (e) {
      throw new DbOpenError('veritabanı bu anahtarla açılamadı (yanlış anahtar ya da bozuk dosya)', e);
    }
  }
}
