// DB görüntüsü şifreleme anahtarı — web hedefi (02 §12.2, ADR-013; R93.5'in
// tarayıcı karşılığı).
//
// Anahtar `extractable: false` bir AES-GCM-256 CryptoKey olarak IndexedDB'nin
// "keys" deposunda durur. CryptoKey yapısal klonlanabilir; tarayıcı nesneyi
// saklar, baytlarını JS'e HİÇBİR ZAMAN vermez: kaynak kodda, normal depolamada,
// log'da ya da yedekte anahtar bulunmaz (R93.5, R93.6). Bu SQLCipher değildir
// ve öyle anlatılmaz (R93.4): şifreleme görüntü düzeyinde, WebCrypto ile yapılır.
//
// Anahtar kaybı = veri kaybı: kullanıcı site verisini temizlerse anahtar da
// gider ve şifreli görüntü kalıcı olarak açılamaz. Bu yüzden yedek hatırlatılır
// (02 §12.2) ve kalıcı depolama izni istenir (storage.web.ts).
import type { CryptoKeyLike, ImageKeyProvider } from '../../core/db/imageStore.ts';
import { idbAdd, idbDelete, idbGet } from './idb.ts';

export const WEB_DB_KEY_ID = 'v90.web.dbkey';

export class IdbKeyProvider implements ImageKeyProvider {
  #inFlight: Promise<CryptoKeyLike> | null = null;

  /** İlk çağrıda üretir, sonra hep aynısını döndürür. Eşzamanlı çağrılar tek isteği paylaşır. */
  getOrCreateKey(): Promise<CryptoKeyLike> {
    if (!this.#inFlight) {
      this.#inFlight = this.#load().catch((e: unknown) => { this.#inFlight = null; throw e; });
    }
    return this.#inFlight;
  }

  /** "Tüm verimi sil" akışı: anahtar gidince şifreli görüntü kalıcı olarak açılamaz. */
  async destroy(): Promise<void> {
    this.#inFlight = null;
    await idbDelete('keys', WEB_DB_KEY_ID);
  }

  async #load(): Promise<CryptoKeyLike> {
    const existing = await idbGet<CryptoKey>('keys', WEB_DB_KEY_ID);
    if (existing) return existing;

    if (typeof crypto === 'undefined' || !crypto.subtle) {
      // WebCrypto yalnızca güvenli bağlamda (https / localhost) vardır.
      throw new Error('WebCrypto yok: uygulama güvenli bağlamda (https) açılmalı');
    }
    const fresh = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,                                   // ÇIKARILAMAZ: JS baytları göremez
      ['encrypt', 'decrypt'],
    );
    try {
      // `add` (put değil): iki sekme aynı anda üretirse ikincisi ConstraintError
      // alır ve ilkinin anahtarını okur — üzerine yazsaydı ilk sekmenin
      // yazdığı görüntü açılamaz olurdu.
      await idbAdd('keys', WEB_DB_KEY_ID, fresh);
      return fresh;
    } catch (e) {
      const again = await idbGet<CryptoKey>('keys', WEB_DB_KEY_ID);
      if (again) return again;
      throw e;
    }
  }
}
