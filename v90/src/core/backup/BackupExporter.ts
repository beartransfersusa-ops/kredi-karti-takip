// Tam yedek üretimi — docs/v90/02-architecture.md §12.3, ADR-005.
//
// Kapsam ŞEMADAN türetilir (R95.1): yeni bir tablo eklendiğinde yedeğe girmesi
// için ayrıca bir şey yapmak gerekmez.

import type { Db } from '../db/types.ts';
import type { Clock } from '../clock/dateKey.ts';
import type { BytesHasher, Hasher } from '../db/hash.ts';
import type { Archiver, ArchiveEntry } from './archive.ts';
import { utf8 } from './archive.ts';
import type { BlobStore } from './BlobStore.ts';
import { BackupExportError } from './errors.ts';
import {
  DATA_PATH, MANIFEST_PATH, PHOTO_PREFIX, userTables,
} from './TableRegistry.ts';
import type { DataFile, Manifest } from './TableRegistry.ts';

export interface BackupExporterDeps {
  db: Db;
  clock: Clock;
  hash: Hasher;
  hashBytes: BytesHasher;
  archiver: Archiver;
  blobs?: BlobStore;
  photosDir?: string;
  appVersion?: string;
}

export interface ExportResult {
  zip: Uint8Array;
  manifest: Manifest;
  fileName: string;
}

export class BackupExporter {
  readonly #d: BackupExporterDeps;
  constructor(d: BackupExporterDeps) { this.#d = d; }

  async export(): Promise<ExportResult> {
    const { db, clock, hash, archiver } = this.#d;
    try {
      // Tek okuma transaction'ı: yedek tutarlı bir anlık görüntüdür.
      const { tables, schemaVersion } = await db.withTransaction(async (tx) => {
        const names = await userTables(tx);
        const acc: DataFile['tables'] = {};
        for (const t of names) acc[t] = await tx.all<Record<string, unknown>>(`SELECT * FROM ${t}`);
        const v = await tx.get<{ user_version: number }>('PRAGMA user_version');
        return { tables: acc, schemaVersion: v?.user_version ?? 0 };
      });

      const dataFile: DataFile = { schemaVersion, tables };
      const dataBytes = utf8(JSON.stringify(dataFile));
      const dataSha256 = await hash(JSON.stringify(dataFile));

      const photos = await this.#collectPhotos();
      const photoShas: Record<string, string> = {};
      for (const p of photos) photoShas[p.name] = await this.#d.hashBytes(p.data);

      const manifest: Manifest = {
        formatVersion: 1,
        schemaVersion,
        appVersion: this.#d.appVersion ?? '0.1.0',
        createdAtUtc: clock.nowUtc().toISOString(),
        timeZone: clock.timeZone(),
        tables: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])),
        photos: { count: photos.length, totalBytes: photos.reduce((n, p) => n + p.data.length, 0) },
        dataSha256,
        photoShas,
      };

      const entries: ArchiveEntry[] = [
        { path: MANIFEST_PATH, data: utf8(JSON.stringify(manifest, null, 2)) },
        { path: DATA_PATH, data: dataBytes },
        ...photos.map((p) => ({ path: `${PHOTO_PREFIX}${p.name}`, data: p.data })),
      ];

      return {
        zip: await archiver.write(entries),
        manifest,
        fileName: `v90-backup-${fileStamp(clock.nowUtc(), clock.timeZone())}.zip`,
      };
    } catch (e) {
      throw new BackupExportError((e as Error).message, e);
    }
  }

  async #collectPhotos(): Promise<Array<{ name: string; data: Uint8Array }>> {
    const { blobs, photosDir } = this.#d;
    if (!blobs || !photosDir) return [];
    const names = await blobs.list(photosDir);
    const out: Array<{ name: string; data: Uint8Array }> = [];
    for (const name of names.sort()) {
      out.push({ name, data: await blobs.read(`${photosDir}/${name}`) });
    }
    return out;
  }
}

/**
 * Dosya adı kullanıcıya görünen bir etikettir: YEREL saati taşır.
 * Kesin an ve saat dilimi manifest'teki createdAtUtc/timeZone alanlarındadır.
 */
function fileStamp(now: Date, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(now);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  const hour = g('hour') === '24' ? '00' : g('hour');
  return `${g('year')}${g('month')}${g('day')}-${hour}${g('minute')}`;
}
