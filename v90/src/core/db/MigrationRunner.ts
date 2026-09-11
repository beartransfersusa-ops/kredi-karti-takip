// MigrationRunner — docs/v90/02-architecture.md §12.1, 03-data-model.md §2.
//
// Sözleşme (R92.1–R92.7):
//   1. user_version + schema_migrations okunur; uyuşmazlık onarılır, checksum
//      farkı DbIntegrityError'dır.
//   2. Bekleyen migration varsa ÖNCE dosya yedeği alınır. Alan yetersizse
//      migration HİÇ BAŞLAMAZ.
//   3. Her migration tek BEGIN IMMEDIATE … COMMIT içinde çalışır; schema_migrations
//      satırı ve user_version aynı transaction'da yazılır.
//   4. Hata: ROLLBACK → DB kapat → yedeği geri yükle → MigrationFailedError.
//      Kullanıcı verisi hiçbir durumda bozulmaz (R92.6).
//   5. Başarılı çalıştırmadan N gün (varsayılan 7) sonra yedek temizlenir.

import type { Clock } from '../clock/dateKey.ts';
import { daysBetween, localDateKey } from '../clock/dateKey.ts';
import { DbIntegrityError, InsufficientSpaceError, MigrationFailedError } from './errors.ts';
import type { Hasher } from './hash.ts';
import { LATEST_VERSION, MIGRATIONS } from './migrations/index.ts';
import type { Db, DatabaseProvider, FileStore, Migration, SchemaMigrationRow, Tx } from './types.ts';

const BACKUP_KEY = 'migration.lastBackup';
const SPACE_MARGIN = 1.1;      // yedek + WAL payı

export interface MigrationRunnerOptions {
  provider: DatabaseProvider;
  files: FileStore;
  clock: Clock;
  hash: Hasher;
  migrations?: readonly Migration[];
  backupRetentionDays?: number;
}

export interface MigrationResult {
  db: Db;
  fromVersion: number;
  toVersion: number;
  applied: number[];
  backupPath: string | null;
  repaired: string[];
  cleanedBackups: string[];
}

interface BackupRecord { path: string; createdDateKey: string; fromVersion: number }

export class MigrationRunner {
  readonly #o: Required<Omit<MigrationRunnerOptions, 'migrations' | 'backupRetentionDays'>>
    & { migrations: readonly Migration[]; backupRetentionDays: number };

  constructor(opts: MigrationRunnerOptions) {
    this.#o = {
      provider: opts.provider,
      files: opts.files,
      clock: opts.clock,
      hash: opts.hash,
      migrations: opts.migrations ?? MIGRATIONS,
      backupRetentionDays: opts.backupRetentionDays ?? 7,
    };
    assertContiguous(this.#o.migrations);
  }

  async run(): Promise<MigrationResult> {
    const db = await this.#o.provider.open();
    const repaired: string[] = [];
    try {
      const detected = await this.#readVersion(db);
      await this.#verifyIntegrity(db, detected, repaired);
      // Onarım user_version'ı değiştirmiş olabilir; bekleyenleri düzeltilmiş
      // değere göre hesapla, yoksa uygulanmış migration yeniden çalıştırılır.
      const from = repaired.length ? await this.#readVersion(db) : detected;

      const pending = this.#o.migrations.filter((m) => m.version > from);
      const target = this.#o.migrations.length
        ? Math.max(...this.#o.migrations.map((m) => m.version))
        : LATEST_VERSION;

      if (pending.length === 0) {
        const cleaned = await this.#cleanupBackups(db);
        return { db, fromVersion: from, toVersion: target, applied: [], backupPath: null, repaired, cleanedBackups: cleaned };
      }

      // 2 — yedek. Başarısızsa migration başlamaz.
      const backupPath = await this.#backup(db, from);

      // 3 — sırayla uygula.
      const applied: number[] = [];
      for (const m of pending) {
        try {
          await db.withTransaction(async (tx) => {
            await m.up(tx);
            await tx.exec(
              `INSERT INTO schema_migrations (version, name, checksum, applied_at_utc) VALUES (?,?,?,?)`,
              [m.version, m.name, await this.#o.hash(m.source), this.#o.clock.nowUtc().toISOString()],
            );
            await tx.execScript(`PRAGMA user_version = ${m.version}`);
          });
          applied.push(m.version);
        } catch (e) {
          // 4 — geri alma zaten oldu; yedeği geri yükle ve dur.
          const restored = await this.#restore(db, backupPath);
          throw new MigrationFailedError(m.version, restored,
            `${m.name} uygulanamadı: ${(e as Error).message}`, e);
        }
      }

      await this.#rememberBackup(db, backupPath, from);
      const cleaned = await this.#cleanupBackups(db);
      return { db, fromVersion: from, toVersion: target, applied, backupPath, repaired, cleanedBackups: cleaned };
    } catch (e) {
      if (e instanceof MigrationFailedError) throw e;
      await db.close().catch(() => {});
      throw e;
    }
  }

  // ---------------------------------------------------------------- adım 1
  async #readVersion(db: Db): Promise<number> {
    const row = await db.get<{ user_version: number }>('PRAGMA user_version');
    return row?.user_version ?? 0;
  }

  async #verifyIntegrity(db: Db, userVersion: number, repaired: string[]): Promise<void> {
    if (!(await tableExists(db, 'schema_migrations'))) {
      if (userVersion > 0) {
        throw new DbIntegrityError(
          `user_version=${userVersion} ama schema_migrations tablosu yok`);
      }
      return;
    }
    const rows = await db.all<SchemaMigrationRow>(
      'SELECT version, name, checksum, applied_at_utc FROM schema_migrations ORDER BY version');

    // Uygulamanın bilmediği bir sürüm → DB uygulamadan yeni.
    const known = new Set(this.#o.migrations.map((m) => m.version));
    for (const r of rows) {
      if (!known.has(r.version)) {
        throw new DbIntegrityError(
          `veritabanı sürüm ${r.version} içeriyor, bu uygulama en fazla ${LATEST_VERSION} biliyor`);
      }
    }

    // Checksum doğrulaması — yayınlanmış migration değişmiş mi? (R92.3 değişmezlik)
    for (const r of rows) {
      const m = this.#o.migrations.find((x) => x.version === r.version)!;
      const expected = await this.#o.hash(m.source);
      if (r.checksum !== expected) {
        throw new DbIntegrityError(
          `${m.name} checksum uyuşmuyor (beklenen ${expected.slice(0, 12)}…, bulunan ${r.checksum.slice(0, 12)}…)`);
      }
    }

    // user_version ile satırlar arasındaki tutarsızlığı onar (02 §12.1 adım 3).
    const maxRow = rows.length ? Math.max(...rows.map((r) => r.version)) : 0;
    if (maxRow > userVersion) {
      await db.execScript(`PRAGMA user_version = ${maxRow}`);
      repaired.push(`user_version ${userVersion} → ${maxRow}`);
    } else if (userVersion > maxRow) {
      const missing = this.#o.migrations.filter((m) => m.version > maxRow && m.version <= userVersion);
      if (missing.length !== userVersion - maxRow) {
        throw new DbIntegrityError(
          `user_version=${userVersion} ama ${maxRow} üstü migration kaydı eksik ve yeniden kurulamıyor`);
      }
      for (const m of missing) {
        await db.exec(
          `INSERT INTO schema_migrations (version, name, checksum, applied_at_utc) VALUES (?,?,?,?)`,
          [m.version, m.name, await this.#o.hash(m.source), this.#o.clock.nowUtc().toISOString()]);
        repaired.push(`schema_migrations satırı eklendi: ${m.name}`);
      }
    }
  }

  // ---------------------------------------------------------------- adım 2
  async #backup(db: Db, fromVersion: number): Promise<string | null> {
    // v0 = henüz bu uygulamaya ait şema yok; korunacak kullanıcı verisi de yok.
    // (SQLite dosyayı açılışta oluşturduğu için exists() tek başına yeterli değil.)
    if (fromVersion === 0) return null;
    const path = db.path;
    if (path === ':memory:' || !(await this.#o.files.exists(path))) return null;

    await db.execScript('PRAGMA wal_checkpoint(TRUNCATE)');
    const need = Math.ceil((await this.#o.files.size(path)) * SPACE_MARGIN);
    const free = await this.#o.files.freeSpace();
    if (free !== null && free < need) throw new InsufficientSpaceError(need, free);

    const target = backupPathFor(path, fromVersion);
    await this.#o.files.copy(path, target);
    return target;
  }

  // ---------------------------------------------------------------- adım 4
  async #restore(db: Db, backupPath: string | null): Promise<boolean> {
    await db.close().catch(() => {});
    if (!backupPath || !(await this.#o.files.exists(backupPath))) return false;
    try {
      await this.#o.files.copy(backupPath, db.path);
      return true;
    } catch {
      return false;   // yedek duruyor; kullanıcı "Yedeği dışa aktar" ile kurtarabilir
    }
  }

  // ---------------------------------------------------------------- adım 5
  async #rememberBackup(db: Db, path: string | null, fromVersion: number): Promise<void> {
    if (!path) return;
    const rec: BackupRecord = {
      path,
      createdDateKey: localDateKey(this.#o.clock.nowUtc(), this.#o.clock.timeZone()),
      fromVersion,
    };
    await db.exec(
      `INSERT INTO settings (key, value_json, updated_at_utc) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at_utc = excluded.updated_at_utc`,
      [BACKUP_KEY, JSON.stringify(rec), this.#o.clock.nowUtc().toISOString()]);
  }

  async #cleanupBackups(db: Db): Promise<string[]> {
    if (!(await tableExists(db, 'settings'))) return [];
    const row = await db.get<{ value_json: string }>('SELECT value_json FROM settings WHERE key = ?', [BACKUP_KEY]);
    if (!row) return [];
    let rec: BackupRecord;
    try { rec = JSON.parse(row.value_json) as BackupRecord; } catch { return []; }
    const age = daysBetween(rec.createdDateKey, this.#o.clock.todayKey());
    if (age < this.#o.backupRetentionDays) return [];
    await this.#o.files.remove(rec.path);
    await db.exec('DELETE FROM settings WHERE key = ?', [BACKUP_KEY]);
    return [rec.path];
  }
}

export function backupPathFor(dbPath: string, fromVersion: number): string {
  return dbPath.endsWith('.sqlite')
    ? `${dbPath.slice(0, -'.sqlite'.length)}.bak.v${fromVersion}.sqlite`
    : `${dbPath}.bak.v${fromVersion}`;
}

async function tableExists(tx: Tx, name: string): Promise<boolean> {
  const r = await tx.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?`, [name]);
  return (r?.n ?? 0) > 0;
}

function assertContiguous(ms: readonly Migration[]): void {
  ms.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(`migration sürümleri 1'den başlayıp boşluksuz artmalı; ${m.name} = ${m.version}`);
    }
  });
}
