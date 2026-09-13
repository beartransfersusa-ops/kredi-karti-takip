// Checksum'un Node gerçekleştirmesi — TEST VE SCRIPT İÇİN.
//
// Uygulama bundle'ına GİRMEZ: React Native'de `node:crypto` yoktur ve
// oraya `src/platform/hash.ts` (expo-crypto) girer. İkisi de SHA-256
// lowercase hex ürettiği için Node'da yazılan checksum cihazda doğrulanır.
import type { BytesHasher, Hasher } from './hash.ts';

export const nodeSha256: Hasher = async (text) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text, 'utf8').digest('hex');
};

export const nodeSha256Bytes: BytesHasher = async (bytes) => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
};
