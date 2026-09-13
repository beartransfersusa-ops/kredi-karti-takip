// BlobStore'un anahtar-değer deposu üzerindeki gerçekleştirmesi — web hedefi
// (docs/v90/02-architecture.md §12.2, ADR-013). Tarayıcıda IdbKvStore ile
// (EncryptedKvStore sarmalı), testte InMemoryKvStore ile koşar.
//
// "Dizin" = ortak önek + gizli işaret. `photos/abc.jpg` anahtarı `photos`
// dizininin doğrudan çocuğudur; `list('photos')` yalnızca doğrudan çocukları
// (adında `/` olmayanları) döndürür. `ensureDir(dir)` BOŞ dizini de var
// edebilmek için `"<dir>/"` anahtarına (sondaki `/`, boş ad) 0 baytlık bir
// işaret koyar: BackupImporter fotoğrafsız bir yedekte `ensureDir(staging)`
// → 0 dosya → `rename(staging, photos)` sırasını izler ve yerel dosya
// sisteminde boş dizin taşınabildiği için burada da taşınabilmelidir; işaret
// olmasaydı rename "dosya yok" derdi ve fotoğrafsız her import geri alınırdı
// (R95.7 ihlali değil ama import imkânsız). İşaret `list`te görünmez (boş ad
// elenir), `exists`te dizini var sayar, `rename` ve `removeDir` ile birlikte
// taşınır/silinir.
//
// Düz ad alanı BackupImporter'ın değişimine yeter (02 §12.3 adım 5): importer
// `photos.import` → `photos`, `photos` → `photos.pre-import` yeniden
// adlandırmalarını yapar; burada bu, `photos.import/` önekli tüm anahtarların
// (işaret dahil) `photos/` önekine taşınmasıdır. Önekler birbirini kapsamaz
// (`photos/` ile `photos.import/` ayrıdır) ve her anahtar tek bir dizine ait
// olduğundan hiyerarşiye gerek kalmaz. Aynı gerekçeyle `photos.pre-import`
// geri alma kopyası da yan yana durabilir.
import type { BlobStore } from './BlobStore.ts';
import type { KvStore } from './KvStore.ts';

export class PrefixBlobStore implements BlobStore {
  readonly #kv: KvStore;
  constructor(kv: KvStore) { this.#kv = kv; }

  async list(dir: string): Promise<string[]> {
    const prefix = dirPrefix(dir);
    return (await this.#kv.keys(prefix))
      .map((k) => k.slice(prefix.length))
      .filter((name) => name.length > 0 && !name.includes('/'));   // işaret (boş ad) ve iç içe olanlar gizli
  }

  async read(path: string): Promise<Uint8Array> {
    const v = await this.#kv.get(normalize(path));
    // Yerel karşılığı (expo File.bytes) da eksik dosyada fırlatır; sessiz boş
    // dizi dönmek fotoğraf sha256 doğrulamasını yanıltırdı.
    if (v === null) throw new Error(`dosya yok: ${path}`);
    return v;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    await this.#kv.put(normalize(path), data);
  }

  /** Dizin işaretini koyar (varsa dokunmaz); dizin boşken de `exists`/`rename` çalışsın diye. */
  async ensureDir(dir: string): Promise<void> {
    const marker = dirPrefix(dir);
    if ((await this.#kv.get(marker)) === null) await this.#kv.put(marker, new Uint8Array(0));
  }

  /** Çocuklar ve işaret birlikte gider; yoksa sessiz. */
  async removeDir(dir: string): Promise<void> {
    for (const k of await this.#kv.keys(dirPrefix(dir))) await this.#kv.delete(k);
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
    const entries = await this.#kv.keys(srcPrefix);          // işaret (`src/`) dahil
    if (entries.length > 0) {
      await this.removeDir(dst);
      for (const k of entries) {
        const v = await this.#kv.get(k);
        if (v !== null) await this.#kv.put(`${dst}/${k.slice(srcPrefix.length)}`, v);
        await this.#kv.delete(k);
      }
      return;
    }
    const v = await this.#kv.get(src);
    if (v === null) throw new Error(`yeniden adlandırılacak dosya yok: ${from}`);
    await this.#kv.put(dst, v);
    await this.#kv.delete(src);
  }

  /** Dosya için anahtar; dizin için işaret ya da herhangi bir çocuk. */
  async exists(path: string): Promise<boolean> {
    const p = normalize(path);
    if ((await this.#kv.get(p)) !== null) return true;
    return (await this.#kv.keys(`${p}/`)).length > 0;
  }
}

/** Dizin öneki = işaret anahtarı: `photos` → `photos/`. */
const dirPrefix = (dir: string): string => `${normalize(dir)}/`;

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
