// BlobStore'un Node gerçekleştirmesi — TEST VE SCRIPT İÇİN.
// Uygulama bundle'ına GİRMEZ (React Native'de `node:fs` yoktur).
import type { BlobStore } from './BlobStore.ts';

export class NodeBlobStore implements BlobStore {
  async list(dir: string): Promise<string[]> {
    const { readdir } = await import('node:fs/promises');
    try { return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name); }
    catch { return []; }
  }
  async read(path: string): Promise<Uint8Array> {
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(path));
  }
  async write(path: string, data: Uint8Array): Promise<void> {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const { dirname } = await import('node:path');
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }
  async ensureDir(dir: string): Promise<void> {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true });
  }
  async removeDir(dir: string): Promise<void> {
    const { rm } = await import('node:fs/promises');
    await rm(dir, { recursive: true, force: true });
  }
  async remove(path: string): Promise<void> {
    const { rm } = await import('node:fs/promises');
    await rm(path, { force: true }).catch(() => {});
  }
  async rename(from: string, to: string): Promise<void> {
    const { rename } = await import('node:fs/promises');
    await rename(from, to);
  }
  async exists(path: string): Promise<boolean> {
    const { access } = await import('node:fs/promises');
    try { await access(path); return true; } catch { return false; }
  }
}
