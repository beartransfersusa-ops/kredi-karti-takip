// AES-GCM-256 çerçevesi — docs/v90/02-architecture.md §12.2 (web), ADR-013 Karar 3.
//
// Web'de dinlenen HER kullanıcı verisi aynı çerçeveyle şifrelenir: DB görüntüsü
// (EncryptedImageStore) ve fotoğraflar / içe-dışa aktarma dosyaları / "geri al"
// kaydı (EncryptedKvStore, R93.1). Tek yerde durur ki görüntü biçimi ile depo
// biçimi ayrışmasın; `V90E` izi web bundle denetiminde zorunludur
// (scripts/check-bundle.mjs web).
//
// Çerçeve (bayt):
//   0..3   "V90E"  sihirli sayı
//   4      0x01    biçim sürümü (parola türevi ikinci faktör için ayrılmıştır, ADR-013 alt. F)
//   5..16  IV      12 rastgele bayt (her yazımda yeni: aynı içerik iki kez aynı çıktıyı vermez)
//   17..   AES-GCM-256 şifreli metin (kimlik doğrulama etiketi dahil)
//
// Boş düz metin de geçerlidir: çıktı yalnızca başlık + 16 baytlık etikettir
// (PrefixBlobStore'un 0 baytlık dizin işareti aynen geri döner).
//
// Anahtar WebCrypto'nun `extractable: false` CryptoKey'idir; bu dosya baytlarını
// hiçbir zaman görmez. Hata metnine anahtar da veri de SIZMAZ (R93.5): çağıran
// sabit bir mesaj verir, `cause` yalnızca tanı için taşınır.

import { DbOpenError } from './errors.ts';
import type { CryptoKeyLike } from './imageStore.ts';

export const FRAME_MAGIC: Uint8Array = new TextEncoder().encode('V90E');   // 4 bayt ASCII
export const FRAME_VERSION = 0x01;
export const FRAME_IV_BYTES = 12;
export const FRAME_HEADER_BYTES = FRAME_MAGIC.length + 1 + FRAME_IV_BYTES;

/** Uint8Array<ArrayBufferLike> → WebCrypto'nun istediği ArrayBuffer destekli kopya. */
const asBuffer = (b: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(b);

/** Başlık biçimsel olarak geçerli mi? Etiketi DOĞRULAMAZ; yalnızca "bu bizim çerçevemiz mi". */
export function isFrame(raw: Uint8Array): boolean {
  return raw.byteLength >= FRAME_HEADER_BYTES
    && FRAME_MAGIC.every((b, i) => raw[i] === b)
    && raw[FRAME_MAGIC.length] === FRAME_VERSION;
}

export async function encryptFrame(plain: Uint8Array, key: CryptoKeyLike): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(FRAME_IV_BYTES));
  const cipher = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, asBuffer(plain));
  const out = new Uint8Array(FRAME_HEADER_BYTES + cipher.byteLength);
  out.set(FRAME_MAGIC, 0);
  out[FRAME_MAGIC.length] = FRAME_VERSION;
  out.set(iv, FRAME_MAGIC.length + 1);
  out.set(new Uint8Array(cipher), FRAME_HEADER_BYTES);
  return out;
}

/**
 * Başlık tutmaz ya da GCM etiketi doğrulanmazsa `DbOpenError(failMessage, cause)`.
 * Sınıf her veri türü için aynıdır: anahtar kaybı tek bir kaydı değil TÜM web
 * verisini açılamaz kılar; kullanıcı aynı ekranı (06 B.16.1) görür.
 */
export async function decryptFrame(raw: Uint8Array, key: CryptoKeyLike, failMessage: string): Promise<Uint8Array> {
  if (!isFrame(raw)) throw new DbOpenError(failMessage);
  const iv = asBuffer(raw.subarray(FRAME_MAGIC.length + 1, FRAME_HEADER_BYTES));
  const cipher = asBuffer(raw.subarray(FRAME_HEADER_BYTES));
  try {
    const plain = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new Uint8Array(plain);
  } catch (e) {
    throw new DbOpenError(failMessage, e);
  }
}
