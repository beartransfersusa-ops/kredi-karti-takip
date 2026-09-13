// Veritabanı GÖRÜNTÜSÜ deposu portu — docs/v90/02-architecture.md §12.2 (web hedefi), ADR-013.
//
// Web'de SQLCipher yoktur. Veritabanı bellekte (sql.js) çalışır ve her commit
// sonrasında dosyanın tamamı ("görüntü") tek parça hâlinde depoya yazılır.
// Bu port o depoyu soyutlar; böylece:
//   • sürücü (drivers/sqlJs.ts) IndexedDB'yi bilmez, Node testinde de koşar,
//   • şifreleme bir SARMALAYICI olarak araya girer (EncryptedImageStore):
//     düz depo bayt görür ama asla düz veritabanı görmez.
//
// Adlar dosya yolu DEĞİL, depo anahtarıdır ('v90.sqlite', 'v90.bak.v3.sqlite' — backupPathFor…).
// FileStore/MigrationRunner yedek kopyaları da aynı depoya aynı adlandırmayla
// yazar; bu yüzden `copy` semantiği load+save'dir.

export interface ImageStore {
  /** Görüntü yoksa null (0 bayt DEĞİL; boş dosya ile yok dosya ayrıdır). */
  load(name: string): Promise<Uint8Array | null>;
  /** Var olan görüntünün üzerine yazar. Atomik olmalıdır: yarım görüntü kalmaz. */
  save(name: string, bytes: Uint8Array): Promise<void>;
  /** Yoksa sessizce geçer. */
  remove(name: string): Promise<void>;
  exists(name: string): Promise<boolean>;
  /** Depodaki bayt sayısı (şifreliyse şifreli boyut); yoksa null. */
  size(name: string): Promise<number | null>;
  /** Yazılabilir boş alan (bayt). Bilinmiyorsa null. */
  freeSpace(): Promise<number | null>;
  /**
   * Depo, görüntüyü SQLite dışında şifreliyor mu? Sağlayıcının `isEncrypted`
   * bayrağı buradan türer (SqliteDriver.encryptsAtRest). Yalnızca gerçekten
   * şifreleyen sarmalayıcı true döndürür; düz depo false der, yalan söylemez.
   */
  readonly isEncrypted: boolean;
}

/** Test ve geliştirme için bellek deposu. Şifrelemez. */
export class InMemoryImageStore implements ImageStore {
  readonly #map = new Map<string, Uint8Array>();
  readonly isEncrypted = false;
  #free: number | null;

  constructor(freeSpace: number | null = null) { this.#free = freeSpace; }

  async load(name: string): Promise<Uint8Array | null> {
    const v = this.#map.get(name);
    return v ? new Uint8Array(v) : null;         // kopya: çağıran depoyu bozamaz
  }
  async save(name: string, bytes: Uint8Array): Promise<void> {
    this.#map.set(name, new Uint8Array(bytes));
  }
  async remove(name: string): Promise<void> { this.#map.delete(name); }
  async exists(name: string): Promise<boolean> { return this.#map.has(name); }
  async size(name: string): Promise<number | null> { return this.#map.get(name)?.byteLength ?? null; }
  async freeSpace(): Promise<number | null> { return this.#free; }

  /** Yalnızca testler için: depoda hangi adlar var? */
  names(): string[] { return [...this.#map.keys()]; }
  /** Yalnızca testler için: ham bayt (şifreli sarmalayıcı testinde "düz metin sızmadı" denetimi). */
  raw(name: string): Uint8Array | undefined { return this.#map.get(name); }
}

// ── Görüntü şifreleme anahtarı portu (EncryptedImageStore bunu kullanır).
//
// Tip, WebCrypto'nun kendi anahtar tipinden türetilir ki hem Node (tsconfig.json,
// @types/node) hem tarayıcı (tsconfig.app.json, DOM) derlemesinde aynı olsun.
export type CryptoKeyLike = Parameters<typeof globalThis.crypto.subtle.encrypt>[1];

/**
 * Anahtar üretici/deposu. Web'de anahtar `extractable: false` bir CryptoKey
 * olarak IndexedDB'de durur: JS tarafı anahtarın baytlarını hiçbir zaman
 * göremez (R93.5'in tarayıcı karşılığı). Anahtar kaybı = veri kaybı; bu yüzden
 * kullanıcıya yedek hatırlatılır (02 §12.2).
 */
export interface ImageKeyProvider {
  getOrCreateKey(): Promise<CryptoKeyLike>;
  /** "Tüm verimi sil" akışı: anahtar gidince şifreli görüntü kalıcı olarak açılamaz. */
  destroy(): Promise<void>;
}
