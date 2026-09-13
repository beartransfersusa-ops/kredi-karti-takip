// BlobStore'un WEB karşılığı — fotoğraflar ve import/export dosyaları.
// Yerel karşılığı: blobs.ts (aynı dışa aktarım adları; Metro platforma göre seçer).
//
// Fotoğraflar IndexedDB "blobs" deposunda düz anahtar altında, DEĞERİ AES-GCM
// ile şifreli durur (`photos/<file_name>`; PrefixBlobStore → EncryptedKvStore,
// stores.ts; R93.1). Galeriye YAZILMAZ, cloud sync YOKTUR (R116.1–R116.3):
// tarayıcının site verisi dışına çıkmazlar.
//
// Veritabanı GÖRÜNTÜLERİ istisnadır. BackupImporter canlı/staging/pre-import
// değişimini (02 §12.3 adım 5) BlobStore.rename ile yapar; yerelde DB ve
// fotoğraflar aynı dosya sistemindedir. Web'de görüntüler şifreli görüntü
// deposundadır (stores.ts → imageStore); RoutedBlobStore `.sqlite` uzantılı
// düz adları oraya yönlendirir ki değişim şifreli depoda, aynı anahtarla
// yapılsın. Aksi hâlde importer var olmayan bir anahtarı taşımaya çalışır ve
// import her zaman "değişim başarısız" ile geri alınırdı. Yönlendirme
// çekirdektedir (core/backup/RoutedBlobStore.ts) ve Node'da sınanır
// (test/webBackup.test.ts); burada yalnızca tekil depolar bağlanır.
import { RoutedBlobStore } from '../core/backup/RoutedBlobStore.ts';
import { blobStore, imageStore } from './web/stores.ts';

export class PlatformBlobStore extends RoutedBlobStore {
  constructor() { super(blobStore(), imageStore()); }
}

/** İlerleme fotoğrafları: "blobs" deposunda `photos/` öneki (R116.1, R116.2). */
export function photosDir(): string {
  return 'photos';
}
