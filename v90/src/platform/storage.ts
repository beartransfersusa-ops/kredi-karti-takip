// Depolama kalıcılığı — YEREL: uygulama sandbox'ı zaten kalıcıdır; işletim
// sistemi izinsiz silmez. Web karşılığı storage.web.ts (navigator.storage).
export type PersistState = 'granted' | 'denied' | 'unsupported';

export async function requestPersistentStorage(): Promise<PersistState> {
  return 'unsupported';          // yerelde soru anlamsız; ekran bu durumu göstermez
}

export interface StorageEstimate { usageBytes: number | null; quotaBytes: number | null }

export async function storageEstimate(): Promise<StorageEstimate> {
  return { usageBytes: null, quotaBytes: null };
}
