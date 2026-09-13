// "Geri al" penceresi kaydı — YEREL: belge dizininde sidecar JSON.
//
// DB'nin İÇİNDE tutulamaz: yedek içe aktarma DB dosyasının kendisini değiştirir,
// yazılan kayıt kaybolurdu (02 §12.3 adım 7). Web karşılığı restorePoint.web.ts.
import { Directory, File, Paths } from 'expo-file-system';

export interface RestorePoint {
  importedAtUtc: string;
  report?: Record<string, number>;
}

const FILE_NAME = 'v90.restore-point.json';

export async function readRestorePoint(): Promise<RestorePoint | null> {
  try {
    const f = new File(new Directory(Paths.document), FILE_NAME);
    if (!f.exists) return null;
    return JSON.parse(f.textSync()) as RestorePoint;
  } catch { return null; }
}

export async function writeRestorePoint(value: RestorePoint): Promise<void> {
  try {
    const f = new File(new Directory(Paths.document), FILE_NAME);
    if (f.exists) f.delete();
    f.create();
    f.write(JSON.stringify(value));
  } catch { /* kayıt tutulamazsa yalnızca "Geri al" kartı görünmez */ }
}
