// AT-14 · Backup export → app reset → import → tüm data geri geliyor
// AT-15 · Failed import → mevcut data silinmiyor
// docs/v90/05-acceptance-tests.md, 02 §12.3, ADR-005
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '../src/core/clock/dateKey.ts';
import { MigrationRunner } from '../src/core/db/MigrationRunner.ts';
import { NodeSqliteProvider } from '../src/core/db/NodeSqliteProvider.ts';
import { NodeFileStore } from '../src/core/db/NodeFileStore.ts';
import { nodeSha256, nodeSha256Bytes } from '../src/core/db/hash.ts';
import type { Db } from '../src/core/db/types.ts';
import { NodeArchiver, utf8, fromUtf8 } from '../src/core/backup/archive.ts';
import { NodeBlobStore } from '../src/core/backup/BlobStore.ts';
import { BackupExporter } from '../src/core/backup/BackupExporter.ts';
import { BackupImporter } from '../src/core/backup/BackupImporter.ts';
import { BackupImportError } from '../src/core/backup/errors.ts';
import { EXCLUDED_TABLES, userTables } from '../src/core/backup/TableRegistry.ts';

const archiver = new NodeArchiver();
const blobs = new NodeBlobStore();

interface Env {
  dir: string; dbPath: string; photosDir: string; db: Db; clock: FakeClock;
  exporter: BackupExporter; importer: BackupImporter;
  reload: () => Promise<void>; cleanup: () => void;
}

async function makeEnv(nowIso = '2026-09-07T05:00:00.000Z'): Promise<Env> {
  const dir = mkdtempSync(join(tmpdir(), 'v90-backup-'));
  const dbPath = join(dir, 'v90.sqlite');
  const photosDir = join(dir, 'photos');
  const clock = new FakeClock(nowIso);
  const open = async (path: string) => (await new MigrationRunner({
    provider: new NodeSqliteProvider(path), files: new NodeFileStore(), clock, hash: nodeSha256,
  }).run()).db;

  let db = await open(dbPath);
  await blobs.ensureDir(photosDir);

  const env: Env = {
    dir, dbPath, photosDir, clock,
    get db() { return db; },
    exporter: null as never, importer: null as never,
    reload: async () => { await db.close(); db = await open(dbPath); },
    cleanup: () => { try { db.close(); } catch { /* kapalı */ } rmSync(dir, { recursive: true, force: true }); },
  } as Env;

  env.exporter = new BackupExporter({
    get db() { return db; }, clock, hash: nodeSha256, hashBytes: nodeSha256Bytes,
    archiver, blobs, photosDir, appVersion: '0.1.0',
  } as never);
  env.importer = new BackupImporter({
    clock, hash: nodeSha256, hashBytes: nodeSha256Bytes, archiver,
    env: {
      dbPath, photosDir, blobs,
      openMigrated: open,
      closeLive: async () => { await db.close(); },
      reopenLive: async () => { db = await open(dbPath); return db; },
    },
  });
  return env;
}

/** Her tablodan değil ama her katmandan örnek veri. */
async function seedUserData(env: Env) {
  const now = '2026-09-07T05:00:00.000Z';
  await env.db.withTransaction(async (tx) => {
    await tx.exec(`INSERT INTO profiles (id, display_name, height_cm, created_at_utc, updated_at_utc, onboarding_completed)
      VALUES ('p1','Kullanıcı',187,?,?,1)`, [now, now]);
    await tx.exec(`INSERT INTO weight_logs (id, measured_at_utc, local_date_key, time_zone, weight_kg)
      VALUES ('w1',?,'2026-09-07','Europe/Istanbul',107)`, [now]);
    await tx.exec(`INSERT INTO body_measurements (id, measured_at_utc, local_date_key, time_zone, site,
      final_value_cm, aggregation, is_baseline) VALUES ('m1',?,'2026-09-07','Europe/Istanbul','waist',95,'single',1)`, [now]);
    await tx.exec(`INSERT INTO measurement_samples (id, measurement_id, sample_index, value_cm)
      VALUES ('ms1','m1',1,95)`);
    await tx.exec(`INSERT INTO progress_photos (id, taken_at_utc, local_date_key, time_zone, pose, file_name, bytes, sha256)
      VALUES ('ph1',?,'2026-09-07','Europe/Istanbul','front','front-1.jpg',6,'x')`, [now]);
    await tx.exec(`INSERT INTO settings (key, value_json, updated_at_utc) VALUES ('appLock.enabled','true',?)`, [now]);
    await tx.exec(`INSERT INTO lab_results (id, local_date_key, marker, value, unit)
      VALUES ('l1','2026-09-07','ferritin',88,'ng/mL')`);
  });
  await blobs.write(join(env.photosDir, 'front-1.jpg'), new Uint8Array([1, 2, 3, 250, 255, 0]));
}

async function snapshot(env: Env): Promise<Record<string, unknown[]>> {
  return env.db.withTransaction(async (tx) => {
    const out: Record<string, unknown[]> = {};
    for (const t of await userTables(tx)) {
      const rows = await tx.all<Record<string, unknown>>(`SELECT * FROM ${t}`);
      if (rows.length) out[t] = rows.map((r) => ({ ...r }));
    }
    return out;
  });
}

const withEnv = async (fn: (e: Env) => Promise<void>) => {
  const e = await makeEnv();
  try { await fn(e); } finally { e.cleanup(); }
};

// ---------------------------------------------------------------- kapsam
test('R95.1 · yedek kapsamı ŞEMADAN türetilir; yalnızca iki tablo hariç', async () => {
  await withEnv(async (env) => {
    const all = await env.db.withTransaction(async (tx) =>
      tx.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`));
    const covered = await env.db.withTransaction((tx) => userTables(tx));
    const missing = all.map((r) => r.name).filter((n) => !covered.includes(n) && !EXCLUDED_TABLES.has(n));
    assert.deepEqual(missing, [], 'kapsam dışı kalan tablo olmamalı');
    assert.equal(covered.length, all.length - EXCLUDED_TABLES.size);
    assert.ok(covered.includes('supplements') && covered.includes('cardio_logs') && covered.includes('lab_results'),
      'R95.1 listesindeki tablolar kapsamda');
  });
});

// ---------------------------------------------------------------- AT-14
test('AT-14 · export → sıfırla → import: tüm veri ve fotoğraflar geri gelir', async () => {
  await withEnv(async (env) => {
    await seedUserData(env);
    const before = await snapshot(env);

    const { zip, manifest, fileName } = await env.exporter.export();
    assert.match(fileName, /^v90-backup-20260907-0800\.zip$/);
    assert.equal(manifest.formatVersion, 1);
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.photos.count, 1);
    assert.equal(manifest.tables.weight_logs, 1);
    assert.equal(manifest.tables.lab_results, 1);
    assert.equal(Object.keys(manifest.photoShas).length, 1);

    // "app reset": tüm kullanıcı verisi ve fotoğraflar silinir
    await env.db.withTransaction(async (tx) => {
      for (const t of await userTables(tx)) await tx.exec(`DELETE FROM ${t}`);
    });
    await blobs.removeDir(env.photosDir);
    assert.deepEqual(await snapshot(env), {}, 'sıfırlandı');

    const report = await env.importer.import(zip);
    assert.equal(report.tables.weight_logs, 1);
    assert.equal(report.photos, 1);

    const after = await snapshot(env);
    assert.deepEqual(after, before, 'tüm tablolar birebir geri geldi');
    const photo = await blobs.read(join(env.photosDir, 'front-1.jpg'));
    assert.deepEqual([...photo], [1, 2, 3, 250, 255, 0], 'fotoğraf içeriği birebir');
    assert.ok(await blobs.exists(report.preImportDbPath), 'geri alma için pre-import kopyası duruyor');
    const rp = JSON.parse(fromUtf8(await blobs.read(report.restorePointPath)));
    assert.equal(rp.fromSchemaVersion, 1);
  });
});

test('AT-14 · yedek ZIP\'i standart bir araçla okunabilir', async () => {
  await withEnv(async (env) => {
    await seedUserData(env);
    const { zip } = await env.exporter.export();
    const entries = await archiver.read(zip);
    assert.deepEqual(entries.map((e) => e.path).sort(), ['data.json', 'manifest.json', 'photos/front-1.jpg']);
    assert.doesNotThrow(() => JSON.parse(fromUtf8(entries.find((e) => e.path === 'manifest.json')!.data)));
  });
});

// ---------------------------------------------------------------- AT-15
async function expectUntouched(env: Env, before: Record<string, unknown[]>, run: () => Promise<unknown>, stage: string) {
  await assert.rejects(run, (e: unknown) => {
    assert.ok(e instanceof BackupImportError, `BackupImportError bekleniyordu: ${String(e)}`);
    assert.equal(e.stage, stage);
    assert.equal(e.messageTr, 'İçe aktarma başarısız; mevcut verin değişmedi.');
    return true;
  });
  assert.deepEqual(await snapshot(env), before, `${stage}: mevcut veri değişmemeli (R95.7)`);
  const photo = await blobs.read(join(env.photosDir, 'front-1.jpg'));
  assert.deepEqual([...photo], [1, 2, 3, 250, 255, 0], `${stage}: fotoğraflar değişmemeli`);
}

test('AT-15 · bozuk yedekler mevcut veriyi asla silmez', async () => {
  await withEnv(async (env) => {
    await seedUserData(env);
    const before = await snapshot(env);
    const { zip } = await env.exporter.export();
    const entries = await archiver.read(zip);
    const rebuild = (es: typeof entries) => archiver.write(es);
    const get = (p: string) => entries.find((e) => e.path === p)!;

    // 1) ZIP değil
    await expectUntouched(env, before, () => env.importer.import(utf8('bu bir zip değil')), 'archive');

    // 2) manifest yok
    await expectUntouched(env, before,
      async () => env.importer.import(await rebuild(entries.filter((e) => e.path !== 'manifest.json'))), 'manifest');

    // 3) data.json kurcalanmış → sha256 tutmaz
    const tampered = JSON.parse(fromUtf8(get('data.json').data));
    tampered.tables.weight_logs[0].weight_kg = 60;
    await expectUntouched(env, before, async () => env.importer.import(await rebuild(
      entries.map((e) => (e.path === 'data.json' ? { path: e.path, data: utf8(JSON.stringify(tampered)) } : e)))), 'checksum');

    // 4) manifest bozuk
    await expectUntouched(env, before, async () => env.importer.import(await rebuild(
      entries.map((e) => (e.path === 'manifest.json' ? { path: e.path, data: utf8('{"formatVersion":9}') } : e)))), 'manifest');

    // 5) uygulamadan yeni şema sürümü
    const future = JSON.parse(fromUtf8(get('manifest.json').data));
    future.schemaVersion = 99;
    const futureData = JSON.parse(fromUtf8(get('data.json').data));
    futureData.schemaVersion = 99;
    const futureBytes = utf8(JSON.stringify(futureData));
    future.dataSha256 = await nodeSha256(JSON.stringify(futureData));
    await expectUntouched(env, before, async () => env.importer.import(await rebuild([
      { path: 'manifest.json', data: utf8(JSON.stringify(future)) },
      { path: 'data.json', data: futureBytes },
      ...entries.filter((e) => e.path.startsWith('photos/')),
    ])), 'version');

    // 6) satır şemaya uymuyor (sayısal kolonda metin)
    const badRow = JSON.parse(fromUtf8(get('data.json').data));
    badRow.tables.weight_logs[0].weight_kg = 'yüz yedi';
    const badBytes = utf8(JSON.stringify(badRow));
    const badManifest = { ...JSON.parse(fromUtf8(get('manifest.json').data)), dataSha256: await nodeSha256(JSON.stringify(badRow)) };
    await expectUntouched(env, before, async () => env.importer.import(await rebuild([
      { path: 'manifest.json', data: utf8(JSON.stringify(badManifest)) },
      { path: 'data.json', data: badBytes },
      ...entries.filter((e) => e.path.startsWith('photos/')),
    ])), 'validation');

    // 7) fotoğraf sha uyuşmuyor
    await expectUntouched(env, before, async () => env.importer.import(await rebuild(
      entries.map((e) => (e.path.startsWith('photos/') ? { path: e.path, data: new Uint8Array([9, 9, 9]) } : e)))), 'photos');

    // Sağlam yedek hâlâ çalışıyor: başarısızlıklar kalıcı hasar bırakmadı.
    const ok = await env.importer.import(zip);
    assert.equal(ok.photos, 1);
    assert.deepEqual(await snapshot(env), before);
  });
});

test('AT-15 · DB kısıtlarını ihlal eden yedek staging\'de yakalanır', async () => {
  await withEnv(async (env) => {
    await seedUserData(env);
    const before = await snapshot(env);
    const entries = await archiver.read((await env.exporter.export()).zip);
    const data = JSON.parse(fromUtf8(entries.find((e) => e.path === 'data.json')!.data));
    // measurement_samples → olmayan bir ölçüme bağlanıyor (FK ihlali)
    data.tables.measurement_samples[0].measurement_id = 'yok-boyle';
    const bytes = utf8(JSON.stringify(data));
    const manifest = { ...JSON.parse(fromUtf8(entries.find((e) => e.path === 'manifest.json')!.data)),
      dataSha256: await nodeSha256(JSON.stringify(data)) };
    await expectUntouched(env, before, async () => env.importer.import(await archiver.write([
      { path: 'manifest.json', data: utf8(JSON.stringify(manifest)) },
      { path: 'data.json', data: bytes },
      ...entries.filter((e) => e.path.startsWith('photos/')),
    ])), 'integrity');
  });
});

test('aktif antrenman varken import engellenir', async () => {
  await withEnv(async (env) => {
    await seedUserData(env);
    const { zip } = await env.exporter.export();
    const guarded = new BackupImporter({
      clock: env.clock, hash: nodeSha256, hashBytes: nodeSha256Bytes, archiver,
      hasActiveSession: async () => true,
      env: {
        dbPath: env.dbPath, photosDir: env.photosDir, blobs,
        openMigrated: async () => { throw new Error('açılmamalı'); },
        closeLive: async () => { throw new Error('kapanmamalı'); },
        reopenLive: async () => { throw new Error('açılmamalı'); },
      },
    });
    await assert.rejects(() => guarded.import(zip),
      (e: unknown) => e instanceof BackupImportError && e.stage === 'guard');
  });
});

test('boş veritabanı da yedeklenip geri yüklenebilir', async () => {
  await withEnv(async (env) => {
    const { zip, manifest } = await env.exporter.export();
    assert.equal(manifest.photos.count, 0);
    assert.ok(Object.values(manifest.tables).every((n) => n === 0));
    const report = await env.importer.import(zip);
    assert.equal(report.photos, 0);
    assert.deepEqual(await snapshot(env), {});
  });
});

// ---------------------------------------------------------------- senkronizasyon korumaları
test('BACKUP_MIGRATORS, DB migration\'larıyla senkron olmalı (03 §2)', async () => {
  const { MIGRATIONS } = await import('../src/core/db/migrations/index.ts');
  const { BACKUP_MIGRATORS, migrateBackup } = await import('../src/core/backup/migrators/index.ts');
  // 001_initial yedek dönüşümü gerektirmez; sonraki her sürüm gerektirir.
  for (const m of MIGRATIONS) {
    if (m.version === 1) continue;
    assert.ok(BACKUP_MIGRATORS[m.version],
      `${m.name} eklendi ama BACKUP_MIGRATORS[${m.version}] yok — eski yedekler içe aktarılamaz (R95.8)`);
  }
  // Aynı sürümde dönüşüm yapılmaz
  const data = { schemaVersion: 1, tables: {} };
  assert.deepEqual(migrateBackup(data, 1), data);
  assert.throws(() => migrateBackup(data, 2), /yedek migrator eksik/);
});

test('elle yazılan ZIP standart bir araçla okunabilir (bağımsız doğrulama)', async (t) => {
  const { spawnSync } = await import('node:child_process');
  if (spawnSync('python3', ['-c', 'import zipfile']).status !== 0) {
    return t.skip('python3 yok');
  }
  await withEnv(async (env) => {
    await seedUserData(env);
    const { zip } = await env.exporter.export();
    const zipPath = join(env.dir, 'check.zip');
    await blobs.write(zipPath, zip);

    const r = spawnSync('python3', ['-c', `
import zipfile, json, sys
with zipfile.ZipFile(${JSON.stringify(zipPath)}) as z:
    assert z.testzip() is None, 'CRC bozuk'
    names = sorted(z.namelist())
    m = json.loads(z.read('manifest.json'))
    d = json.loads(z.read('data.json'))
    photo = list(z.read('photos/front-1.jpg'))
    print(json.dumps({'names': names, 'weight': d['tables']['weight_logs'][0]['weight_kg'],
                      'photos': m['photos']['count'], 'photo': photo}))
`], { encoding: 'utf8' });
    assert.equal(r.status, 0, `python doğrulaması başarısız: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.names, ['data.json', 'manifest.json', 'photos/front-1.jpg']);
    assert.equal(out.weight, 107, 'harici araç veriyi doğru okudu');
    assert.equal(out.photos, 1);
    assert.deepEqual(out.photo, [1, 2, 3, 250, 255, 0], 'ikili içerik bozulmadı');
  });
});

test('harici araçla yazılmış ZIP de içe aktarılabilir', async (t) => {
  const { spawnSync } = await import('node:child_process');
  if (spawnSync('python3', ['-c', 'import zipfile']).status !== 0) return t.skip('python3 yok');
  await withEnv(async (env) => {
    await seedUserData(env);
    const before = await snapshot(env);
    const entries = await archiver.read((await env.exporter.export()).zip);
    // Aynı içeriği Python ile yeniden paketle (farklı sıkıştırma ayarları)
    const dir = join(env.dir, 'repack');
    await blobs.ensureDir(dir);
    for (const e of entries) await blobs.write(join(dir, e.path), e.data);
    const zipPath = join(env.dir, 'repacked.zip');
    const r = spawnSync('python3', ['-c', `
import zipfile, os
src, dst = ${JSON.stringify(dir)}, ${JSON.stringify(zipPath)}
with zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(src):
        for f in files:
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, src))
`], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);

    await env.db.withTransaction(async (tx) => {
      for (const t2 of await userTables(tx)) await tx.exec(`DELETE FROM ${t2}`);
    });
    await env.importer.import(await blobs.read(zipPath));
    assert.deepEqual(await snapshot(env), before, 'harici ZIP\'ten tam geri yükleme');
  });
});
