// Web depo tekilleri — web hedefi (02 §12.2, ADR-013).
//
// files.web.ts, db.web.ts ve blobs.web.ts AYNI örnekleri paylaşır: sql.js
// sağlayıcısı görüntüyü hangi depoya yazıyorsa MigrationRunner'ın yedeği ve
// BackupImporter'ın dosya değişimi de o depoyu görmelidir. Tembel kurulur:
// modül yüklenirken IndexedDB'ye dokunulmaz.
import { EncryptedImageStore } from '../../core/db/EncryptedImageStore.ts';
import type { ImageStore } from '../../core/db/imageStore.ts';
import { PrefixBlobStore } from '../../core/backup/PrefixBlobStore.ts';
import { IdbKvStore } from './idb.ts';
import { IdbImageStore } from './imageStore.ts';
import { IdbKeyProvider } from './keyProvider.ts';

let keys: IdbKeyProvider | null = null;
let images: ImageStore | null = null;
let blobs: PrefixBlobStore | null = null;
let metaKv: IdbKvStore | null = null;

/** Anahtar sağlayıcı ("Tüm verimi sil" akışı `destroy()` için buradan erişir). */
export function keyProvider(): IdbKeyProvider {
  return (keys ??= new IdbKeyProvider());
}

/**
 * DB görüntüsü deposu: düz IndexedDB deposu, AES-GCM-256 sarmalayıcısıyla.
 * `isEncrypted` sarmalayıcıdan gelir; düz depo tek başına false der (R93.4).
 */
export function imageStore(): ImageStore {
  return (images ??= new EncryptedImageStore(new IdbImageStore(), keyProvider()));
}

/** Fotoğraflar ve içe/dışa aktarma dosyaları (şifresiz; 02 §12.2 yedek ZIP'iyle aynı statü). */
export function blobStore(): PrefixBlobStore {
  return (blobs ??= new PrefixBlobStore(new IdbKvStore('blobs')));
}

/** Küçük kayıtlar (geri alma penceresi vb.). */
export function meta(): IdbKvStore {
  return (metaKv ??= new IdbKvStore('meta'));
}
