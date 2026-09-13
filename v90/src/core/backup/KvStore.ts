// Anahtar-değer ikili depo portu — docs/v90/02-architecture.md §12.2 (web hedefi), ADR-013.
//
// Web'de dosya sistemi yoktur; fotoğraflar, içe/dışa aktarma dosyaları ve
// küçük meta kayıtlar IndexedDB'de anahtar → bayt olarak durur. Bu port o
// depoyu soyutlar; böylece:
//   • PrefixBlobStore (BlobStore'un web karşılığı) IndexedDB'yi bilmez ve
//     Node testinde InMemoryKvStore ile koşar,
//   • tarayıcı gerçekleştirmesi (platform/web/idb.ts) yalnızca dört işlemi bilir.
//
// Anahtarlar düz string'dir ('photos/abc.jpg'); dizin kavramı yoktur, önek
// aramasıyla (`keys('photos/')`) taklit edilir; boş dizin için PrefixBlobStore
// `"<dir>/"` anahtarına 0 baytlık işaret koyar (boş değer geçerlidir).
// Tarayıcıda değerler EncryptedKvStore ile şifrelenir (R93.1); anahtar adları düz kalır.

export interface KvStore {
  /** Anahtar yoksa null (boş dizi DEĞİL). */
  get(key: string): Promise<Uint8Array | null>;
  /** Var olanın üzerine yazar. Tek anahtar = tek atomik yazma. */
  put(key: string, bytes: Uint8Array): Promise<void>;
  /** Yoksa sessizce geçer. */
  delete(key: string): Promise<void>;
  /** Verilen önekle başlayan TÜM anahtarlar (iç içe olanlar dahil), sıralı. */
  keys(prefix: string): Promise<string[]>;
}

/** Test ve geliştirme için bellek deposu. */
export class InMemoryKvStore implements KvStore {
  readonly #map = new Map<string, Uint8Array>();

  async get(key: string): Promise<Uint8Array | null> {
    const v = this.#map.get(key);
    return v ? new Uint8Array(v) : null;         // kopya: çağıran depoyu bozamaz
  }
  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.#map.set(key, new Uint8Array(bytes));
  }
  async delete(key: string): Promise<void> { this.#map.delete(key); }
  async keys(prefix: string): Promise<string[]> {
    return [...this.#map.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  /** Yalnızca testler için: depoda kaç anahtar var? */
  get size(): number { return this.#map.size; }
}
