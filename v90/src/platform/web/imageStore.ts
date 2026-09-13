// ImageStore'un IndexedDB gerçekleştirmesi — web hedefi (02 §12.2, ADR-013).
//
// DÜZ depodur: `isEncrypted = false` der ve yalan söylemez (R93.4). Şifreleme
// bunun ÜSTÜNE sarılır (stores.ts → EncryptedImageStore); bu sınıf yalnızca
// şifreli baytları görür, hiçbir zaman düz veritabanını görmez.
import type { ImageStore } from '../../core/db/imageStore.ts';
import { IdbKvStore } from './idb.ts';

export class IdbImageStore implements ImageStore {
  readonly #kv = new IdbKvStore('images');
  readonly isEncrypted = false;

  load(name: string): Promise<Uint8Array | null> { return this.#kv.get(name); }
  /** Tek `put` = tek transaction: yarım görüntü kalmaz. */
  save(name: string, bytes: Uint8Array): Promise<void> { return this.#kv.put(name, bytes); }
  remove(name: string): Promise<void> { return this.#kv.delete(name); }
  exists(name: string): Promise<boolean> { return this.#kv.has(name); }
  async size(name: string): Promise<number | null> {
    return (await this.#kv.get(name))?.byteLength ?? null;
  }
  /** Tarayıcı kotası − kullanım; API yoksa null (yanlış kesinlik yok, R123). */
  async freeSpace(): Promise<number | null> {
    try {
      const est = await navigator.storage?.estimate?.();
      if (!est || est.quota == null) return null;
      return Math.max(0, est.quota - (est.usage ?? 0));
    } catch { return null; }
  }
}
