// Veritabanı şifreleme anahtarı — docs/v90/02-architecture.md §12.2, ADR-002.
//
// Anahtar yalnızca bellekte ve platform güvenli deposundadır:
//   • kaynak kodda veya normal depolamada plaintext olarak TUTULMAZ (R93.5)
//   • log'a, hata mesajına ve crash payload'una GİRMEZ (R118.2)
//   • yedeğin içine girmez — SecureStore'da durduğu için yapısal olarak hariç
//
// Anahtar kaybı = veri kaybı. Kullanıcıya düzenli yedek hatırlatması gösterilir.

import type { SecureStore } from './SecureStore.ts';

export const DB_KEY_ID = 'v90.dbkey';
export const KEY_BYTES = 32;                      // SQLCipher raw key: 256 bit

export type RandomBytes = (n: number) => Uint8Array | Promise<Uint8Array>;

export const webCryptoRandomBytes: RandomBytes = (n) => {
  const b = new Uint8Array(n);
  globalThis.crypto.getRandomValues(b);
  return b;
};

/**
 * Node'da ve polyfill'li RN'de WebCrypto; yoksa expo-crypto.
 *
 * Hermes `crypto.getRandomValues`'ı her kurulumda sağlamaz. Sessizce zayıf bir
 * kaynağa (Math.random) düşmek yerine expo-crypto'ya geçilir; ikisi de yoksa
 * hata verilir — şifreleme anahtarı tahmin edilebilir olamaz.
 */
export const defaultRandomBytes: RandomBytes = async (n) => {
  if (typeof globalThis.crypto?.getRandomValues === 'function') return webCryptoRandomBytes(n);
  const m = await import('expo-crypto');
  return m.getRandomBytes(n);
};

export class DbKeyError extends Error {
  constructor(message: string) { super(message); this.name = 'DbKeyError'; }
}

/**
 * Anahtar GEÇİCİ olarak okunamıyor — yoktur DEĞİL.
 *
 * iOS'ta ilk kilit açılmadan önce Keychain `null`/hata döndürür. Bu durumda
 * yeni anahtar üretmek mevcut şifreli veritabanını KALICI olarak açılamaz
 * hale getirirdi (ADR-002 riskler). Bu yüzden ayrı bir hata sınıfı var:
 * çağıran kısa bir bekleme ile yeniden dener, asla yeni anahtar üretmez.
 */
export class KeyUnavailableError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'KeyUnavailableError';
    this.cause = cause;
  }
}

export interface DbKeyManagerDeps {
  secureStore: SecureStore;
  randomBytes?: RandomBytes;
  keyId?: string;
  /**
   * Şifreli veritabanı dosyası zaten var mı? Varsa ve anahtar okunamıyorsa
   * yeni anahtar ÜRETİLMEZ (bkz. KeyUnavailableError).
   */
  dbExists?: () => Promise<boolean>;
}

export class DbKeyManager {
  readonly #store: SecureStore;
  readonly #random: RandomBytes;
  readonly #id: string;
  readonly #dbExists: (() => Promise<boolean>) | undefined;

  constructor(deps: DbKeyManagerDeps) {
    this.#store = deps.secureStore;
    this.#random = deps.randomBytes ?? defaultRandomBytes;
    this.#id = deps.keyId ?? DB_KEY_ID;
    this.#dbExists = deps.dbExists;
  }

  /** 64 karakterlik hex. İlk çağrıda üretir, sonra hep aynısını döndürür. */
  async getOrCreate(): Promise<string> {
    let existing: string | null;
    try {
      existing = await this.#store.get(this.#id);
    } catch (e) {
      // Güvenli depo hata verdi (cihaz kilitli, Keystore erişilemiyor…).
      // "Anahtar yok" ile karıştırılmaz; yeni anahtar üretilmez.
      throw new KeyUnavailableError('güvenli depo şu an okunamıyor', e);
    }

    if (existing != null) {
      if (!isValidKey(existing)) {
        // Hata mesajına anahtarın KENDİSİ yazılmaz; yalnızca uzunluk.
        throw new DbKeyError(`güvenli depodaki anahtar geçersiz (uzunluk ${existing.length})`);
      }
      return existing;
    }

    // Anahtar yok. Korunacak bir veritabanı VARSA bu "ilk açılış" değildir:
    // yeni anahtar üretmek eski veriyi kalıcı olarak kilitler.
    if (this.#dbExists && (await this.#dbExists())) {
      throw new KeyUnavailableError(
        'şifreli veritabanı var ama anahtar okunamadı — yeni anahtar üretilmeyecek');
    }

    const bytes = await this.#random(KEY_BYTES);
    if (bytes.length !== KEY_BYTES) throw new DbKeyError('rastgele üretici yanlış uzunlukta veri verdi');
    if (bytes.every((b) => b === 0)) throw new DbKeyError('rastgele üretici sıfır dizi verdi');
    const hex = toHex(bytes);
    await this.#store.set(this.#id, hex);
    return hex;
  }

  async exists(): Promise<boolean> {
    return (await this.#store.get(this.#id)) != null;
  }

  /** "Tüm verimi sil" akışı: anahtar gidince şifreli DB kalıcı olarak açılamaz. */
  async destroy(): Promise<void> {
    await this.#store.remove(this.#id);
  }
}

export function isValidKey(k: string): boolean {
  return k.length === KEY_BYTES * 2 && /^[0-9a-f]+$/.test(k);
}

function toHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, '0');
  return s;
}
