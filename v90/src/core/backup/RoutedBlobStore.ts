// Görüntü adlarını görüntü deposuna yönlendiren BlobStore — web hedefi
// (docs/v90/02-architecture.md §12.2, §12.3 adım 5; ADR-013 Karar 6).
//
// BackupImporter canlı/staging/pre-import değişimini BlobStore.rename ile
// yapar; yerelde DB dosyası ve fotoğraflar aynı dosya sistemindedir. Web'de
// görüntüler şifreli görüntü deposundadır (ImageStore), fotoğraflar ve
// import/export dosyaları ise anahtar-değer deposunda (PrefixBlobStore). Bu
// sınıf `.sqlite` uzantılı DİZİNSİZ adları (`v90.sqlite`, `v90.import.sqlite`,
// `v90.pre-import.sqlite`) görüntü deposuna, kalan her yolu iç BlobStore'a
// yönlendirir; böylece değişim şifreli depoda, aynı anahtarla yapılır. Aksi
// hâlde importer var olmayan bir anahtarı taşımaya çalışır ve import her
// zaman "değişim başarısız" ile geri alınırdı.
//
// Çekirdekte durur ki Node'da InMemoryImageStore + InMemoryKvStore ile
// sınanabilsin (test/webBackup.test.ts); tarayıcı sınıfı (platform/blobs.web.ts)
// yalnızca tekil depoları bağlar.
import type { ImageStore } from '../db/imageStore.ts';
import type { BlobStore } from './BlobStore.ts';

/** `v90.sqlite`, `v90.import.sqlite`, `v90.pre-import.sqlite` — dizinsiz, `.sqlite` sonlu. */
export const isImageName = (path: string): boolean => !path.includes('/') && path.endsWith('.sqlite');

export class RoutedBlobStore implements BlobStore {
  readonly #inner: BlobStore;
  readonly #images: ImageStore;

  constructor(inner: BlobStore, images: ImageStore) {
    this.#inner = inner;
    this.#images = images;
  }

  async list(path: string): Promise<string[]> {
    // Görüntü bir dosyadır, dizin değil: çocuğu yoktur.
    return isImageName(path) ? [] : this.#inner.list(path);
  }

  async read(path: string): Promise<Uint8Array> {
    if (!isImageName(path)) return this.#inner.read(path);
    const v = await this.#images.load(path);
    if (v === null) throw new Error(`dosya yok: ${path}`);
    return v;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    if (isImageName(path)) await this.#images.save(path, data);
    else await this.#inner.write(path, data);
  }

  async ensureDir(path: string): Promise<void> {
    if (!isImageName(path)) await this.#inner.ensureDir(path);
  }

  async removeDir(path: string): Promise<void> {
    // Yerelde dosya yolu için `Directory.exists` false'tur ve işlem atlanır;
    // görüntü adı için aynı: dokunulmaz.
    if (!isImageName(path)) await this.#inner.removeDir(path);
  }

  async remove(path: string): Promise<void> {
    if (isImageName(path)) await this.#images.remove(path);
    else await this.#inner.remove(path);
  }

  async rename(from: string, to: string): Promise<void> {
    if (!isImageName(from) && !isImageName(to)) { await this.#inner.rename(from, to); return; }
    // Görüntü taşıma = yükle + kaydet + sil (görüntü deposu `rename` bilmez).
    // Hedef varsa üzerine yazılır; kaynak yoksa fırlatır — yerel semantikle aynı.
    const bytes = await this.read(from);
    await this.write(to, bytes);
    await this.remove(from);
  }

  async exists(path: string): Promise<boolean> {
    return isImageName(path) ? this.#images.exists(path) : this.#inner.exists(path);
  }
}
