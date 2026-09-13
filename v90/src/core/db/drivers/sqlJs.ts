// sql.js sürücüsü — WEB production (docs/v90/02-architecture.md §12.2, ADR-013).
//
// SQLite wasm olarak tarayıcıda, TAMAMEN BELLEKTE koşar. Kalıcılık dosya
// sistemi değil bir ImageStore'dur: `persist()` görüntünün tamamını dışa
// aktarır ve depoya yazar; sağlayıcı bunu her COMMIT'ten sonra çağırır.
// Sürücü IndexedDB'yi ya da şifrelemeyi BİLMEZ — depo sarmalayıcısı
// (EncryptedImageStore) onları üstlenir; bu yüzden aynı sürücü Node
// testinde InMemoryImageStore ile de koşar.
//
// İki koruma (adversarial review bulguları):
//   • KİRLİ BAYRAK: yalnızca görüntüyü değiştirmiş olabilecek bir ifade
//     koştuysa persist edilir. Salt okuyan bir transaction'ın COMMIT'i
//     (dashboard, liste ekranları) export + AES-GCM + IndexedDB put
//     maliyetini ödemez ve okumalar depo hatasına bağlanmaz.
//   • SON İYİ KOPYA: depo yazamazsa bellek depodan ÖNDE kalmaz — görüntü son
//     başarıyla kaydedilen (ya da açılışta yüklenen) baytlardan yeniden açılır.
//     Böylece sağlayıcının DbWriteError'u ("Kaydedilemedi… tekrar dene") doğru
//     söyler: satır ne bellekte ne depoda vardır, aynı yazma yeniden denendiğinde
//     UNIQUE'e takılmaz, sekme kapanınca "kaydedildi sanılan" veri kaybolmaz.
//     Bedeli bellekte bir görüntü kopyası daha tutmaktır (aşağıda, #lastGood).
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

/**
 * Görüntüyü DEĞİŞTİRMEYEN ifadelerin ilk sözcüğü. Transaction sınırları
 * (BEGIN/COMMIT/END/ROLLBACK/SAVEPOINT/RELEASE) burada: sağlayıcı onları
 * execScript ile gönderir, kendileri veri yazmaz. `PRAGMA` yalnızca
 * `=` içermiyorsa (okuma) salt okunurdur; `PRAGMA user_version = 3` yazar.
 * Listede olmayan her şey (INSERT, CREATE, WITH … INSERT, ATTACH…) kirli sayılır.
 */
const READ_ONLY_KEYWORDS = new Set(['SELECT', 'EXPLAIN', 'BEGIN', 'COMMIT', 'END', 'ROLLBACK', 'SAVEPOINT', 'RELEASE', 'VALUES']);

/**
 * Baştaki boşluk ve SQL yorumları (`-- …`, `/* … *​/`) atılmış metin. Satır
 * yorumu girdinin sonuyla da biter (SQL böyle tanımlar); kapanmamış blok
 * yorum olduğu gibi bırakılır ki tanınmayan sözcük gibi "kirli" sayılsın.
 */
function stripLeading(sql: string): string {
  let s = sql;
  for (;;) {
    s = s.trimStart();
    if (s.startsWith('--')) {
      const nl = s.indexOf('\n');
      s = nl === -1 ? '' : s.slice(nl + 1);
    } else if (s.startsWith('/*')) {
      const end = s.indexOf('*/');
      if (end === -1) return s;
      s = s.slice(end + 2);
    } else {
      return s;
    }
  }
}

/**
 * Bu ifade görüntüyü değiştirmiş olabilir mi? Tutucudur: emin olunmayan her
 * şey (çok ifadeli script, tanınmayan sözcük, `=` içeren PRAGMA, `;` içeren
 * string) "kirli" sayılır — gereksiz bir persist ucuz, kaçırılan bir persist
 * veri kaybıdır.
 */
export function isReadOnlySql(sql: string): boolean {
  const stmt = stripLeading(sql).replace(/;\s*$/, '');
  if (stmt.length === 0) return true;                         // boş ya da yalnız yorum: hiçbir şey koşmadı
  if (stmt.includes(';')) return false;                       // çok ifadeli script: her biri okunmuyorsa kirli
  const kw = /^[A-Za-z]+/.exec(stmt)?.[0]?.toUpperCase();
  if (!kw) return false;
  if (kw === 'PRAGMA') return !stmt.includes('=');
  return READ_ONLY_KEYWORDS.has(kw);
}

class Conn implements SqliteConnection {
  #db: SqlJsDatabase;                       // persist hatasında #lastGood'dan yeniden açılır
  readonly #SQL: SqlJsStatic;
  readonly #path: string;
  readonly #store: ImageStore;
  readonly #sticky = new Map<string, string>();
  /**
   * Depoyla UYUŞAN son görüntü: açılışta yüklenen ya da son başarılı
   * `save`'in baytları (fresh DB'de null). Bellek maliyeti: bir görüntü
   * kopyası daha (`export()` zaten wasm yığınının dışında taze bir dizi
   * döndürür; onu saklamak ek kopyadır). V90 görüntüsü küçüktür (ADR-013
   * Karar 2 maliyeti); karşılığı depo hatasında belleği depoyla yeniden
   * hizalayabilmektir. `new SQL.Database(bytes)` baytları kopyalar, bu
   * yüzden aynı kopya birden çok kez kullanılabilir.
   */
  #lastGood: Uint8Array | null;
  /** Son başarılı persist'ten beri görüntüyü değiştirmiş olabilecek bir ifade koştu mu? */
  #dirty = false;

  constructor(SQL: SqlJsStatic, db: SqlJsDatabase, path: string, store: ImageStore, lastGood: Uint8Array | null) {
    this.#SQL = SQL;
    this.#db = db;
    this.#path = path;
    this.#store = store;
    this.#lastGood = lastGood;
  }

  async exec(sql: string, params: readonly unknown[] = []) {
    // Koşmadan ÖNCE işaretlenir: yarıda kalan bir script de kirletmiş olabilir.
    if (!isReadOnlySql(sql)) this.#dirty = true;
    this.#db.run(sql, params.length ? toBind(params) : undefined);
    this.#recordPragma(sql);
    return { changes: this.#db.getRowsModified() };
  }

  async execScript(sql: string) {
    if (!isReadOnlySql(sql)) this.#dirty = true;
    this.#db.exec(sql);                  // çok ifadeli; sonuç satırları yok sayılır
    this.#recordPragma(sql);
  }

  /** Okumalar kirletmez: görüntü değişmez, persist tetiklenmez. */
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
   * Görüntüyü depoya yaz — yalnızca kirliyse. `export()` bağlantıyı kapatıp
   * yeniden açar (statement'lar serbest kalır, bağlantı PRAGMA'ları
   * sıfırlanır); yapışan PRAGMA'lar depo yazımından ÖNCE geri konur ki depo
   * hatası bağlantıyı foreign_keys=OFF hâlinde bırakmasın.
   *
   * Depo hatasında bellek son iyi kopyadan yeniden açılır ve hata olduğu
   * gibi iletilir (sağlayıcı DbWriteError'a sarar). Başarıda bu baytlar yeni
   * "son iyi kopya" olur.
   */
  async persist() {
    if (this.#path === ':memory:' || !this.#dirty) return;
    const bytes = this.#db.export();
    this.#applySticky();
    try {
      await this.#store.save(this.#path, bytes);
    } catch (e) {
      this.#reopen(this.#lastGood);
      throw e;
    }
    this.#lastGood = bytes;
    this.#dirty = false;
  }

  /** Kapatmak kalıcılaştırmaz: yazılmamış değişiklik yoktur, her COMMIT zaten yazdı. */
  async close() { this.#db.close(); }

  /** Belleği verilen görüntüye (yoksa boş DB'ye) döndürür; yapışan PRAGMA'lar geri gelir. */
  #reopen(bytes: Uint8Array | null): void {
    try { this.#db.close(); } catch { /* zaten kapalı */ }
    this.#db = new this.#SQL.Database(bytes ?? undefined);
    this.#applySticky();
    this.#dirty = false;
  }

  #applySticky(): void {
    for (const sql of this.#sticky.values()) this.#db.run(sql);
  }

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
      // Açılıştaki görüntü depoyla uyuşan ilk "son iyi kopya"dır.
      return new Conn(SQL, db, path, o.store, bytes);
    },
  };
}
