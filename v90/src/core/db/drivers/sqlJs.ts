// sql.js sürücüsü — WEB production (docs/v90/02-architecture.md §12.2, ADR-013).
//
// SQLite wasm olarak tarayıcıda, TAMAMEN BELLEKTE koşar. Kalıcılık dosya
// sistemi değil bir ImageStore'dur: `persist()` görüntünün tamamını dışa
// aktarır ve depoya yazar; sağlayıcı bunu her COMMIT'ten sonra çağırır.
// Sürücü IndexedDB'yi ya da şifrelemeyi BİLMEZ — depo sarmalayıcısı
// (EncryptedImageStore) onları üstlenir; bu yüzden aynı sürücü Node
// testinde InMemoryImageStore ile de koşar.
//
// SQLCipher DEĞİLDİR: `supportsEncryption = false`, `PRAGMA key` gelmez.
// `encryptsAtRest` deponun beyanıdır (R93.4).

import initSqlJs from 'sql.js';
import { DbOpenError } from '../errors.ts';
import type { ImageStore } from '../imageStore.ts';
import type { SqliteConnection, SqliteDriver } from '../SqliteDriver.ts';

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;
type SqlJsDatabase = InstanceType<SqlJsStatic['Database']>;
type SqlValue = number | string | Uint8Array | null;

export interface SqlJsDriverOptions {
  store: ImageStore;
  /** wasm dosyasının URL'si (web'de base path altına düşer). Node'da gerekmez. */
  locateFile?: (file: string) => string;
}

// Süreç başına TEK wasm örneği: initSqlJs pahalıdır ve iki örnek gereksizdir.
// Başarısız bir yükleme önbelleğe alınmaz ki yeniden deneme mümkün olsun.
let sqlJs: Promise<SqlJsStatic> | null = null;
function loadSqlJs(locateFile?: (file: string) => string): Promise<SqlJsStatic> {
  if (!sqlJs) {
    sqlJs = initSqlJs(locateFile ? { locateFile } : {}).catch((e: unknown) => {
      sqlJs = null;
      throw e;
    });
  }
  return sqlJs;
}

/**
 * Port `unknown[]` taşır; sql.js number/string/Uint8Array/null bekler.
 * undefined → NULL (sql.js "undefined" diye patlar), bigint → Number
 * (sql.js metne çevirirdi), boolean → 1/0. Salt-okunur dizi kopyalanır.
 */
function toBind(params: readonly unknown[]): SqlValue[] {
  return params.map((v): SqlValue => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'number' || typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'bigint') return Number(v);
    if (v instanceof Uint8Array) return v;
    throw new TypeError(`sql.js: desteklenmeyen parametre tipi (${typeof v})`);
  });
}

/**
 * Bağlantıya "yapışan" PRAGMA'lar: `db.export()` dosyayı kapatıp yeniden
 * açar ve bağlantı düzeyi ayarları (foreign_keys…) SIFIRLAR. Bu yüzden
 * `PRAGMA x = y` biçimindeki tek ifadeler ada göre (sonuncusu kalır)
 * kaydedilir ve her export'tan sonra yeniden uygulanır.
 *
 * Dosyanın kendisinde saklananlar hariç tutulur: görüntüyle zaten gelirler
 * ve geri alınmış bir transaction içindeki `user_version` yazımının
 * yeniden uygulanması şema sürümünü yanlış ilerletirdi (R92.6).
 */
const STICKY_PRAGMA = /^PRAGMA\s+(\w+)\s*=\s*[^;]+;?$/i;
const FILE_PRAGMAS = new Set(['user_version', 'application_id', 'journal_mode', 'auto_vacuum', 'page_size', 'encoding']);

class Conn implements SqliteConnection {
  readonly #db: SqlJsDatabase;
  readonly #path: string;
  readonly #store: ImageStore;
  readonly #sticky = new Map<string, string>();

  constructor(db: SqlJsDatabase, path: string, store: ImageStore) {
    this.#db = db;
    this.#path = path;
    this.#store = store;
  }

  async exec(sql: string, params: readonly unknown[] = []) {
    this.#db.run(sql, params.length ? toBind(params) : undefined);
    this.#recordPragma(sql);
    return { changes: this.#db.getRowsModified() };
  }

  async execScript(sql: string) {
    this.#db.exec(sql);                  // çok ifadeli; sonuç satırları yok sayılır
    this.#recordPragma(sql);
  }

  async get<T>(sql: string, params: readonly unknown[] = []) {
    const st = this.#db.prepare(sql);
    try {
      if (params.length) st.bind(toBind(params));
      return st.step() ? (st.getAsObject() as T) : undefined;
    } finally { st.free(); }
  }

  async all<T>(sql: string, params: readonly unknown[] = []) {
    const st = this.#db.prepare(sql);
    try {
      if (params.length) st.bind(toBind(params));
      const rows: T[] = [];
      while (st.step()) rows.push(st.getAsObject() as T);
      return rows;
    } finally { st.free(); }
  }

  /**
   * Görüntüyü depoya yaz. `export()` bağlantıyı kapatıp yeniden açar
   * (statement'lar serbest kalır, bağlantı PRAGMA'ları sıfırlanır); yapışan
   * PRAGMA'lar depo yazımından ÖNCE geri konur ki depo hatası bağlantıyı
   * foreign_keys=OFF hâlinde bırakmasın.
   */
  async persist() {
    if (this.#path === ':memory:') return;
    const bytes = this.#db.export();
    for (const sql of this.#sticky.values()) this.#db.run(sql);
    await this.#store.save(this.#path, bytes);
  }

  /** Kapatmak kalıcılaştırmaz: yazılmamış değişiklik yoktur, her COMMIT zaten yazdı. */
  async close() { this.#db.close(); }

  #recordPragma(sql: string): void {
    const m = STICKY_PRAGMA.exec(sql.trim());
    if (!m) return;
    const name = m[1]!.toLowerCase();
    if (FILE_PRAGMAS.has(name)) return;
    this.#sticky.set(name, sql.trim());
  }
}

export function sqlJsDriver(o: SqlJsDriverOptions): SqliteDriver {
  return {
    name: 'sql.js',
    supportsEncryption: false,
    encryptsAtRest: o.store.isEncrypted,
    async open(path) {
      const SQL = await loadSqlJs(o.locateFile);
      // Depo hatası (IndexedDB, yanlış anahtar…) DbOpenError olarak çıkar;
      // sağlayıcı `driver.open`'ı kendi sarmalayıcısının dışında çağırır.
      let bytes: Uint8Array | null;
      try { bytes = await o.store.load(path); }
      catch (e) {
        if (e instanceof DbOpenError) throw e;
        throw new DbOpenError(`görüntü depodan okunamadı (sql.js): ${(e as Error).message}`, e);
      }
      const db = new SQL.Database(bytes ?? undefined);
      if (bytes !== null) {
        // Bozuk görüntü ancak veriye dokununca anlaşılır ("file is not a
        // database"); hata açılış adımında çıksın, ilk migration sorgusunda değil.
        try { db.exec('SELECT count(*) FROM sqlite_master'); }
        catch (e) {
          db.close();
          throw new DbOpenError(`veritabanı görüntüsü açılamadı (sql.js): ${(e as Error).message}`, e);
        }
      }
      return new Conn(db, path, o.store);
    },
  };
}
