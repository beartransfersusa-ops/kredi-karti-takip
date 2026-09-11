// Tek DatabaseProvider — docs/v90/02-architecture.md §2.1, §12.2, ADR-002.
//
// Şifreleme bir SOYUTLAMA arkasındadır (R93.3): şifreli ve şifresiz yol aynı
// `Db` portunu döndürür, bu yüzden domain kodu hangisinin çalıştığını bilmez.
// Fark yalnızca bağlantı açılırken uygulanan `PRAGMA key`'dir.

import { DbOpenError } from './errors.ts';
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

class DbImpl extends Conn implements Db {
  readonly path: string;
  readonly isEncrypted: boolean;
  #inTx = false;

  constructor(c: SqliteConnection, path: string, isEncrypted: boolean) {
    super(c);
    this.path = path;
    this.isEncrypted = isEncrypted;
  }

  async withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (this.#inTx) throw new Error('iç içe transaction desteklenmiyor (02 §3)');
    this.#inTx = true;
    await this.c.execScript('BEGIN IMMEDIATE');
    try {
      const out = await fn(this);
      await this.c.execScript('COMMIT');
      return out;
    } catch (e) {
      await this.c.execScript('ROLLBACK').catch(() => { /* zaten kapalı */ });
      throw e;
    } finally {
      this.#inTx = false;
    }
  }

  async close(): Promise<void> { await this.c.close(); }
}

export interface SqliteDatabaseProviderOptions {
  driver: SqliteDriver;
  path: string;
  /** Verilirse bağlantı şifreli açılır; verilmezse düz (yalnızca geliştirme). */
  keyManager?: DbKeyManager;
  /** Bağlantı düzeyi PRAGMA'lar (02 §7.1 dayanıklılık). */
  pragmas?: readonly string[];
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
    this.isEncrypted = o.keyManager != null;
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
      return new DbImpl(conn, this.#o.path, this.isEncrypted);
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
