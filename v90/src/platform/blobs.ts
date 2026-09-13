// BlobStore'un Expo karşılığı — fotoğraf dizinleri ve import/export dosyaları.
//
// `src/core/backup/BlobStore.ts` portunun RN tarafı. Node gerçekleştirmesi
// (`BlobStore.node.ts`) yalnızca testlerde kullanılır ve bundle'a girmez.
import { Directory, File, Paths } from 'expo-file-system';
import type { BlobStore } from '../core/backup/BlobStore.ts';

const uri = (p: string) => (p.startsWith('file://') ? p : `file://${p}`);
const file = (p: string) => new File(uri(p));
const dir = (p: string) => new Directory(uri(p));

export class ExpoBlobStore implements BlobStore {
  async list(path: string): Promise<string[]> {
    const d = dir(path);
    if (!d.exists) return [];
    return d.list().filter((e) => e instanceof File).map((e) => e.name);
  }

  async read(path: string): Promise<Uint8Array> {
    return file(path).bytes();
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    const f = file(path);
    f.parentDirectory.create({ intermediates: true, idempotent: true });
    if (f.exists) f.delete();
    f.create();
    f.write(data);
  }

  async ensureDir(path: string): Promise<void> {
    dir(path).create({ intermediates: true, idempotent: true });
  }

  async removeDir(path: string): Promise<void> {
    const d = dir(path);
    if (d.exists) d.delete();
  }

  async remove(path: string): Promise<void> {
    const f = file(path);
    if (f.exists) f.delete();
  }

  async rename(from: string, to: string): Promise<void> {
    // Dizin ve dosya için aynı semantik: hedef varsa önce temizlenir.
    const src = dir(from);
    if (src.exists) {
      const dst = dir(to);
      if (dst.exists) dst.delete();
      src.move(dst);
      return;
    }
    const f = file(from);
    const target = file(to);
    if (target.exists) target.delete();
    f.move(target);
  }

  async exists(path: string): Promise<boolean> {
    return file(path).exists || dir(path).exists;
  }
}

/** İlerleme fotoğrafları: uygulamaya özel, galeriye EKLENMEZ (R116.1, R116.2). */
export function photosDir(): string {
  return new Directory(Paths.document, 'photos').uri;
}
