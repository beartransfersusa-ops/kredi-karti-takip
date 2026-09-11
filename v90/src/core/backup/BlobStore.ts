// Medya dosyaları için ikili depo portu (§95.3 photos/).
export interface BlobStore {
  list(dir: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  ensureDir(dir: string): Promise<void>;
  removeDir(dir: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

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
  async rename(from: string, to: string): Promise<void> {
    const { rename } = await import('node:fs/promises');
    await rename(from, to);
  }
  async exists(path: string): Promise<boolean> {
    const { access } = await import('node:fs/promises');
    try { await access(path); return true; } catch { return false; }
  }
}
