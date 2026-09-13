// Depolama kalıcılığı — WEB: navigator.storage (02 §12.2 web hedefi, ADR-013).
//
// Kalıcı depolama izni olmadan tarayıcı yer sıkışınca site verisini (DB
// görüntüsü, fotoğraflar VE şifreleme anahtarı) silebilir; anahtar kaybı =
// veri kaybı. İzin istenir; sonuç ekranda gösterilir ve yedek hatırlatılır.
// Yerel karşılığı storage.ts (sandbox zaten kalıcı).
export type PersistState = 'granted' | 'denied' | 'unsupported';

export async function requestPersistentStorage(): Promise<PersistState> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!storage?.persist) return 'unsupported';
    if (await storage.persisted?.()) return 'granted';
    return (await storage.persist()) ? 'granted' : 'denied';
  } catch { return 'unsupported'; }
}

export interface StorageEstimate { usageBytes: number | null; quotaBytes: number | null }

/** Tarayıcının tahmini; kesin değildir ve öyle gösterilmez (R123). Bilinmiyorsa null. */
export async function storageEstimate(): Promise<StorageEstimate> {
  try {
    const est = await navigator.storage?.estimate?.();
    return { usageBytes: est?.usage ?? null, quotaBytes: est?.quota ?? null };
  } catch { return { usageBytes: null, quotaBytes: null }; }
}
