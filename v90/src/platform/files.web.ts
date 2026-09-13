// FileStore'un WEB karşılığı — migration yedeği ve import/export için.
// Yerel karşılığı: files.ts (aynı dışa aktarım adları; Metro platforma göre seçer).
//
// Web'de dosya yolu yoktur: FileStore görüntü deposu (IndexedDB + AES-GCM,
// 02 §12.2 web hedefi, ADR-013) üzerinde çalışır. `copy` = load + save, yani
// migration yedeği (`v90.sqlite.v3.bak`) de canlı görüntüyle aynı anahtarla
// şifreli durur. Depo db.web.ts ile PAYLAŞILIR (stores.ts): sağlayıcı neyi
// yazıyorsa MigrationRunner onu yedekler.
import { ImageFileStore } from '../core/db/ImageFileStore.ts';
import { imageStore } from './web/stores.ts';

export class PlatformFileStore extends ImageFileStore {
  constructor() { super(imageStore()); }
}

/**
 * Yerelde expo Directory döner; web'de belge dizini YOKTUR — her şey IndexedDB'de.
 * Modül şekli korunur (aynı dışa aktarım adı); çağıran yok, null döner.
 */
export function documentDir(): null { return null; }

/** Görüntü deposundaki ad; yol değil (imageStore.ts). Staging/pre-import türevleri bundan üretilir. */
export function databasePath(name = 'v90.sqlite'): string {
  return name;
}
