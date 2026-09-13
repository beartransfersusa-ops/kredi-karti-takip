// Şifreli anahtar-değer deposu — docs/v90/02-architecture.md §12.2 (web), ADR-013.
//
// R93.1 ilerleme fotoğraflarını hassas veri sayar; ADR-013 düz deponun düz
// kullanıcı verisi GÖRMEMESİNİ ister. DB görüntüsü EncryptedImageStore ile
// şifreliyken fotoğraflar, içe/dışa aktarma staging dosyaları ve "geri al"
// kaydı IndexedDB "blobs"/"meta" depolarında düz duramaz. Bu sarmalayıcı
// her DEĞERİ aynı AES-GCM çerçevesiyle (core/db/aesGcm.ts) ve aynı anahtarla
// (ImageKeyProvider) şifreler: `put` şifreler, `get` çözer. Böylece anahtar
// kaybı = tüm web verisi kaybı ilkesi (02 §12.2) fotoğraflar için de tek ve
// aynıdır; ikinci bir anahtar yönetilmez.
//
// ANAHTARLAR (key) düz kalır — bilerek: `photos/id-…jpg`, `restorePoint` gibi
// dosya ADLARIDIR, içerik taşımazlar (fotoğraf adı üretilmiş kimliktir,
// R116.1) ve önek listesi (`keys('photos/')`) onlara ihtiyaç duyar. Düz kalan
// tek bilgi "kaç dosya var" ve uzantıdır; kabul edilen sızıntı budur.
//
// Boş değer (PrefixBlobStore'un dizin işareti, 0 bayt) de gidip gelir: boş
// düz metin AES-GCM'de geçerlidir, çıktı başlık + etikettir, `get` yine
// 0 bayt döndürür (boş dizi ile yok anahtar ayrımı — null — korunur).
import { decryptFrame, encryptFrame } from '../db/aesGcm.ts';
import type { ImageKeyProvider } from '../db/imageStore.ts';
import type { KvStore } from './KvStore.ts';

const READ_FAIL = 'kayıt bu anahtarla çözülemedi (yanlış anahtar ya da bozuk kayıt)';

export class EncryptedKvStore implements KvStore {
  readonly #inner: KvStore;
  readonly #keys: ImageKeyProvider;

  constructor(inner: KvStore, keys: ImageKeyProvider) {
    this.#inner = inner;
    this.#keys = keys;
  }

  async get(key: string): Promise<Uint8Array | null> {
    const raw = await this.#inner.get(key);
    if (raw === null) return null;
    // Hata metnine anahtar da, kayıt da SIZMAZ (R93.5); sınıf DbOpenError'dur
    // (aesGcm.ts): anahtar gittiyse görüntü de açılmaz, kullanıcı tek ekran görür.
    return decryptFrame(raw, await this.#keys.getOrCreateKey(), READ_FAIL);
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const k = await this.#keys.getOrCreateKey();
    await this.#inner.put(key, await encryptFrame(bytes, k));
  }

  delete(key: string): Promise<void> { return this.#inner.delete(key); }
  /** Anahtar adları düz: doğrudan iç depodan. */
  keys(prefix: string): Promise<string[]> { return this.#inner.keys(prefix); }
}
