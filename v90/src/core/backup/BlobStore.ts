// Medya dosyaları için ikili depo portu (§95.3 photos/).
//
// Yalnızca TİP. Gerçekleştirmeler ayrı dosyalarda:
//   • Node/test → BlobStore.node.ts (node:fs)
//   • Uygulama  → platform/blobs.ts (expo-file-system)
export interface BlobStore {
  list(dir: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array>;
  write(path: string, data: Uint8Array): Promise<void>;
  ensureDir(dir: string): Promise<void>;
  removeDir(dir: string): Promise<void>;
  /** Tek dosyayı siler; yoksa sessizce geçer. */
  remove(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}
