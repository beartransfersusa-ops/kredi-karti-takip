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
// Görüntü biçimi (bayt):
//   0..3   "V90E"  sihirli sayı
//   4      0x01    biçim sürümü
//   5..16  IV      12 rastgele bayt (her yazımda yeni)
//   17..   AES-GCM-256 şifreli metin (kimlik doğrulama etiketi dahil)

import { DbOpenError } from './errors.ts';
import type { CryptoKeyLike, ImageKeyProvider, ImageStore } from './imageStore.ts';

const MAGIC = new TextEncoder().encode('V90E');            // 4 bayt ASCII
const VERSION = 0x01;
const IV_BYTES = 12;
const HEADER_BYTES = MAGIC.length + 1 + IV_BYTES;

const OPEN_FAIL = 'veritabanı görüntüsü bu anahtarla açılamadı (yanlış anahtar ya da bozuk görüntü)';

/** Uint8Array<ArrayBufferLike> → WebCrypto'nun istediği ArrayBuffer destekli kopya. */
const asBuffer = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);

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
    return decrypt(raw, await this.#keys.getOrCreateKey());
  }

  async save(name: string, bytes: Uint8Array): Promise<void> {
    const key = await this.#keys.getOrCreateKey();
    await this.#inner.save(name, await encrypt(bytes, key));
  }

  remove(name: string): Promise<void> { return this.#inner.remove(name); }
  exists(name: string): Promise<boolean> { return this.#inner.exists(name); }
  /** Şifreli boyut (başlık + etiket dahil); alan hesabı için doğru olan budur. */
  size(name: string): Promise<number | null> { return this.#inner.size(name); }
  freeSpace(): Promise<number | null> { return this.#inner.freeSpace(); }
}

async function encrypt(plain: Uint8Array, key: CryptoKeyLike): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, asBuffer(plain));
  const out = new Uint8Array(HEADER_BYTES + cipher.byteLength);
  out.set(MAGIC, 0);
  out[MAGIC.length] = VERSION;
  out.set(iv, MAGIC.length + 1);
  out.set(new Uint8Array(cipher), HEADER_BYTES);
  return out;
}

async function decrypt(raw: Uint8Array, key: CryptoKeyLike): Promise<Uint8Array> {
  if (raw.byteLength < HEADER_BYTES || !MAGIC.every((b, i) => raw[i] === b) || raw[MAGIC.length] !== VERSION) {
    throw new DbOpenError(OPEN_FAIL);
  }
  const iv = asBuffer(raw.subarray(MAGIC.length + 1, HEADER_BYTES));
  const cipher = asBuffer(raw.subarray(HEADER_BYTES));
  try {
    const plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new Uint8Array(plain);
  } catch (e) {
    // Hata metnine anahtar da, görüntü de SIZMAZ (R93.5).
    throw new DbOpenError(OPEN_FAIL, e);
  }
}

/**
 * Test ve geliştirme anahtarı: yalnızca bellekte, çıkarılamaz (extractable:
 * false). Web'deki kalıcı sağlayıcı (src/platform/db.web.ts) aynı portu
 * IndexedDB'de saklanan CryptoKey ile uygular.
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
