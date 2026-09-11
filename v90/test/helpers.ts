import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FileStore } from '../src/core/db/types.ts';
import { NodeFileStore } from '../src/core/db/NodeFileStore.ts';

export function tempDbPath(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'v90-'));
  return { path: join(dir, 'v90.sqlite'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Disk dolu / kopyalama hatası senaryolarını simüle eden FileStore sarmalayıcı. */
export class FakeFileStore implements FileStore {
  readonly inner = new NodeFileStore();
  free: number | null = 10 ** 12;
  failCopyTo: string | null = null;
  copies: Array<[string, string]> = [];
  removed: string[] = [];

  exists(p: string) { return this.inner.exists(p); }
  size(p: string) { return this.inner.size(p); }
  async freeSpace() { return this.free; }
  async copy(from: string, to: string) {
    if (this.failCopyTo && to === this.failCopyTo) throw new Error('kopyalama başarısız (simülasyon)');
    this.copies.push([from, to]);
    await this.inner.copy(from, to);
  }
  async remove(p: string) { this.removed.push(p); await this.inner.remove(p); }
}
