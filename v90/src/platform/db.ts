// Veritabanı sağlayıcısı — YEREL (iOS/Android): expo-sqlite + SQLCipher,
// anahtar expo-secure-store'da (docs/v90/02-architecture.md §12.2, ADR-002).
//
// Web karşılığı db.web.ts'tir (sql.js + AES-GCM görüntü, ADR-013). Metro
// platforma göre birini seçer; bu yüzden iOS/Android bundle'ında sql.js,
// web bundle'ında expo-sqlite YOKTUR. `scripts/check-bundle.mjs` bunu denetler.
import { EncryptedSqliteProvider } from '../core/db/EncryptedSqliteProvider.ts';
import type { DatabaseProvider } from '../core/db/types.ts';
import { PlatformFileStore } from './files.ts';

const files = new PlatformFileStore();

/** Canlı DB ve yedek içe aktarma staging'i aynı üreticiden çıkar (aynı anahtar). */
export function makeProvider(path: string): DatabaseProvider {
  return new EncryptedSqliteProvider({ path, fileExists: (p) => files.exists(p) });
}
