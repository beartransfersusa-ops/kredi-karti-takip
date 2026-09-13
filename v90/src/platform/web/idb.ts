// IndexedDB erişimi — web hedefi (docs/v90/02-architecture.md §12.2, ADR-013).
//
// Tek veritabanı ("v90", sürüm 1), dört nesne deposu:
//   images  şifreli DB görüntüleri (EncryptedImageStore → IdbImageStore)
//   blobs   fotoğraflar ve içe/dışa aktarma dosyaları (PrefixBlobStore; değerler
//           EncryptedKvStore ile şifreli, anahtar adları düz)
//   keys    AES-GCM CryptoKey (IdbKeyProvider) — çıkarılamaz nesne
//   meta    küçük kayıtlar (geri alma penceresi vb.; değerler şifreli)
//
// Dayanıklılık: her işlem kendi transaction'ını açar ve isteğin `success`
// olayına değil, transaction'ın `complete` olayına kadar bekler. `success`
// yalnızca isteğin işlendiğini söyler; yazma ancak `complete` ile kalıcıdır.
// DB görüntüsü tek anahtar altında tek `put` olduğu için yarım görüntü kalmaz
// (ImageStore.save atomiklik sözleşmesi).
import type { KvStore } from '../../core/backup/KvStore.ts';

export const IDB_NAME = 'v90';
export const IDB_VERSION = 1;
export const IDB_STORES = ['images', 'blobs', 'keys', 'meta'] as const;
export type IdbStoreName = (typeof IDB_STORES)[number];

let opening: Promise<IDBDatabase> | null = null;

/** Tek bağlantı; ilk çağrıda açılır, şema yoksa kurulur. */
export function openIdb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB yok: tarayıcı desteklemiyor ya da gizli pencerede kapalı'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of IDB_STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Başka bir sekme sürüm yükseltirse ya da kullanıcı siteyi temizlerse
      // bağlantı kapanır; sonraki çağrı yeniden açar.
      db.onversionchange = () => { db.close(); opening = null; };
      db.onclose = () => { opening = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB açılamadı'));
    req.onblocked = () => reject(new Error('IndexedDB açılışı başka bir sekme tarafından engellendi'));
  });
  opening.catch(() => { opening = null; });      // başarısız açılış önbelleğe alınmaz
  return opening;
}

/**
 * Tek transaction'da tek istek; sonuç transaction TAMAMLANINCA döner.
 * Hata hâlinde transaction otomatik geri alınır.
 */
export function idbRun<T>(
  store: IdbStoreName, mode: IDBTransactionMode,
  op: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openIdb().then((db) => new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(store, mode); }
    catch (e) { reject(e); return; }
    let result: T;
    let failed: unknown = null;
    const req = op(tx.objectStore(store));
    req.onsuccess = () => { result = req.result; };
    req.onerror = () => { failed = req.error; };
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(failed ?? tx.error ?? new Error('IndexedDB işlemi başarısız'));
    tx.onabort = () => reject(failed ?? tx.error ?? new Error('IndexedDB işlemi iptal edildi'));
  }));
}

export function idbGet<T>(store: IdbStoreName, key: string): Promise<T | undefined> {
  return idbRun<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
}

export function idbPut(store: IdbStoreName, key: string, value: unknown): Promise<void> {
  return idbRun(store, 'readwrite', (s) => s.put(value, key)).then(() => undefined);
}

/** Anahtar zaten varsa ConstraintError ile başarısız olur (put'un aksine). */
export function idbAdd(store: IdbStoreName, key: string, value: unknown): Promise<void> {
  return idbRun(store, 'readwrite', (s) => s.add(value, key)).then(() => undefined);
}

export function idbDelete(store: IdbStoreName, key: string): Promise<void> {
  return idbRun(store, 'readwrite', (s) => s.delete(key));
}

export function idbCount(store: IdbStoreName, key: string): Promise<number> {
  return idbRun(store, 'readonly', (s) => s.count(key));
}

/** Verilen önekle başlayan tüm anahtarlar (string anahtarlar için). */
export function idbKeys(store: IdbStoreName, prefix: string): Promise<string[]> {
  // U+FFFF string sıralamasında önekin her devamının üstünde kalır:
  // [prefix, prefix + '\uffff'] aralığı tam olarak "prefix ile başlayanlar"dır.
  const range = IDBKeyRange.bound(prefix, `${prefix}\uffff`);
  return idbRun(store, 'readonly', (s) => s.getAllKeys(range))
    .then((keys) => keys.filter((k): k is string => typeof k === 'string'));
}

/** KvStore portunun IndexedDB gerçekleştirmesi: tek nesne deposu, bayt değerler. */
export class IdbKvStore implements KvStore {
  readonly #store: IdbStoreName;
  constructor(store: IdbStoreName) { this.#store = store; }

  async get(key: string): Promise<Uint8Array | null> {
    const v = await idbGet<unknown>(this.#store, key);
    if (v instanceof Uint8Array) return v;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    return null;
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    // Kopya: çağıranın tamponu (ör. sql.js'in wasm belleği) sonradan değişebilir
    // ve yapısal klonlama SharedArrayBuffer görünümlerini reddeder.
    await idbPut(this.#store, key, new Uint8Array(bytes));
  }
  async delete(key: string): Promise<void> { await idbDelete(this.#store, key); }
  async keys(prefix: string): Promise<string[]> { return idbKeys(this.#store, prefix); }
  async has(key: string): Promise<boolean> { return (await idbCount(this.#store, key)) > 0; }
}
