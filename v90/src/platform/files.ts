// FileStore'un Expo karşılığı — migration yedeği ve import/export için.
//
// expo-file-system yolları `file://` URI'dir; port ise düz yol taşır.
// Dönüşüm burada yapılır, çağıranlar farkı görmez.
import { Directory, File, Paths } from 'expo-file-system';
import type { FileStore } from '../core/db/types.ts';

const toFile = (path: string) => new File(path.startsWith('file://') ? path : `file://${path}`);

export class ExpoFileStore implements FileStore {
  async exists(path: string): Promise<boolean> {
    try { return toFile(path).exists; } catch { return false; }
  }

  async copy(from: string, to: string): Promise<void> {
    const dst = toFile(to);
    // copy() hedef VARSA hata verir; yedek üzerine yazma davranışı beklenir.
    if (dst.exists) dst.delete();
    await toFile(from).copy(dst);
  }

  async remove(path: string): Promise<void> {
    const f = toFile(path);
    if (f.exists) f.delete();
  }

  async size(path: string): Promise<number> {
    return toFile(path).size ?? 0;
  }

  async freeSpace(): Promise<number | null> {
    try { return Paths.availableDiskSpace; } catch { return null; }
  }
}

/** Uygulamaya özel, sistem tarafından temizlenmeyen dizin (R116.1). */
export function documentDir(): Directory { return Paths.document; }

/** Veritabanı dosyasının tam yolu. expo-sqlite `SQLite/` altını kullanır. */
export function databasePath(name = 'v90.sqlite'): string {
  return new File(new Directory(Paths.document, 'SQLite'), name).uri;
}
