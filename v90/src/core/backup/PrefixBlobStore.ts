// BlobStore'un anahtar-değer deposu üzerindeki gerçekleştirmesi — web hedefi
// (docs/v90/02-architecture.md §12.2, ADR-013). Tarayıcıda IdbKvStore ile,
// testte InMemoryKvStore ile koşar.
//
// Dizin yoktur; "dizin" = ortak önek. `photos/abc.jpg` anahtarı `photos`
// dizininin doğrudan çocuğudur; `list('photos')` yalnızca doğrudan çocukları
// (adında `/` olmayanları) döndürür, dizin işareti üretilmez.
//
// Düz ad alanı BackupImporter'ın değişimine yeter (02 §12.3 adım 5): importer
// `photos.import` → `photos`, `photos` → `photos.pre-import` yeniden
// adlandırmalarını yapar; burada bu, `photos.import/` önekli tüm anahtarların
// `photos/` önekine taşınmasıdır. Önekler birbirini kapsamaz (`photos/` ile
// `photos.import/` ayrıdır) ve her anahtar tek bir dizine ait olduğundan
// hiyerarşiye gerek kalmaz. Aynı gerekçeyle `photos.pre-import` geri alma
// kopyası da yan yana durabilir.
import type { BlobStore } from './BlobStore.ts';
import type { KvStore } from './KvStore.ts';

export class PrefixBlobStore implements BlobStore {
  readonly #kv: KvStore;
  constructor(kv: KvStore) { this.#kv = kv; }

  async list(dir: string): Promise<string[]> {
    const prefix = `${normalize(dir)}/`;
    return (await this.#kv.keys(prefix))
      .map((k) => k.slice(prefix.length))
      .filter((name) => name.length > 0 && !name.includes('/'));
  }

  async read(path: string): Promise<Uint8Array> {
    const v = await this.#kv.get(normalize(path));
    // Yerel karşılığı (expo File.bytes) da eksik dosyada fırlatır; sessiz boş
    // dizi dönmek fotoğraf sha256 doğrulamasını yanıltırdı.
    if (!v) throw new Error(`dosya yok: ${path}`);
    return v;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    await this.#kv.put(normalize(path), data);
  }

  async ensureDir(_dir: string): Promise<void> {
    // Dizin kavramı yok: ilk yazma "dizini" var eder. Hiçbir şey yazılmaz.
  }

  async removeDir(dir: string): Promise<void> {
    for (const k of await this.#kv.keys(`${normalize(dir)}/`)) await this.#kv.delete(k);
  }

  async remove(path: string): Promise<void> {
    await this.#kv.delete(normalize(path));
  }

  async rename(from: string, to: string): Promise<void> {
    // Dizin ve dosya için aynı semantik (yerel karşılığıyla bire bir):
    // hedef varsa önce temizlenir.
    const src = normalize(from);
    const dst = normalize(to);
    const srcPrefix = `${src}/`;
    const children = await this.#kv.keys(srcPrefix);
    if (children.length > 0) {
      await this.removeDir(dst);
      for (const k of children) {
        const v = await this.#kv.get(k);
        if (v) await this.#kv.put(`${dst}/${k.slice(srcPrefix.length)}`, v);
        await this.#kv.delete(k);
      }
      return;
    }
    const v = await this.#kv.get(src);
    if (!v) throw new Error(`yeniden adlandırılacak dosya yok: ${from}`);
    await this.#kv.put(dst, v);
    await this.#kv.delete(src);
  }

  async exists(path: string): Promise<boolean> {
    const p = normalize(path);
    if ((await this.#kv.get(p)) !== null) return true;
    return (await this.#kv.keys(`${p}/`)).length > 0;
  }
}

/**
 * Yol → anahtar. `.` ve `..` parçaları çözülür ki BackupImporter'ın
 * `photos.pre-import/../restore-point.json` gibi yolları yerel dosya sistemiyle
 * aynı yere (`restore-point.json`) düşsün; çift ve sondaki `/` atılır.
 */
export function normalize(path: string): string {
  const out: string[] = [];
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg);
  }
  return out.join('/');
}
