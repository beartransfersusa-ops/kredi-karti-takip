// Web depo tekilleri — web hedefi (02 §12.2, ADR-013).
//
// files.web.ts, db.web.ts ve blobs.web.ts AYNI örnekleri paylaşır: sql.js
// sağlayıcısı görüntüyü hangi depoya yazıyorsa MigrationRunner'ın yedeği ve
// BackupImporter'ın dosya değişimi de o depoyu görmelidir. Tembel kurulur:
// modül yüklenirken IndexedDB'ye dokunulmaz.
//
// Üç depo da TEK anahtarla (keyProvider) şifrelidir: DB görüntüsü
// (EncryptedImageStore), fotoğraflar / import-export dosyaları ve "geri al"
// kaydı (EncryptedKvStore). Düz IndexedDB depoları hiçbir zaman düz
// kullanıcı verisi görmez (R93.1, ADR-013); anahtar kaybı hepsini birlikte
// açılamaz kılar — ikinci bir anahtar/kurtarma yolu yoktur, yedek hatırlatılır.
import { EncryptedImageStore } from '../../core/db/EncryptedImageStore.ts';
import type { ImageStore } from '../../core/db/imageStore.ts';
import { EncryptedKvStore } from '../../core/backup/EncryptedKvStore.ts';
import type { KvStore } from '../../core/backup/KvStore.ts';
import { PrefixBlobStore } from '../../core/backup/PrefixBlobStore.ts';
import { IdbKvStore } from './idb.ts';
import { IdbImageStore } from './imageStore.ts';
import { IdbKeyProvider } from './keyProvider.ts';

let keys: IdbKeyProvider | null = null;
let images: ImageStore | null = null;
let blobs: PrefixBlobStore | null = null;
let metaKv: KvStore | null = null;

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

/**
 * Fotoğraflar ve içe/dışa aktarma dosyaları: anahtar adları düz, DEĞERLER
 * görüntüyle aynı anahtarla şifreli (R93.1). Yedek ZIP'i ise şifresizdir
 * (02 §12.2) — o kullanıcının elindeki dosyadır, bu ise tarayıcı profilinde
 * dinlenen veri.
 */
export function blobStore(): PrefixBlobStore {
  return (blobs ??= new PrefixBlobStore(new EncryptedKvStore(new IdbKvStore('blobs'), keyProvider())));
}

/** Küçük kayıtlar (geri alma penceresi vb.); değerler şifreli, yalnızca get/put/delete/keys. */
export function meta(): KvStore {
  return (metaKv ??= new EncryptedKvStore(new IdbKvStore('meta'), keyProvider()));
}
