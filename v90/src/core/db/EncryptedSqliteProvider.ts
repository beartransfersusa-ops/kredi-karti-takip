// Şifreli sağlayıcı — docs/v90/02-architecture.md §12.2, ADR-002 (R93.2).
//
// Production yolu: expo-sqlite (SQLCipher) + expo-secure-store'daki anahtar.
// Test yolu: aynı sınıf, sqlcipherNode sürücüsüyle — şifrelemenin gerçekten
// çalıştığı CI'da doğrulanır.

import { DbKeyManager } from './keys/DbKeyManager.ts';
import { ExpoSecureStore } from './keys/SecureStore.ts';
import type { SecureStore } from './keys/SecureStore.ts';
import { expoSqliteDriver } from './drivers/expoSqlite.ts';
import type { SqliteDriver } from './SqliteDriver.ts';
import { SqliteDatabaseProvider } from './SqliteDatabaseProvider.ts';

export interface EncryptedProviderOptions {
  path: string;
  /** Varsayılan: expo-sqlite. Testler sqlcipherNode verir. */
  driver?: SqliteDriver;
  /** Varsayılan: expo-secure-store (Keychain / Keystore). */
  secureStore?: SecureStore;
  keyManager?: DbKeyManager;
  /**
   * DB dosyası var mı? Verilirse, anahtar okunamadığında YENİ anahtar
   * üretilmez (ADR-002: mevcut şifreli veriyi kalıcı kilitlememek için).
   * Uygulama bunu FileStore.exists ile bağlar.
   */
  fileExists?: (path: string) => Promise<boolean>;
}

export class EncryptedSqliteProvider extends SqliteDatabaseProvider {
  constructor(o: EncryptedProviderOptions) {
    super({
      driver: o.driver ?? expoSqliteDriver,
      path: o.path,
      keyManager: o.keyManager ?? new DbKeyManager({
        secureStore: o.secureStore ?? new ExpoSecureStore(),
        ...(o.fileExists ? { dbExists: () => o.fileExists!(o.path) } : {}),
      }),
    });
  }
}
