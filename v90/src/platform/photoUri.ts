// Fotoğraf dosyası → <Image> için URI — YEREL: file:// yolu, eşzamanlı ve ucuz.
// Web karşılığı photoUri.web.ts: IndexedDB'den okunup blob: URL üretilir.
import { photosDir } from './blobs.ts';

export interface PhotoRef { id: string; file_name: string }

/** id → görüntülenebilir URI. Dosyası okunamayan fotoğraf haritada YER ALMAZ. */
export async function resolvePhotoUris(photos: readonly PhotoRef[]): Promise<Record<string, string>> {
  const dir = photosDir();
  const out: Record<string, string> = {};
  for (const p of photos) out[p.id] = `${dir}/${p.file_name}`;
  return out;
}
