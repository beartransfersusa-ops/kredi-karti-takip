// ImageStore üzerinden FileStore — docs/v90/02-architecture.md §12.1, §12.2 (web), ADR-013.
//
// MigrationRunner yedeğini "dosya kopyası" olarak alır (02 §12.1 adım 2).
// Web'de dosya yoktur; canlı görüntü ile `.bak` yedeği AYNI ImageStore'da,
// aynı adlandırmayla (backupPathFor) durur. Depo şifreliyse yedek de
// şifrelidir: `copy` = load (çöz) + save (yeni IV ile yeniden şifrele).

import type { ImageStore } from './imageStore.ts';
import type { FileStore } from './types.ts';

export class ImageFileStore implements FileStore {
  readonly #store: ImageStore;
  constructor(store: ImageStore) { this.#store = store; }

  exists(path: string): Promise<boolean> { return this.#store.exists(path); }

  async copy(from: string, to: string): Promise<void> {
    const bytes = await this.#store.load(from);
    if (bytes === null) throw new Error(`kopyalanacak görüntü yok: ${from}`);
    await this.#store.save(to, bytes);
  }

  remove(path: string): Promise<void> { return this.#store.remove(path); }

  /** MigrationRunner `size`'ı yalnızca `exists` sonrası çağırır; yoksa hata (0 değil). */
  async size(path: string): Promise<number> {
    const n = await this.#store.size(path);
    if (n === null) throw new Error(`görüntü yok: ${path}`);
    return n;
  }

  freeSpace(): Promise<number | null> { return this.#store.freeSpace(); }
}
