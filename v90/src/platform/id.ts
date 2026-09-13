// Kimlik üretiminin Expo karşılığı — src/core/id.ts portunun RN tarafı.
//
// Hermes `crypto.randomUUID`'yi her kurulumda sağlamaz; expo-crypto sağlar.
// Zayıf bir üreticiye (Math.random) sessizce düşülmez: `command_id` ve satır
// kimlikleri çakışırsa idempotent komut modeli bozulur.
import * as Crypto from 'expo-crypto';
import type { IdGenerator } from '../core/id.ts';

export const newId: IdGenerator = () =>
  (typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : Crypto.randomUUID());
