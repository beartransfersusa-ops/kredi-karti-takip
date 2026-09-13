// "Geri al" penceresi kaydı — WEB: IndexedDB "meta" deposunda UTF-8 JSON; değer
// `meta()` (stores.ts → EncryptedKvStore) üzerinden aynı anahtarla AES-GCM şifreli yazılır.
//
// DB'nin İÇİNDE tutulamaz: yedek içe aktarma DB görüntüsünün kendisini
// değiştirir, yazılan kayıt kaybolurdu (02 §12.3 adım 7). "meta" deposu
// görüntüden ayrıdır. Yerel karşılığı restorePoint.ts (sidecar JSON).
import { meta } from './web/stores.ts';

export interface RestorePoint {
  importedAtUtc: string;
  report?: Record<string, number>;
}

const KEY = 'restorePoint';

export async function readRestorePoint(): Promise<RestorePoint | null> {
  try {
    const bytes = await meta().get(KEY);
    if (!bytes) return null;
    return JSON.parse(new TextDecoder().decode(bytes)) as RestorePoint;
  } catch { return null; }
}

export async function writeRestorePoint(value: RestorePoint): Promise<void> {
  try {
    await meta().put(KEY, new TextEncoder().encode(JSON.stringify(value)));
  } catch { /* kayıt tutulamazsa yalnızca "Geri al" kartı görünmez */ }
}
