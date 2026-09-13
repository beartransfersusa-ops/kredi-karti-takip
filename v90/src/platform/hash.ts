// Checksum'un Expo karşılığı — src/core/db/hash.ts portunun RN tarafı.
//
// `node:crypto` React Native'de YOKTUR; migration checksum'ı ve yedek
// sha256'sı burada expo-crypto ile hesaplanır. Aynı algoritma (SHA-256,
// lowercase hex) olduğu için Node'da üretilen checksum cihazda doğrulanır.
import * as Crypto from 'expo-crypto';
import type { BytesHasher, Hasher } from '../core/db/hash.ts';

export const expoSha256: Hasher = (text) =>
  Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

export const expoSha256Bytes: BytesHasher = async (bytes) => {
  // Uint8Array'in tampon türü SharedArrayBuffer olabilir; kopyalayarak
  // BufferSource sözleşmesini garantiye alıyoruz.
  const copy = new Uint8Array(bytes);
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, copy.buffer as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
};
