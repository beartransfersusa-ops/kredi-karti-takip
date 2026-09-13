// sql.js sağlayıcısı — WEB (docs/v90/02-architecture.md §2.1, §12.2, ADR-013).
//
// Aynı SqliteDatabaseProvider, sql.js sürücüsüyle. Şifreleme deponun işidir
// (EncryptedImageStore); sağlayıcı `isEncrypted`'ı sürücünün `encryptsAtRest`
// beyanından alır. `keyManager` YOKTUR: SQLCipher yok, PRAGMA key yok (R93.4).
//
// Yalnızca `foreign_keys` uygulanır. DEFAULT_PRAGMAS'ın kalanı bellek içi
// motorda anlamsızdır:
//   • journal_mode = WAL   — WAL dosya sistemi + paylaşımlı bellek ister;
//                            bellekteki DB'de günlük yoktur, dayanıklılık
//                            görüntünün depoya yazılmasından gelir,
//   • synchronous = FULL   — fsync edecek dosya yok; deponun (IndexedDB)
//                            kendi atomik transaction'ı var,
//   • busy_timeout         — tek bağlantı, kilit bekleyecek başka süreç yok.
// Dayanıklılık modeli: her COMMIT → persist() → görüntünün tamamı depoya.
// Sekme kapanınca kaybolan tek şey henüz COMMIT edilmemiş transaction'dır;
// o da zaten SQLite'ta kaybolurdu.

import { sqlJsDriver } from './drivers/sqlJs.ts';
import type { ImageStore } from './imageStore.ts';
import { SqliteDatabaseProvider } from './SqliteDatabaseProvider.ts';
import type { DatabaseProvider } from './types.ts';

export interface SqlJsProviderOptions {
  /** Depo anahtarı ('v90.sqlite'); dosya yolu değildir. */
  path: string;
  store: ImageStore;
  locateFile?: (file: string) => string;
}

export const SQLJS_PRAGMAS: readonly string[] = ['PRAGMA foreign_keys = ON'];

export function makeSqlJsProvider(o: SqlJsProviderOptions): DatabaseProvider {
  return new SqliteDatabaseProvider({
    driver: sqlJsDriver({ store: o.store, ...(o.locateFile ? { locateFile: o.locateFile } : {}) }),
    path: o.path,
    pragmas: SQLJS_PRAGMAS,
  });
}
