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
//
// ÖNBELLEK YOKTUR — bilerek. Çözülen anahtar bu nesnede tutulsaydı, site
// verisi temizlendiğinde ya da bağlantı düştüğünde (idb.ts versionchange/close
// bağlantıyı bırakır) depodaki anahtar giderken bellekteki kalır; sonraki
// görüntü ESKİ anahtarla şifrelenir ve yeniden yüklemede depoda olmayan bir
// anahtarı ister → kalıcı DbOpenError. Her çağrı anahtarı IndexedDB'den okur;
// bu tek bir `get`tir ve persist yalnızca gerçekten yazan transaction'larda
// çağrılır (sqlJs.ts kirli bayrağı). Yalnızca ÜRETİM anı tekilleştirilir.
import type { CryptoKeyLike, ImageKeyProvider } from '../../core/db/imageStore.ts';
import { idbAdd, idbDelete, idbGet } from './idb.ts';

export const WEB_DB_KEY_ID = 'v90.web.dbkey';

export class IdbKeyProvider implements ImageKeyProvider {
  /** Eşzamanlı ilk çağrılar tek üretimi paylaşır; sonuçlanınca (başarı ya da hata) temizlenir. */
  #creating: Promise<CryptoKeyLike> | null = null;

  /** Depodan okur; yoksa üretip `add` ile yazar. Sonuç önbelleğe ALINMAZ (üstteki gerekçe). */
  async getOrCreateKey(): Promise<CryptoKeyLike> {
    const existing = await idbGet<CryptoKey>('keys', WEB_DB_KEY_ID);
    if (existing) return existing;
    if (!this.#creating) {
      this.#creating = this.#create().finally(() => { this.#creating = null; });
    }
    return this.#creating;
  }

  /** "Tüm verimi sil" akışı: anahtar gidince şifreli görüntü kalıcı olarak açılamaz. */
  async destroy(): Promise<void> {
    // Süren bir üretim varsa önce bitsin ki silme onun `add`'inden sonra gelsin.
    if (this.#creating) await this.#creating.catch(() => { /* üretim başarısızsa silecek şey yok */ });
    await idbDelete('keys', WEB_DB_KEY_ID);
  }

  async #create(): Promise<CryptoKeyLike> {
    if (typeof crypto === 'undefined' || !crypto.subtle) {
      // WebCrypto yalnızca güvenli bağlamda vardır; db.web.ts bunu açılışta
      // DbOpenError olarak yakalar, burası son savunmadır.
      throw new Error('WebCrypto yok: uygulama güvenli bağlamda (https ya da localhost) açılmalı');
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
