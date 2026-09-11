// AT-16 · Schema migration → eski data korunuyor (docs/v90/05-acceptance-tests.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeClock } from '../src/core/clock/dateKey.ts';
import { MigrationRunner, backupPathFor } from '../src/core/db/MigrationRunner.ts';
import { NodeSqliteProvider } from '../src/core/db/NodeSqliteProvider.ts';
import { NodeFileStore } from '../src/core/db/NodeFileStore.ts';
import { nodeSha256 } from '../src/core/db/hash.ts';
import { MIGRATIONS, hasColumn } from '../src/core/db/migrations/index.ts';
import { DbIntegrityError, InsufficientSpaceError, MigrationFailedError } from '../src/core/db/errors.ts';
import type { Migration } from '../src/core/db/types.ts';
import { FakeFileStore, tempDbPath } from './helpers.ts';

const CLOCK = () => new FakeClock('2026-09-07T05:00:00.000Z');
const deps = (path: string, extra: Partial<{ files: any; clock: any; migrations: readonly Migration[]; backupRetentionDays: number }> = {}) => ({
  provider: new NodeSqliteProvider(path),
  files: extra.files ?? new NodeFileStore(),
  clock: extra.clock ?? CLOCK(),
  hash: nodeSha256,
  ...(extra.migrations ? { migrations: extra.migrations } : {}),
  ...(extra.backupRetentionDays !== undefined ? { backupRetentionDays: extra.backupRetentionDays } : {}),
});

test('boş DB → en son sürüm; şema tam kurulur', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    const r = await new MigrationRunner(deps(path)).run();
    assert.equal(r.fromVersion, 0);
    assert.equal(r.toVersion, 1);
    assert.deepEqual(r.applied, [1]);
    assert.equal(r.backupPath, null, 'yeni kurulumda yedek alınmaz');

    const v = await r.db.get<{ user_version: number }>('PRAGMA user_version');
    assert.equal(v?.user_version, 1);
    const rows = await r.db.all<{ name: string; checksum: string }>('SELECT name, checksum FROM schema_migrations');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, '001_initial');
    assert.equal(rows[0]!.checksum, await nodeSha256(MIGRATIONS[0]!.source));

    const t = await r.db.get<{ n: number }>(`SELECT COUNT(*) n FROM sqlite_master WHERE type='table'`);
    assert.equal(t!.n, 45);
    await r.db.close();
  } finally { cleanup(); }
});

test('idempotency · ikinci çalıştırma no-op', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    const first = await new MigrationRunner(deps(path)).run();
    await first.db.close();
    const second = await new MigrationRunner(deps(path)).run();
    assert.deepEqual(second.applied, []);
    assert.equal(second.fromVersion, 1);
    const rows = await second.db.all('SELECT * FROM schema_migrations');
    assert.equal(rows.length, 1, 'çift satır yazılmamalı');
    await second.db.close();
  } finally { cleanup(); }
});

test('AT-16 · eski veri migration sonrası korunuyor + yedek alınıyor', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    const r1 = await new MigrationRunner(deps(path)).run();
    await r1.db.exec(
      `INSERT INTO weight_logs (id, measured_at_utc, local_date_key, time_zone, weight_kg)
       VALUES ('w1','2026-09-07T05:00:00.000Z','2026-09-07','Europe/Istanbul',107)`);
    await r1.db.close();

    const m002: Migration = {
      version: 2, name: '002_add_perceived_effort',
      source: 'ALTER TABLE workout_sessions ADD COLUMN perceived_effort INTEGER',
      async up(tx) {
        if (!(await hasColumn(tx, 'workout_sessions', 'perceived_effort'))) {
          await tx.execScript('ALTER TABLE workout_sessions ADD COLUMN perceived_effort INTEGER');
        }
      },
    };
    const files = new FakeFileStore();
    const r2 = await new MigrationRunner(deps(path, { files, migrations: [MIGRATIONS[0]!, m002] })).run();

    assert.deepEqual(r2.applied, [2]);
    assert.equal(r2.backupPath, backupPathFor(path, 1));
    assert.ok(await files.exists(r2.backupPath!), 'yedek dosyası oluşmalı');
    const w = await r2.db.get<{ weight_kg: number }>('SELECT weight_kg FROM weight_logs WHERE id = ?', ['w1']);
    assert.equal(w?.weight_kg, 107, 'kullanıcı verisi korunmalı (R92.4)');
    assert.ok(await hasColumn(r2.db, 'workout_sessions', 'perceived_effort'));
    await r2.db.close();
  } finally { cleanup(); }
});

test('R92.6 · başarısız migration veriyi bozmaz, yedekten geri döner', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    const r1 = await new MigrationRunner(deps(path)).run();
    await r1.db.exec(
      `INSERT INTO weight_logs (id, measured_at_utc, local_date_key, time_zone, weight_kg)
       VALUES ('w1','2026-09-07T05:00:00.000Z','2026-09-07','Europe/Istanbul',107)`);
    await r1.db.close();

    const bad: Migration = {
      version: 2, name: '002_bozuk', source: 'bozuk',
      async up(tx) {
        await tx.execScript(`CREATE TABLE gecici (x INTEGER)`);
        await tx.execScript(`INSERT INTO gecici VALUES (1)`);
        await tx.execScript(`SELECT bu_fonksiyon_yok()`);   // patlar
      },
    };
    const files = new FakeFileStore();
    await assert.rejects(
      () => new MigrationRunner(deps(path, { files, migrations: [MIGRATIONS[0]!, bad] })).run(),
      (e: unknown) => {
        assert.ok(e instanceof MigrationFailedError);
        assert.equal(e.version, 2);
        assert.equal(e.restored, true);
        assert.equal(e.messageTr, 'Veritabanı güncellenemedi. Verilerin güvende; uygulamayı güncelleyip tekrar dene.');
        return true;
      });

    // DB hâlâ v1 ve veri yerinde; yarım migration'ın izi yok.
    const after = await new MigrationRunner(deps(path)).run();
    assert.equal(after.fromVersion, 1);
    const w = await after.db.get<{ weight_kg: number }>('SELECT weight_kg FROM weight_logs WHERE id = ?', ['w1']);
    assert.equal(w?.weight_kg, 107);
    const leftover = await after.db.get<{ n: number }>(
      `SELECT COUNT(*) n FROM sqlite_master WHERE name='gecici'`);
    assert.equal(leftover!.n, 0, 'yarım migration tablosu kalmamalı');
    await after.db.close();
  } finally { cleanup(); }
});

test('R92.5 · alan yetersizse migration hiç başlamaz', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    const r1 = await new MigrationRunner(deps(path)).run();
    await r1.db.close();
    const files = new FakeFileStore();
    files.free = 1024;                                   // 1 KB boş
    const m002: Migration = {
      version: 2, name: '002', source: 'x',
      async up(tx) { await tx.execScript('CREATE TABLE yeni (x INTEGER)'); },
    };
    await assert.rejects(
      () => new MigrationRunner(deps(path, { files, migrations: [MIGRATIONS[0]!, m002] })).run(),
      (e: unknown) => {
        assert.ok(e instanceof InsufficientSpaceError);
        assert.equal(e.messageTr, 'Alan yetersiz. Güncelleme için cihazında yer açman gerekiyor.');
        return true;
      });
    assert.deepEqual(files.copies, [], 'yedek kopyalanmamalı');
    const check = await new MigrationRunner(deps(path)).run();
    assert.equal(check.fromVersion, 1, 'şema dokunulmamış olmalı');
    const t = await check.db.get<{ n: number }>(`SELECT COUNT(*) n FROM sqlite_master WHERE name='yeni'`);
    assert.equal(t!.n, 0);
    await check.db.close();
  } finally { cleanup(); }
});

test('R92.3 · değiştirilmiş migration checksum ile yakalanır', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    (await new MigrationRunner(deps(path)).run()).db.close();
    const tampered: Migration = { ...MIGRATIONS[0]!, source: MIGRATIONS[0]!.source + '\n-- sonradan eklendi' };
    await assert.rejects(
      () => new MigrationRunner(deps(path, { migrations: [tampered] })).run(),
      (e: unknown) => e instanceof DbIntegrityError && /checksum uyuşmuyor/.test(e.message));
  } finally { cleanup(); }
});

test('DB uygulamadan yeniyse reddedilir', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    const m002: Migration = { version: 2, name: '002', source: 'x', async up(tx) { await tx.execScript('CREATE TABLE y (x)'); } };
    (await new MigrationRunner(deps(path, { migrations: [MIGRATIONS[0]!, m002] })).run()).db.close();
    await assert.rejects(
      () => new MigrationRunner(deps(path)).run(),      // uygulama yalnızca v1 biliyor
      (e: unknown) => e instanceof DbIntegrityError && /bu uygulama en fazla/.test(e.message));
  } finally { cleanup(); }
});

test('user_version ile schema_migrations uyuşmazlığı onarılır', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    const r1 = await new MigrationRunner(deps(path)).run();
    await r1.db.execScript('PRAGMA user_version = 0');   // bozulma simülasyonu
    await r1.db.close();
    const r2 = await new MigrationRunner(deps(path)).run();
    assert.deepEqual(r2.applied, [], 'migration yeniden çalıştırılmamalı');
    assert.deepEqual(r2.repaired, ['user_version 0 → 1']);
    const v = await r2.db.get<{ user_version: number }>('PRAGMA user_version');
    assert.equal(v?.user_version, 1);
    await r2.db.close();
  } finally { cleanup(); }
});

test('eksik schema_migrations satırı yeniden kurulur', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    const r1 = await new MigrationRunner(deps(path)).run();
    await r1.db.exec('DELETE FROM schema_migrations');   // satır kayboldu, user_version=1
    await r1.db.close();
    const r2 = await new MigrationRunner(deps(path)).run();
    assert.deepEqual(r2.applied, []);
    assert.match(r2.repaired[0]!, /schema_migrations satırı eklendi: 001_initial/);
    const rows = await r2.db.all('SELECT * FROM schema_migrations');
    assert.equal(rows.length, 1);
    await r2.db.close();
  } finally { cleanup(); }
});

test('yedek 7 gün sonra temizlenir, öncesinde durur', async () => {
  const { path, cleanup } = tempDbPath();
  try {
    const m002: Migration = { version: 2, name: '002', source: 'x', async up(tx) { await tx.execScript('CREATE TABLE y (x)'); } };
    const files = new FakeFileStore();
    const clock = CLOCK();
    // Yedek yalnızca mevcut şema üzerine migration uygulanınca alınır: önce v1'e çık.
    (await new MigrationRunner(deps(path, { files, clock })).run()).db.close();
    const r = await new MigrationRunner(deps(path, { files, clock, migrations: [MIGRATIONS[0]!, m002] })).run();
    await r.db.close();
    const backup = backupPathFor(path, 1);
    assert.ok(await files.exists(backup));

    const early = new FakeClock('2026-09-12T05:00:00.000Z');          // 5 gün sonra
    const r2 = await new MigrationRunner(deps(path, { files, clock: early, migrations: [MIGRATIONS[0]!, m002] })).run();
    await r2.db.close();
    assert.deepEqual(r2.cleanedBackups, []);
    assert.ok(await files.exists(backup), '7 günden önce silinmemeli');

    const late = new FakeClock('2026-09-15T05:00:00.000Z');           // 8 gün sonra
    const r3 = await new MigrationRunner(deps(path, { files, clock: late, migrations: [MIGRATIONS[0]!, m002] })).run();
    await r3.db.close();
    assert.deepEqual(r3.cleanedBackups, [backup]);
    assert.equal(await files.exists(backup), false);
  } finally { cleanup(); }
});

test('migration sürümleri boşluksuz olmalı', () => {
  const m003: Migration = { version: 3, name: '003', source: 'x', async up() {} };
  assert.throws(() => new MigrationRunner(deps(':memory:', { migrations: [MIGRATIONS[0]!, m003] })),
    /boşluksuz artmalı/);
});
