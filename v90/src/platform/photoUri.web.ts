// Fotoğraf dosyası → <Image> için URI — WEB: IndexedDB'den okunur, `blob:` URL
// üretilir. Yerel karşılığı photoUri.ts (file:// yolu, eşzamanlı).
//
// `blob:` URL'ler sekme belleğinde yaşar; ekran her listelemede bu fonksiyonu
// çağırır, artık istenmeyenler serbest bırakılır (sızıntı yok). Fotoğraf hiçbir
// zaman sunucuya gitmez (R116.3): URL yalnızca bu sekmede çözülür.
// './blobs.ts': Metro web'de blobs.web.ts'i seçer; tip olarak ikisi de photosDir(): string verir.
import { photosDir } from './blobs.ts';
import { blobStore } from './web/stores.ts';

export interface PhotoRef { id: string; file_name: string }

/** file_name → canlı blob: URL. */
const cache = new Map<string, string>();

const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
};

function mimeOf(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

/** id → görüntülenebilir URI. Dosyası okunamayan fotoğraf haritada YER ALMAZ ("Dosya bulunamadı"). */
export async function resolvePhotoUris(photos: readonly PhotoRef[]): Promise<Record<string, string>> {
  const wanted = new Set(photos.map((p) => p.file_name));

  // Artık listede olmayanların URL'si bırakılır (sekme belleği).
  for (const [name, url] of cache) {
    if (!wanted.has(name)) {
      cache.delete(name);
      try { URL.revokeObjectURL(url); } catch { /* zaten gitmiş olabilir */ }
    }
  }

  const dir = photosDir();
  const out: Record<string, string> = {};
  for (const p of photos) {
    let url = cache.get(p.file_name);
    if (!url) {
      let bytes: Uint8Array;
      try { bytes = await blobStore().read(`${dir}/${p.file_name}`); }
      catch { continue; }                      // dosya yok → haritada yer almaz
      url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mimeOf(p.file_name) }));
      cache.set(p.file_name, url);
    }
    out[p.id] = url;
  }
  return out;
}
