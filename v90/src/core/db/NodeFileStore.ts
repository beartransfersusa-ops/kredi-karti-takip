import { constants } from 'node:fs';
import { access, copyFile, rm, stat, statfs } from 'node:fs/promises';
import type { FileStore } from './types.ts';

export class NodeFileStore implements FileStore {
  async exists(path: string): Promise<boolean> {
    try { await access(path, constants.F_OK); return true; } catch { return false; }
  }
  async copy(from: string, to: string): Promise<void> { await copyFile(from, to); }
  async remove(path: string): Promise<void> { await rm(path, { force: true }); }
  async size(path: string): Promise<number> { return (await stat(path)).size; }
  async freeSpace(): Promise<number | null> {
    try { const s = await statfs(process.cwd()); return Number(s.bavail) * Number(s.bsize); }
    catch { return null; }
  }
}
