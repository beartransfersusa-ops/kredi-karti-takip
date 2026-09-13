// Veritabanı sağlayıcısı — WEB: sql.js (SQLite → wasm, bellekte) + her commit
// sonrası AES-GCM-256 ile şifrelenmiş görüntü IndexedDB'de
// (docs/v90/02-architecture.md §12.2 web hedefi, ADR-013).
//
// Bu SQLCipher DEĞİLDİR ve öyle anlatılmaz (R93.4): SQLite düz bellekte çalışır,
// şifreleme görüntü düzeyinde WebCrypto ile yapılır. `isEncrypted` yalnızca
// sarmalayıcı gerçekten şifrelediği için true'dur (imageStore.ts sözleşmesi).
//
// Yerel karşılığı db.ts'tir (expo-sqlite + SQLCipher). Metro platforma göre
// birini seçer; web bundle'ında expo-sqlite, yerelde sql.js YOKTUR.
import { makeSqlJsProvider } from '../core/db/SqlJsProvider.ts';
import type { DatabaseProvider } from '../core/db/types.ts';
import { imageStore } from './web/stores.ts';
import { acquireTabLock } from './web/tabLock.ts';

// GitHub Pages alt yolu (/kredi-karti-takip): app.config `experiments.baseUrl`
// → expo-router'ın okuduğu EXPO_BASE_URL. sql-wasm.wasm `public/` altından
// aynı kökle sunulur; locateFile('sql-wasm.wasm') → '<base>/sql-wasm.wasm'.
const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');

/** Canlı DB ve yedek içe aktarma staging'i aynı üreticiden çıkar (aynı depo, aynı anahtar). */
export function makeProvider(path: string): DatabaseProvider {
  const inner = makeSqlJsProvider({
    path,
    store: imageStore(),
    locateFile: (file: string) => `${base}/${file}`,
  });
  return {
    get path() { return inner.path; },
    get isEncrypted() { return inner.isEncrypted; },
    async open() {
      // İki sekme aynı görüntüyü ezmesin: kilit alınamazsa DbOpenError (tabLock.ts).
      await acquireTabLock();
      return inner.open();
    },
  };
}
