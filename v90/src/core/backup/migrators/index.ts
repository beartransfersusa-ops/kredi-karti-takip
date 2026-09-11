// Yedek verisi migrator'ları — docs/v90/03-data-model.md §2, 02 §12.3.
//
// DB migration'larıyla PARALEL tutulur: MIGRATIONS[k] eklendiğinde
// BACKUP_MIGRATORS[k] de eklenmelidir (aşağıdaki test bunu zorlar).
// Her migrator saf bir JSON dönüşümüdür; DB'ye dokunmaz.

import type { DataFile } from '../TableRegistry.ts';

export type BackupMigrator = (data: DataFile) => DataFile;

/** Anahtar = HEDEF şema sürümü (v-1 → v dönüşümü). */
export const BACKUP_MIGRATORS: Readonly<Record<number, BackupMigrator>> = {
  // 2: (data) => ({ ...data, schemaVersion: 2, tables: { ...data.tables, ... } }),
};

/** Eski bir yedeği güncel şema sürümüne yükseltir (R95.8). */
export function migrateBackup(data: DataFile, targetVersion: number): DataFile {
  let out = data;
  for (let v = data.schemaVersion + 1; v <= targetVersion; v++) {
    const m = BACKUP_MIGRATORS[v];
    if (!m) throw new Error(`yedek migrator eksik: sürüm ${v}`);
    out = m(out);
    if (out.schemaVersion !== v) out = { ...out, schemaVersion: v };
  }
  return out;
}
