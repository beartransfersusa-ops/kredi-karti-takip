// Yedekten geri yükleme — docs/v90/02-architecture.md §12.3, ADR-005, AT-14/AT-15.
//
// GARANTİ (R95.7): import başarısız olursa mevcut veri değişmez. Bunu sağlayan
// şey sıralamadır — tüm doğrulama ve yazma AYRI bir staging DB'de yapılır;
// kullanıcının veritabanına yalnızca her şey doğrulandıktan sonra, tek bir
// yeniden adlandırma adımıyla dokunulur.

import type { Clock } from '../clock/dateKey.ts';
import type { BytesHasher, Hasher } from '../db/hash.ts';
import type { Db } from '../db/types.ts';
import type { Archiver } from './archive.ts';
import { fromUtf8 } from './archive.ts';
import type { BlobStore } from './BlobStore.ts';
import { importFailed } from './errors.ts';
import { migrateBackup } from './migrators/index.ts';
import {
  DATA_PATH, DataFileSchema, MANIFEST_PATH, ManifestSchema, PHOTO_PREFIX, userTables,
} from './TableRegistry.ts';
import type { DataFile, Manifest } from './TableRegistry.ts';

export interface ImportEnvironment {
  /** Kullanıcının canlı veritabanı dosyası. */
  dbPath: string;
  photosDir: string;
  /** Verilen yolda DB açar ve migration'ları çalıştırır. */
  openMigrated(path: string): Promise<Db>;
  /** Canlı DB'yi kapatır (değişimden önce). */
  closeLive(): Promise<void>;
  /** Değişimden sonra canlı DB'yi yeniden açar. */
  reopenLive(): Promise<Db>;
  blobs: BlobStore;
}

export interface BackupImporterDeps {
  clock: Clock;
  hash: Hasher;
  hashBytes: BytesHasher;
  archiver: Archiver;
  env: ImportEnvironment;
  /** Aktif oturum varken import engellenir (02 §12.3 guard). */
  hasActiveSession?: () => Promise<boolean>;
}

export interface ImportReport {
  fromSchemaVersion: number;
  toSchemaVersion: number;
  tables: Record<string, number>;
  photos: number;
  preImportDbPath: string;
  preImportPhotosDir: string;
  restorePointPath: string;
}

export interface RestorePoint { importedAtUtc: string; fromSchemaVersion: number }

const STAGING_SUFFIX = '.import.sqlite';
const PRE_IMPORT_SUFFIX = '.pre-import.sqlite';

export class BackupImporter {
  readonly #d: BackupImporterDeps;
  constructor(d: BackupImporterDeps) { this.#d = d; }

  async import(zip: Uint8Array): Promise<ImportReport> {
    const { env, clock } = this.#d;

    if (this.#d.hasActiveSession && (await this.#d.hasActiveSession())) {
      throw importFailed('guard', 'aktif antrenman oturumu varken import yapılamaz');
    }

    // ---- 1. arşiv ve zarf doğrulaması -----------------------------------
    const { manifest, data, photos } = await this.#parse(zip);

    // ---- 2. şema sürümü -------------------------------------------------
    const staging = `${stripSqlite(env.dbPath)}${STAGING_SUFFIX}`;
    await env.blobs.removeDir(staging);                         // önceki denemeden kalıntı
    let stagingDb: Db;
    try {
      stagingDb = await env.openMigrated(staging);
    } catch (e) {
      throw importFailed('staging', `staging veritabanı açılamadı: ${(e as Error).message}`, e);
    }

    let report: ImportReport;
    try {
      const current = (await stagingDb.get<{ user_version: number }>('PRAGMA user_version'))?.user_version ?? 0;
      if (manifest.schemaVersion > current) {
        throw importFailed('version',
          `yedek şema sürümü ${manifest.schemaVersion}, bu uygulama en fazla ${current} destekliyor`);
      }
      const upgraded = manifest.schemaVersion < current
        ? migrateBackup(data, current)
        : data;

      // ---- 3. satır doğrulaması + staging'e yazma -----------------------
      const counts = await this.#writeStaging(stagingDb, upgraded);

      // ---- 4. fotoğraflar ----------------------------------------------
      const stagingPhotos = `${env.photosDir}.import`;
      await env.blobs.removeDir(stagingPhotos);
      await env.blobs.ensureDir(stagingPhotos);
      for (const p of photos) {
        const expected = manifest.photoShas[p.name];
        if (!expected) throw importFailed('photos', `manifestte olmayan fotoğraf: ${p.name}`);
        if ((await this.#d.hashBytes(p.data)) !== expected) {
          throw importFailed('photos', `fotoğraf sha256 uyuşmuyor: ${p.name}`);
        }
        await env.blobs.write(`${stagingPhotos}/${p.name}`, p.data);
      }
      await stagingDb.close();

      // ---- 5. atomik değişim -------------------------------------------
      report = await this.#swap(staging, stagingPhotos, manifest, counts, photos.length);
    } catch (e) {
      await stagingDb.close().catch(() => {});
      await env.blobs.removeDir(`${env.photosDir}.import`).catch(() => {});
      await this.#removeFile(staging);
      throw e instanceof Error && e.name === 'BackupImportError'
        ? e : importFailed('staging', (e as Error).message, e);
    }

    // ---- 6. geri alma penceresi -----------------------------------------
    const restorePoint: RestorePoint = {
      importedAtUtc: clock.nowUtc().toISOString(),
      fromSchemaVersion: manifest.schemaVersion,
    };
    await env.blobs.write(report.restorePointPath,
      new TextEncoder().encode(JSON.stringify(restorePoint, null, 2)));
    return report;
  }

  // ------------------------------------------------------------- adım 1
  async #parse(zip: Uint8Array): Promise<{ manifest: Manifest; data: DataFile; photos: Array<{ name: string; data: Uint8Array }> }> {
    let entries;
    try { entries = await this.#d.archiver.read(zip); }
    catch (e) { throw importFailed('archive', `ZIP okunamadı: ${(e as Error).message}`, e); }

    const find = (p: string) => entries.find((e) => e.path === p);
    const manifestEntry = find(MANIFEST_PATH);
    const dataEntry = find(DATA_PATH);
    if (!manifestEntry) throw importFailed('manifest', 'manifest.json yok');
    if (!dataEntry) throw importFailed('data', 'data.json yok');

    const manifestParsed = ManifestSchema.safeParse(safeJson(manifestEntry.data, 'manifest.json'));
    if (!manifestParsed.success) {
      throw importFailed('manifest', `manifest geçersiz: ${manifestParsed.error.issues[0]?.message}`);
    }
    const manifest = manifestParsed.data;

    const dataText = fromUtf8(dataEntry.data);
    if ((await this.#d.hash(dataText)) !== manifest.dataSha256) {
      throw importFailed('checksum', 'data.json sha256 manifestle uyuşmuyor');
    }
    const dataParsed = DataFileSchema.safeParse(safeJson(dataEntry.data, 'data.json'));
    if (!dataParsed.success) {
      throw importFailed('data', `data.json geçersiz: ${dataParsed.error.issues[0]?.message}`);
    }
    // Otoriter sürüm manifesttir; ikisi çelişiyorsa import reddedilir (02 §12.3).
    if (dataParsed.data.schemaVersion !== manifest.schemaVersion) {
      throw importFailed('version',
        `sürüm çelişkisi: manifest ${manifest.schemaVersion}, data.json ${dataParsed.data.schemaVersion}`);
    }

    const photos = entries
      .filter((e) => e.path.startsWith(PHOTO_PREFIX))
      .map((e) => ({ name: e.path.slice(PHOTO_PREFIX.length), data: e.data }));
    if (photos.length !== manifest.photos.count) {
      throw importFailed('photos', `fotoğraf sayısı uyuşmuyor: ${photos.length} ≠ ${manifest.photos.count}`);
    }
    return { manifest, data: dataParsed.data, photos };
  }

  // ------------------------------------------------------------- adım 3
  async #writeStaging(db: Db, data: DataFile): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    await db.withTransaction(async (tx) => {
      const known = new Set(await userTables(tx));
      for (const name of Object.keys(data.tables)) {
        if (!known.has(name)) throw importFailed('data', `yedekte bilinmeyen tablo: ${name}`);
      }
      // FK'lar nedeniyle sıra önemli: ebeveyn tablolar önce gelsin diye
      // tüm eklemeler tek transaction'da yapılır ve kontrol sona ertelenir.
      await tx.execScript('PRAGMA defer_foreign_keys = ON');

      const { rowSchemaFor } = await import('./TableRegistry.ts');
      for (const name of known) {
        const rows = data.tables[name] ?? [];
        counts[name] = rows.length;
        if (rows.length === 0) continue;
        const schema = await rowSchemaFor(tx, name);
        const cols = Object.keys(rows[0]!);
        const sql = `INSERT INTO ${name} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
        for (const [i, row] of rows.entries()) {
          const parsed = schema.safeParse(row);
          if (!parsed.success) {
            throw importFailed('validation',
              `${name}[${i}] geçersiz: ${parsed.error.issues[0]?.path.join('.')} — ${parsed.error.issues[0]?.message}`);
          }
          await tx.exec(sql, cols.map((c) => (row as Record<string, unknown>)[c] ?? null));
        }
      }

      const fk = await tx.all('PRAGMA foreign_key_check');
      if (fk.length > 0) throw importFailed('integrity', `foreign_key_check ${fk.length} ihlal buldu`);
      const integrity = await tx.get<Record<string, string>>('PRAGMA integrity_check');
      const verdict = integrity ? Object.values(integrity)[0] : 'bilinmiyor';
      if (verdict !== 'ok') throw importFailed('integrity', `integrity_check: ${verdict}`);
    });
    return counts;
  }

  // ------------------------------------------------------------- adım 5
  async #swap(
    stagingDbPath: string, stagingPhotosDir: string, manifest: Manifest,
    counts: Record<string, number>, photoCount: number,
  ): Promise<ImportReport> {
    const { env } = this.#d;
    const preImportDb = `${stripSqlite(env.dbPath)}${PRE_IMPORT_SUFFIX}`;
    const preImportPhotos = `${env.photosDir}.pre-import`;

    await env.closeLive();
    const swapped: Array<[string, string]> = [];
    try {
      await this.#removeFile(preImportDb);
      await env.blobs.rename(env.dbPath, preImportDb);
      swapped.push([preImportDb, env.dbPath]);
      await env.blobs.rename(stagingDbPath, env.dbPath);
      swapped.push([env.dbPath, stagingDbPath]);

      await env.blobs.removeDir(preImportPhotos);
      if (await env.blobs.exists(env.photosDir)) {
        await env.blobs.rename(env.photosDir, preImportPhotos);
        swapped.push([preImportPhotos, env.photosDir]);
      }
      await env.blobs.rename(stagingPhotosDir, env.photosDir);
    } catch (e) {
      for (const [from, to] of swapped.reverse()) await env.blobs.rename(from, to).catch(() => {});
      await env.reopenLive();
      throw importFailed('swap', `değişim başarısız, geri alındı: ${(e as Error).message}`, e);
    }
    await env.reopenLive();

    return {
      fromSchemaVersion: manifest.schemaVersion,
      toSchemaVersion: manifest.schemaVersion,
      tables: counts,
      photos: photoCount,
      preImportDbPath: preImportDb,
      preImportPhotosDir: preImportPhotos,
      restorePointPath: `${preImportPhotos}/../restore-point.json`,
    };
  }

  async #removeFile(path: string): Promise<void> {
    const { rm } = await import('node:fs/promises');
    await rm(path, { force: true }).catch(() => {});
  }
}

function safeJson(bytes: Uint8Array, what: string): unknown {
  try { return JSON.parse(fromUtf8(bytes)); }
  catch (e) { throw importFailed('parse', `${what} JSON olarak okunamadı`, e); }
}

const stripSqlite = (p: string) => (p.endsWith('.sqlite') ? p.slice(0, -'.sqlite'.length) : p);
