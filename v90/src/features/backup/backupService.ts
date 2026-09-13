// Yedekleme servisi bileşimi — docs/v90/06-ux-flows.md B.7, B.8; 02 §12.3.
//
// Çekirdek `BackupExporter` / `BackupImporter` platformdan bağımsızdır;
// burada onlara dosya sistemi bağlanır. Import'un "mevcut veri asla bozulmaz"
// garantisi (R95.7) çekirdekte, SIRALAMA ile sağlanır — burada yalnızca bağlama var.
import { ZipArchiver } from '../../core/backup/archive.ts';
import { BackupExporter } from '../../core/backup/BackupExporter.ts';
import { BackupImporter } from '../../core/backup/BackupImporter.ts';
import type { ImportReport } from '../../core/backup/BackupImporter.ts';
import type { BlobStore } from '../../core/backup/BlobStore.ts';
import type { Hasher, BytesHasher } from '../../core/db/hash.ts';
import type { Clock } from '../../core/clock/dateKey.ts';
import type { Db } from '../../core/db/types.ts';

export const LAST_EXPORT_KEY = 'backup.lastExportAtUtc';
export const LAST_EXPORT_BYTES_KEY = 'backup.lastExportBytes';
export const REMINDER_KEY = 'backup.reminderEnabled';
export const RESTORE_POINT_DAYS = 7;

export interface BackupEnv {
  db: () => Db;
  clock: Clock;
  hash: Hasher;
  hashBytes: BytesHasher;
  blobs: BlobStore;
  dbPath: string;
  photosDir: string;
  appVersion: string;
  openMigrated: (path: string) => Promise<Db>;
  closeLive: () => Promise<void>;
  reopenLive: () => Promise<Db>;
  hasActiveSession: () => Promise<boolean>;
}

export function makeExporter(env: BackupEnv): BackupExporter {
  return new BackupExporter({
    get db() { return env.db(); },
    clock: env.clock, hash: env.hash, hashBytes: env.hashBytes,
    archiver: new ZipArchiver(),
    blobs: env.blobs, photosDir: env.photosDir, appVersion: env.appVersion,
  } as never);
}

export function makeImporter(env: BackupEnv): BackupImporter {
  return new BackupImporter({
    clock: env.clock, hash: env.hash, hashBytes: env.hashBytes,
    archiver: new ZipArchiver(),
    hasActiveSession: env.hasActiveSession,
    env: {
      dbPath: env.dbPath,
      photosDir: env.photosDir,
      blobs: env.blobs,
      openMigrated: env.openMigrated,
      closeLive: env.closeLive,
      reopenLive: env.reopenLive,
    },
  });
}

/** "Geri al" kartı 7 gün görünür; sonra kopyalar silinir (B.8 adım 6–7). */
export function undoWindow(importedAtUtc: string, nowUtc: Date): {
  expired: boolean; remainingDays: number;
} {
  const elapsedDays = (nowUtc.getTime() - Date.parse(importedAtUtc)) / 86_400_000;
  return {
    expired: elapsedDays >= RESTORE_POINT_DAYS,
    remainingDays: Math.max(0, Math.ceil(RESTORE_POINT_DAYS - elapsedDays)),
  };
}

/** "2.4 MB" — yedek boyutu; bilinmiyorsa "—" (R123.1). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type { ImportReport };
