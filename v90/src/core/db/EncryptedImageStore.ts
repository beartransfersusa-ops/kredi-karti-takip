// Şifreli görüntü deposu — docs/v90/02-architecture.md §12.2 (web), ADR-013.
//
// Düz depo (IndexedDB, testte bellek) HİÇBİR ZAMAN düz veritabanı görmez:
// `save` şifreler, `load` çözer. Anahtar WebCrypto'nun `extractable: false`
// CryptoKey'idir; JS tarafı baytlarını göremez, bu dosya da görmez (R93.5).
//
// Bu SQLCipher DEĞİLDİR (R93.4): SQLite düz bellekte çalışır, yalnızca
// depoya yazılan görüntü şifrelidir. Sağlayıcı `isEncrypted = true` demeyi
// yalnızca bu sarmalayıcının beyanından türetir.
//
// Görüntü biçimi ("V90E" | 0x01 | IV | AES-GCM şifreli metin) aesGcm.ts'te
// tanımlıdır ve EncryptedKvStore (fotoğraflar, meta) ile PAYLAŞILIR; biçim
// değişmemiştir, yalnızca ortak dosyaya taşınmıştır.

import { decryptFrame, encryptFrame } from './aesGcm.ts';
import type { CryptoKeyLike, ImageKeyProvider, ImageStore } from './imageStore.ts';

const OPEN_FAIL = 'veritabanı görüntüsü bu anahtarla açılamadı (yanlış anahtar ya da bozuk görüntü)';

export class EncryptedImageStore implements ImageStore {
  readonly isEncrypted = true;
  readonly #inner: ImageStore;
  readonly #keys: ImageKeyProvider;

  constructor(inner: ImageStore, keys: ImageKeyProvider) {
    this.#inner = inner;
    this.#keys = keys;
  }

  async load(name: string): Promise<Uint8Array | null> {
    const raw = await this.#inner.load(name);
    if (raw === null) return null;
    // Hata metnine anahtar da, görüntü de SIZMAZ (R93.5).
    return decryptFrame(raw, await this.#keys.getOrCreateKey(), OPEN_FAIL);
  }

  async save(name: string, bytes: Uint8Array): Promise<void> {
    const key = await this.#keys.getOrCreateKey();
    await this.#inner.save(name, await encryptFrame(bytes, key));
  }

  remove(name: string): Promise<void> { return this.#inner.remove(name); }
  exists(name: string): Promise<boolean> { return this.#inner.exists(name); }
  /** Şifreli boyut (başlık + etiket dahil); alan hesabı için doğru olan budur. */
  size(name: string): Promise<number | null> { return this.#inner.size(name); }
  freeSpace(): Promise<number | null> { return this.#inner.freeSpace(); }
}

/**
 * Test ve geliştirme anahtarı: yalnızca bellekte, çıkarılamaz (extractable:
 * false). Web'deki kalıcı sağlayıcı (src/platform/web/keyProvider.ts) aynı
 * portu IndexedDB'de saklanan CryptoKey ile uygular.
 */
export class InMemoryKeyProvider implements ImageKeyProvider {
  #key: CryptoKeyLike | null = null;

  async getOrCreateKey(): Promise<CryptoKeyLike> {
    if (!this.#key) {
      this.#key = await globalThis.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    return this.#key;
  }

  /** Anahtar unutulur: bu depoyla yazılmış görüntüler bir daha açılamaz. */
  async destroy(): Promise<void> { this.#key = null; }
}
