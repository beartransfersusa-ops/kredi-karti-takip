// BlobStore'un WEB karşılığı — fotoğraflar ve import/export dosyaları.
// Yerel karşılığı: blobs.ts (aynı dışa aktarım adları; Metro platforma göre seçer).
//
// Fotoğraflar IndexedDB "blobs" deposunda düz anahtar olarak durur
// (`photos/<file_name>`; PrefixBlobStore). Galeriye YAZILMAZ, cloud sync
// YOKTUR (R116.1–R116.3): tarayıcının site verisi dışına çıkmazlar.
//
// Veritabanı GÖRÜNTÜLERİ istisnadır. BackupImporter canlı/staging/pre-import
// değişimini (02 §12.3 adım 5) BlobStore.rename ile yapar; yerelde DB ve
// fotoğraflar aynı dosya sistemindedir. Web'de görüntüler şifreli görüntü
// deposundadır (stores.ts → imageStore); bu sınıf `.sqlite` uzantılı düz
// adları oraya yönlendirir ki değişim şifreli depoda, aynı anahtarla yapılsın.
// Aksi hâlde importer var olmayan bir anahtarı taşımaya çalışır ve import
// her zaman "değişim başarısız" ile geri alınırdı.
import type { BlobStore } from '../core/backup/BlobStore.ts';
import { blobStore, imageStore } from './web/stores.ts';

/** `v90.sqlite`, `v90.import.sqlite`, `v90.pre-import.sqlite` — dizinsiz, `.sqlite` sonlu. */
const isImageName = (path: string): boolean => !path.includes('/') && path.endsWith('.sqlite');

export class PlatformBlobStore implements BlobStore {
  async list(path: string): Promise<string[]> {
    return isImageName(path) ? [] : blobStore().list(path);
  }

  async read(path: string): Promise<Uint8Array> {
    if (!isImageName(path)) return blobStore().read(path);
    const v = await imageStore().load(path);
    if (!v) throw new Error(`dosya yok: ${path}`);
    return v;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    if (isImageName(path)) await imageStore().save(path, data);
    else await blobStore().write(path, data);
  }

  async ensureDir(path: string): Promise<void> {
    if (!isImageName(path)) await blobStore().ensureDir(path);
  }

  async removeDir(path: string): Promise<void> {
    // Yerelde dosya yolu için `Directory.exists` false'tur ve işlem atlanır;
    // görüntü adı için aynı: dokunulmaz.
    if (!isImageName(path)) await blobStore().removeDir(path);
  }

  async remove(path: string): Promise<void> {
    if (isImageName(path)) await imageStore().remove(path);
    else await blobStore().remove(path);
  }

  async rename(from: string, to: string): Promise<void> {
    if (!isImageName(from) && !isImageName(to)) { await blobStore().rename(from, to); return; }
    // Görüntü taşıma = yükle + kaydet + sil (şifreli depo `rename` bilmez).
    // Hedef varsa üzerine yazılır — yerel semantikle aynı.
    const bytes = await this.read(from);
    await this.write(to, bytes);
    await this.remove(from);
  }

  async exists(path: string): Promise<boolean> {
    return isImageName(path) ? imageStore().exists(path) : blobStore().exists(path);
  }
}

/** İlerleme fotoğrafları: "blobs" deposunda `photos/` öneki (R116.1, R116.2). */
export function photosDir(): string {
  return 'photos';
}
