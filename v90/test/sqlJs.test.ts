// Web veritabanı yolu — sql.js + görüntü deposu (docs/v90/02-architecture.md §12.2, ADR-013).
//
// Tarayıcıda SQLCipher yoktur: SQLite bellekte (sql.js) koşar, her COMMIT
// sonrası görüntü depoya yazılır ve depo AES-GCM ile sarmalanır. Bu dosya
// üç şeyi doğrular: (1) sürücü portu gerçekten SQLite gibi davranıyor,
// (2) kalıcılık COMMIT'e bağlı — geri alınan hiçbir şey depoya düşmüyor,
// (3) şifreli depo düz metin sızdırmıyor ve yanlış anahtar açıkça reddediliyor,
// (4) kirli bayrak: salt okuyan transaction depoya dokunmuyor; (5) son iyi kopya:
// depo yazamazsa bellek depodan önde kalmıyor. Sonunda uygulama bileşimi
// (bootstrap) aynı depoyla uçtan uca koşar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FakeClock } from '../src/core/clock/dateKey.ts';
import { bootstrap, BootstrapError } from '../src/bootstrap/container.ts';
import type { Services } from '../src/bootstrap/container.ts';
import { DbOpenError, DbWriteError, MigrationFailedError } from '../src/core/db/errors.ts';
import { EncryptedImageStore, InMemoryKeyProvider } from '../src/core/db/EncryptedImageStore.ts';
import { ImageFileStore } from '../src/core/db/ImageFileStore.ts';
import { InMemoryImageStore } from '../src/core/db/imageStore.ts';
import type { ImageStore } from '../src/core/db/imageStore.ts';
import { MigrationRunner, backupPathFor } from '../src/core/db/MigrationRunner.ts';
import { MIGRATIONS } from '../src/core/db/migrations/index.ts';
import { makeSqlJsProvider } from '../src/core/db/SqlJsProvider.ts';
import { isReadOnlySql, sqlJsDriver } from '../src/core/db/drivers/sqlJs.ts';
import { nodeSha256 } from '../src/core/db/hash.node.ts';
import type { SeedBundle } from '../src/core/db/seed.ts';
import type { Migration } from '../src/core/db/types.ts';
import { loadDashboard } from '../src/features/program/dashboardQuery.ts';
import {
  saveBiceps, saveEquipmentAndFinish, saveInitialValues, saveTrainingProfile, startProgram,
} from '../src/features/profile/onboardingCommands.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const PATH = 'v90.sqlite';                 // depo anahtarı; dosya yolu değil
const NOW = '2026-09-14T09:00:00.000Z';    // Pazartesi
const TZ = 'Europe/Istanbul';
const SECRET = 'kan-degeri-88-hemoglobin';

const contains = (bytes: Uint8Array | undefined, needle: string): boolean =>
  bytes !== undefined && Buffer.from(bytes).includes(Buffer.from(needle, 'utf8'));

function seedBundle(): SeedBundle {
  const ex = readJson('data/exercises.json');
  return {
    seedVersion: ex.seedVersion, exercises: ex.exercises, relations: ex.relations,
    program: readJson('data/programs/v90.json'),
    targets: readJson('data/muscle-volume-targets.json').targets,
    foods: readJson('data/food-items.json').foods,
  };
}

let idCounter = 0;
const testId = () => `id-${String(++idCounter).padStart(4, '0')}`;

const open = (store: ImageStore, path = PATH) => makeSqlJsProvider({ path, store }).open();

async function boot(store: ImageStore, isProduction = false): Promise<{ s: Services; clock: FakeClock }> {
  const clock = new FakeClock(NOW, TZ);
  const s = await bootstrap({
    clock,
    files: new ImageFileStore(store),
    hash: nodeSha256,
    seed: seedBundle(),
    build: { isProduction, isExpoGo: false },
    makeProvider: (p) => makeSqlJsProvider({ path: p, store }),
    dbPath: PATH,
    log: () => { /* geliştirme uyarısı testte sessiz */ },
  });
  return { s, clock };
}

/** Ekranların B.1–B.4'te yaptığı yazmaların aynısı (test/appFlow.test.ts). */
async function completeOnboarding(s: Services): Promise<void> {
  await s.db.withTransaction(async (tx) => {
    await saveTrainingProfile(tx, s.clock, testId, {
      experience: 'intermediate', gymType: 'fullCommercialGym',
      typicalWorkoutMinutes: 60, preferredWorkoutDays: [1, 3, 5],
      sleepTargetHours: 7.5, painAreas: [],
    });
    await saveInitialValues(tx, s.clock, testId, {
      heightCm: 187, weightKg: 107,
      measurementsCm: { waist: 95, shoulder: 137, chest: 110, abdomen: 114, hip: 119, forearm: 37 },
      nutritionTarget: readJson('data/initial-profile.json').nutritionTarget,
    });
    await saveBiceps(tx, s.clock, testId, {
      mode: 'single', samples: { bicepsFlexed: [38.5, 38.7] },
    }, (samples) => ({
      finalCm: Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10,
      aggregation: samples.length === 1 ? 'single' : 'mean',
    }));
    await saveEquipmentAndFinish(tx, s.clock, testId, 'fullCommercialGym',
      (readJson('data/equipment-presets.json') as { presets: Record<string, string[]> })
        .presets.fullCommercialGym as never);
    await startProgram(tx, s.clock, testId);
  });
  await s.catalog.reload();
}

// ───────────────────────────────────────────── (a) sürücü temelleri

test('sql.js sürücüsü · exec/get/all, parametreler, NULL ve BLOB SQLite gibi davranır', async () => {
  const db = await open(new InMemoryImageStore());
  try {
    assert.equal(db.isEncrypted, false, 'düz depo şifreli saymaz (R93.4)');
    await db.execScript('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, n REAL, b BLOB, flag INTEGER)');

    const r1 = await db.exec('INSERT INTO t (name, n, b, flag) VALUES (?,?,?,?)', ['a', 1.5, new Uint8Array([1, 2, 3]), true]);
    assert.equal(r1.changes, 1);
    const r2 = await db.exec('INSERT INTO t (name, n, b, flag) VALUES (?,?,?,?)', [null, undefined, null, 7n]);
    assert.equal(r2.changes, 1);

    const rows = await db.all<{ id: number; name: string | null; n: number | null; b: Uint8Array | null; flag: number }>(
      'SELECT id, name, n, b, flag FROM t ORDER BY id');
    assert.equal(rows.length, 2);
    assert.deepEqual({ ...rows[0]!, b: Array.from(rows[0]!.b!) }, { id: 1, name: 'a', n: 1.5, b: [1, 2, 3], flag: 1 });
    assert.ok(rows[0]!.b instanceof Uint8Array, 'BLOB Uint8Array olarak döner');
    assert.deepEqual(rows[1], { id: 2, name: null, n: null, b: null, flag: 7 }, 'undefined → NULL, bigint → sayı');

    const one = await db.get<{ name: string }>('SELECT name FROM t WHERE id = ?', [1]);
    assert.deepEqual(one, { name: 'a' });
    assert.equal(await db.get('SELECT name FROM t WHERE id = ?', [99]), undefined, 'satır yoksa undefined');

    const upd = await db.exec('UPDATE t SET flag = 0');
    assert.equal(upd.changes, 2);

    await assert.rejects(() => db.exec('INSERT INTO yok VALUES (1)'), /no such table: yok/);
    await assert.rejects(() => db.exec('SELECT ?', [{ nesne: 1 }]), TypeError);
  } finally { await db.close(); }
});

// ───────────────────────────────────────────── (b)(c) kalıcılık = COMMIT

test('ADR-013 · COMMIT sonrası görüntü depoda; aynı depodan açılan yeni sağlayıcı satırları görür', async () => {
  const store = new InMemoryImageStore();
  const db = await open(store);
  assert.equal(await store.exists(PATH), false, 'açılış tek başına görüntü yazmaz');

  await db.withTransaction(async (tx) => {
    await tx.execScript('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)');
    await tx.exec('INSERT INTO notes (body) VALUES (?)', ['ilk']);
  });
  assert.equal(await store.exists(PATH), true, 'COMMIT görüntüyü yazar');
  assert.ok(contains(store.raw(PATH), 'SQLite format 3'), 'düz depo SQLite dosyası tutar');

  // Transaction dışı tekil yazma da kalıcılaşır.
  const before = store.raw(PATH)!;
  await db.exec('INSERT INTO notes (body) VALUES (?)', ['ikinci']);
  assert.notDeepEqual(store.raw(PATH), before);
  await db.close();

  const again = await open(store);
  try {
    const rows = await again.all<{ body: string }>('SELECT body FROM notes ORDER BY id');
    assert.deepEqual(rows.map((r) => r.body), ['ilk', 'ikinci']);
  } finally { await again.close(); }
});

test('ADR-013 · ROLLBACK depoya hiçbir şey yazmaz; okumalar depoya dokunmaz', async () => {
  const store = new InMemoryImageStore();
  const db = await open(store);
  try {
    await db.withTransaction((tx) => tx.execScript('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)'));
    const committed = store.raw(PATH)!;

    await assert.rejects(() => db.withTransaction(async (tx) => {
      await tx.exec('INSERT INTO notes (body) VALUES (?)', ['kaybolacak']);
      throw new Error('vazgeçildi');
    }), /vazgeçildi/);
    assert.deepEqual(store.raw(PATH), committed, 'geri alınan yazma görüntüye düşmedi');
    assert.equal((await db.all('SELECT * FROM notes')).length, 0, 'bellekte de geri alındı');

    await db.get('SELECT count(*) AS n FROM notes');
    await db.all('SELECT * FROM notes');
    assert.deepEqual(store.raw(PATH), committed, 'get/all persist etmez');
  } finally { await db.close(); }
});

test('ADR-013 · depo yazamazsa hata yutulmaz: DbWriteError', async () => {
  const inner = new InMemoryImageStore();
  let fail = false;
  const store: ImageStore = {
    ...inner,
    isEncrypted: false,
    load: (n) => inner.load(n), remove: (n) => inner.remove(n), exists: (n) => inner.exists(n),
    size: (n) => inner.size(n), freeSpace: () => inner.freeSpace(),
    save: async (n, b) => { if (fail) throw new Error('kota doldu (simülasyon)'); await inner.save(n, b); },
  };
  const db = await open(store);
  try {
    await db.withTransaction((tx) => tx.execScript('CREATE TABLE t (x)'));
    fail = true;
    await assert.rejects(() => db.withTransaction((tx) => tx.exec('INSERT INTO t VALUES (1)')),
      (e: unknown) => {
        assert.ok(e instanceof DbWriteError);
        assert.match(e.message, /kalıcı depoya yazılamadı: kota doldu/);
        assert.equal(e.messageTr, 'Kaydedilemedi. Boş alanı kontrol edip tekrar dene.');
        return true;
      });
    await assert.rejects(() => db.exec('INSERT INTO t VALUES (2)'), DbWriteError);
  } finally { await db.close(); }
});

// ───────────────────────────────────────────── (d) yapışan PRAGMA'lar

test('sql.js sürücüsü · export sonrası foreign_keys AÇIK kalır (yapışan PRAGMA)', async () => {
  const store = new InMemoryImageStore();
  const db = await open(store);
  try {
    await db.withTransaction(async (tx) => {
      await tx.execScript(`
        CREATE TABLE parent (id INTEGER PRIMARY KEY);
        CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id));
      `);
    });
    // Birkaç COMMIT = birkaç export; her biri bağlantı PRAGMA'larını sıfırlar.
    for (let i = 1; i <= 3; i++) {
      await db.withTransaction((tx) => tx.exec('INSERT INTO parent (id) VALUES (?)', [i]));
    }
    const fk = await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys');
    assert.equal(fk?.foreign_keys, 1);
    await assert.rejects(
      () => db.withTransaction((tx) => tx.exec('INSERT INTO child (parent_id) VALUES (?)', [999])),
      /FOREIGN KEY constraint failed/);
    await assert.rejects(() => db.exec('INSERT INTO child (parent_id) VALUES (?)', [998]),
      /FOREIGN KEY constraint failed/);
    assert.equal((await db.all('SELECT * FROM child')).length, 0);
  } finally { await db.close(); }
});

test('sql.js sürücüsü · user_version görüntüyle taşınır, yeniden uygulanmaz', async () => {
  const store = new InMemoryImageStore();
  const db = await open(store);
  await db.execScript('PRAGMA user_version = 3');
  await db.withTransaction((tx) => tx.execScript('CREATE TABLE t (x)'));
  // Geri alınan transaction içindeki sürüm yazımı sonraki export'ta geri GELMEMELİ.
  await assert.rejects(() => db.withTransaction(async (tx) => {
    await tx.execScript('PRAGMA user_version = 9');
    throw new Error('vazgeçildi');
  }), /vazgeçildi/);
  await db.withTransaction((tx) => tx.exec('INSERT INTO t VALUES (1)'));
  assert.equal((await db.get<{ user_version: number }>('PRAGMA user_version'))?.user_version, 3);
  await db.close();

  const again = await open(store);
  try {
    assert.equal((await again.get<{ user_version: number }>('PRAGMA user_version'))?.user_version, 3);
  } finally { await again.close(); }
});

test('sql.js sürücüsü · sürücü portu ve :memory: yolu', async () => {
  const store = new InMemoryImageStore();
  const d = sqlJsDriver({ store });
  assert.equal(d.name, 'sql.js');
  assert.equal(d.supportsEncryption, false, 'SQLCipher değil: PRAGMA key asla gönderilmez (R93.4)');
  assert.equal(d.encryptsAtRest, false);
  assert.equal(sqlJsDriver({ store: new EncryptedImageStore(store, new InMemoryKeyProvider()) }).encryptsAtRest, true);

  const mem = await open(store, ':memory:');
  try {
    await mem.withTransaction((tx) => tx.execScript('CREATE TABLE t (x)'));
    assert.deepEqual(store.names(), [], ':memory: depoya yazmaz');
  } finally { await mem.close(); }
});

test('sql.js sürücüsü · bozuk görüntü açılışta DbOpenError', async () => {
  const store = new InMemoryImageStore();
  await store.save(PATH, new Uint8Array(Buffer.from('bu bir SQLite dosyası değil', 'utf8')));
  await assert.rejects(() => open(store), (e: unknown) => {
    assert.ok(e instanceof DbOpenError);
    assert.match(e.message, /veritabanı görüntüsü açılamadı \(sql\.js\): file is not a database/);
    return true;
  });
});

// ───────────────────────────────────────────── (e) şifreli depo

test('R93.5 · EncryptedImageStore: düz depoda ne SQLite başlığı ne tablo adı ne veri görünür', async () => {
  const inner = new InMemoryImageStore();
  const keys = new InMemoryKeyProvider();
  const store = new EncryptedImageStore(inner, keys);
  const db = await open(store);
  assert.equal(db.isEncrypted, true, 'şifreli depo → sağlayıcı şifreli (encryptsAtRest)');
  await db.withTransaction(async (tx) => {
    await tx.execScript('CREATE TABLE labs (id INTEGER PRIMARY KEY, note TEXT)');
    await tx.exec('INSERT INTO labs (note) VALUES (?)', [SECRET]);
  });
  await db.close();

  const raw = inner.raw(PATH);
  assert.ok(raw && raw.byteLength > 17, 'düz depoda şifreli görüntü var');
  assert.deepEqual(Array.from(raw.subarray(0, 5)), [0x56, 0x39, 0x30, 0x45, 0x01], 'V90E + sürüm 1');
  assert.equal(contains(raw, 'SQLite format 3'), false, 'SQLite başlığı sızmadı');
  assert.equal(contains(raw, 'labs'), false, 'tablo adı sızmadı');
  assert.equal(contains(raw, SECRET), false, 'veri sızmadı');
  assert.equal(await store.size(PATH), raw.byteLength, 'size şifreli boyutu verir');

  // Aynı anahtar: çözülür ve okunur.
  const again = await open(store);
  try {
    assert.deepEqual(await again.get('SELECT note FROM labs'), { note: SECRET });
  } finally { await again.close(); }

  // Her yazım yeni IV: aynı içerik iki kez aynı şifreli metni üretmez.
  const plain = (await store.load(PATH))!;
  await store.save('kopya', plain);
  assert.notDeepEqual(inner.raw('kopya'), raw);
  assert.deepEqual(await store.load('kopya'), plain);
});

test('R93.5 · yanlış anahtar, bozuk sihirli sayı ve kurcalanmış şifreli metin → DbOpenError', async () => {
  const inner = new InMemoryImageStore();
  const store = new EncryptedImageStore(inner, new InMemoryKeyProvider());
  const db = await open(store);
  await db.withTransaction((tx) => tx.execScript('CREATE TABLE labs (id INTEGER PRIMARY KEY)'));
  await db.close();

  const isOpenError = (e: unknown) => {
    assert.ok(e instanceof DbOpenError);
    assert.match(e.message, /görüntüsü bu anahtarla açılamadı/);
    assert.equal(e.messageTr, 'Veritabanı açılamadı.');
    return true;
  };

  // Başka anahtar (cihaz sıfırlama / anahtar kaybı senaryosu).
  const other = new EncryptedImageStore(inner, new InMemoryKeyProvider());
  await assert.rejects(() => other.load(PATH), isOpenError);
  await assert.rejects(() => open(other), isOpenError);

  // Sihirli sayı bozuk.
  const good = inner.raw(PATH)!;
  const badMagic = new Uint8Array(good); badMagic[0] = 0x00;
  await inner.save(PATH, badMagic);
  await assert.rejects(() => store.load(PATH), isOpenError);

  // Sürüm bilinmiyor.
  const badVersion = new Uint8Array(good); badVersion[4] = 0x02;
  await inner.save(PATH, badVersion);
  await assert.rejects(() => store.load(PATH), isOpenError);

  // Şifreli metnin bir baytı değişti → GCM etiketi tutmaz.
  const tampered = new Uint8Array(good); tampered[good.byteLength - 1] = tampered[good.byteLength - 1]! ^ 0xff;
  await inner.save(PATH, tampered);
  await assert.rejects(() => store.load(PATH), isOpenError);

  // Çok kısa.
  await inner.save(PATH, new Uint8Array([0x56, 0x39, 0x30, 0x45, 0x01]));
  await assert.rejects(() => store.load(PATH), isOpenError);

  // Anahtar yok edilince yeni anahtar üretilir; eski görüntü artık açılamaz.
  await inner.save(PATH, good);
  const keys = new InMemoryKeyProvider();
  const s2 = new EncryptedImageStore(inner, keys);
  await s2.save('x', new Uint8Array([1, 2, 3]));
  await keys.destroy();
  await assert.rejects(() => s2.load('x'), isOpenError);

  assert.equal(await store.load('yok'), null, 'olmayan görüntü null (hata değil)');
});

// ───────────────────────────────────────────── (f) ImageFileStore

test('ImageFileStore · copy/exists/size/remove aynı depo üzerinde', async () => {
  const store = new InMemoryImageStore(12345);
  const files = new ImageFileStore(store);
  assert.equal(await files.exists('a'), false);
  await assert.rejects(() => files.size('a'), /görüntü yok/);
  await assert.rejects(() => files.copy('a', 'b'), /kopyalanacak görüntü yok/);

  await store.save('a', new Uint8Array([1, 2, 3, 4]));
  assert.equal(await files.exists('a'), true);
  assert.equal(await files.size('a'), 4);
  await files.copy('a', 'b');
  assert.deepEqual(await store.load('b'), new Uint8Array([1, 2, 3, 4]));
  assert.equal(await files.freeSpace(), 12345);

  await files.remove('a');
  assert.equal(await files.exists('a'), false);
  await files.remove('a');                        // yoksa sessiz
  assert.deepEqual(store.names(), ['b']);
});

test('R92.1–R92.6 · MigrationRunner web deposunda: .bak aynı depoda, hata yedekten döner', async () => {
  const inner = new InMemoryImageStore();
  const store = new EncryptedImageStore(inner, new InMemoryKeyProvider());
  const files = new ImageFileStore(store);
  const deps = (migrations?: readonly Migration[]) => ({
    provider: makeSqlJsProvider({ path: PATH, store }), files, hash: nodeSha256,
    clock: new FakeClock('2026-09-07T05:00:00.000Z'),
    ...(migrations ? { migrations } : {}),
  });

  const r1 = await new MigrationRunner(deps()).run();
  assert.deepEqual(r1.applied, [1]);
  await r1.db.exec(
    `INSERT INTO weight_logs (id, measured_at_utc, local_date_key, time_zone, weight_kg)
     VALUES ('w1','2026-09-07T05:00:00.000Z','2026-09-07','Europe/Istanbul',107)`);
  await r1.db.close();

  const bad: Migration = {
    version: 2, name: '002_bozuk', source: 'bozuk',
    async up(tx) {
      await tx.execScript('CREATE TABLE gecici (x INTEGER)');
      await tx.execScript('SELECT bu_fonksiyon_yok()');
    },
  };
  await assert.rejects(() => new MigrationRunner(deps([MIGRATIONS[0]!, bad])).run(),
    (e: unknown) => e instanceof MigrationFailedError && e.version === 2 && e.restored === true);

  const backup = backupPathFor(PATH, 1);
  assert.equal(await store.exists(backup), true, 'yedek görüntüsü aynı depoda');
  assert.equal(contains(inner.raw(backup), 'SQLite format 3'), false, 'yedek de şifreli');

  const after = await new MigrationRunner(deps()).run();
  try {
    assert.equal(after.fromVersion, 1);
    assert.deepEqual(await after.db.get('SELECT weight_kg FROM weight_logs WHERE id = ?', ['w1']), { weight_kg: 107 });
    assert.equal((await after.db.get<{ n: number }>(`SELECT COUNT(*) n FROM sqlite_master WHERE name='gecici'`))!.n, 0);
  } finally { await after.db.close(); }
});

// ───────────────────────────────────────────── (g) bootstrap + R93.7

test('R93.7 · production bootstrap şifreli görüntü deposuyla açılır, düz depoyla durur', async () => {
  const inner = new InMemoryImageStore();
  const { s } = await boot(new EncryptedImageStore(inner, new InMemoryKeyProvider()), true);
  try {
    assert.equal(s.isEncrypted, true);
    assert.equal(s.dbPath, PATH);
    assert.equal(s.seed.insertedExercises, 32);
    assert.equal(contains(inner.raw(PATH), 'SQLite format 3'), false, 'canlı görüntü düz depoda şifreli');
  } finally { await s.close(); }

  const err = await boot(new InMemoryImageStore(), true).then(() => null, (e: unknown) => e);
  assert.ok(err instanceof BootstrapError);
  assert.equal(err.step, 'build');
});

// ───────────────────────────────────────────── (h) uçtan uca

test('uçtan uca · onboarding → dashboard → kapat → aynı depodan yeniden aç: program duruyor', async () => {
  const inner = new InMemoryImageStore();
  const keys = new InMemoryKeyProvider();
  const store = new EncryptedImageStore(inner, keys);

  const first = await boot(store, true);
  await completeOnboarding(first.s);
  const d = await first.s.db.withTransaction((tx) => loadDashboard(tx, first.s.clock, first.s.scheduler));
  assert.equal(d.card.kind, 'next', 'plan otomatik oluşturulmalı');
  assert.deepEqual(d.bicepsKpi, { state: 'known', valueCm: 38.6 });
  const programId = (await first.s.db.get<{ id: string }>('SELECT id FROM programs LIMIT 1'))!.id;
  await first.s.close();

  // Yeni "sekme": aynı depo, aynı anahtar, yeni bootstrap.
  const second = await boot(new EncryptedImageStore(inner, keys), true);
  try {
    assert.equal(second.s.seed.skipped, true, 'seed zaten kurulu');
    const program = await second.s.db.get<{ id: string; training_sequence_index: number }>(
      'SELECT id, training_sequence_index FROM programs LIMIT 1');
    assert.equal(program?.id, programId, 'program satırı kalıcılaşmış');
    assert.equal(program?.training_sequence_index, 0);
    const again = await second.s.db.withTransaction((tx) => loadDashboard(tx, second.s.clock, second.s.scheduler));
    assert.equal(again.card.kind, 'next');
    assert.deepEqual(again.bicepsKpi, { state: 'known', valueCm: 38.6 });
  } finally { await second.s.close(); }
});

// ───────────────────────────────────────────── (i) kirli bayrak ve son iyi kopya

/** `save` sayar ve istenirse sıradaki N yazımı reddeder (kota doldu simülasyonu). */
class CountingImageStore extends InMemoryImageStore {
  saves = 0;
  failNext = 0;
  override async save(name: string, bytes: Uint8Array): Promise<void> {
    if (this.failNext > 0) { this.failNext--; throw new Error('kota doldu (simülasyon)'); }
    this.saves++;
    await super.save(name, bytes);
  }
}

test('isReadOnlySql · sınıflandırma tutucudur: emin olunmayan her şey kirli', () => {
  for (const sql of [
    'SELECT 1', '  select 1;', 'EXPLAIN SELECT 1', 'BEGIN IMMEDIATE', 'COMMIT', 'END', 'ROLLBACK',
    'SAVEPOINT a', 'RELEASE a', 'VALUES (1)', 'PRAGMA foreign_keys', 'PRAGMA table_info(t)',
    '-- yorum\nSELECT 1', '/* blok */ SELECT 1', '', '   ', '-- yalnız yorum',
  ]) assert.equal(isReadOnlySql(sql), true, JSON.stringify(sql));
  for (const sql of [
    'INSERT INTO t VALUES (1)', 'UPDATE t SET x = 1', 'DELETE FROM t', 'CREATE TABLE t (x)', 'DROP TABLE t',
    'WITH c AS (SELECT 1) INSERT INTO t SELECT * FROM c', 'PRAGMA user_version = 3', 'PRAGMA foreign_keys = ON',
    'SELECT 1; INSERT INTO t VALUES (1)', "SELECT ';'", 'ATTACH x AS y', '(SELECT 1)', '/* açık yorum SELECT 1',
  ]) assert.equal(isReadOnlySql(sql), false, JSON.stringify(sql));
});

test('F2 · salt okuyan transaction depoya dokunmaz; yazan transaction tek persist eder', async () => {
  const store = new CountingImageStore();
  const db = await open(store);
  try {
    await db.withTransaction((tx) => tx.execScript('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)'));
    assert.equal(store.saves, 1, 'yazan transaction bir kez persist eder');

    await db.withTransaction(async (tx) => {                 // dashboard/liste ekranı gibi: yalnızca okuma
      await tx.all('SELECT * FROM notes');
      await tx.get('PRAGMA user_version');
      await tx.exec('SELECT count(*) FROM notes');
      await tx.execScript('-- yorum\n  /* blok */ SELECT 1');
      await tx.execScript('EXPLAIN SELECT 1');
    });
    assert.equal(store.saves, 1, 'salt okuyan COMMIT persist etmedi');

    await db.execScript('PRAGMA foreign_keys');               // tx dışı okumalar da
    await db.exec('SELECT 1');
    await db.get('SELECT 1');
    await db.all('SELECT 1');
    assert.equal(store.saves, 1);

    await db.withTransaction((tx) => tx.exec('INSERT INTO notes (body) VALUES (?)', ['x']));
    assert.equal(store.saves, 2, 'yazan transaction persist etti');
    await db.exec('PRAGMA user_version = 7');                 // `=` içeren PRAGMA dosyayı değiştirir
    assert.equal(store.saves, 3);

    await assert.rejects(db.withTransaction(async (tx) => {  // geri alınan yazma: COMMIT yok, persist yok
      await tx.exec('INSERT INTO notes (body) VALUES (?)', ['y']);
      throw new Error('vazgeçildi');
    }), /vazgeçildi/);
    assert.equal(store.saves, 3);
    assert.equal((await db.get<{ n: number }>('SELECT count(*) AS n FROM notes'))!.n, 1);
  } finally { await db.close(); }
});

test('F3 · depo yazamazsa bellek depoyla hizalanır: satır görünmez, aynı yazma yeniden denenebilir', async () => {
  const store = new CountingImageStore();
  const db = await open(store);
  try {
    await db.withTransaction((tx) => tx.execScript('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT UNIQUE)'));
    assert.equal(store.saves, 1);

    store.failNext = 1;
    await assert.rejects(db.withTransaction((tx) => tx.exec('INSERT INTO t (v) VALUES (?)', ['a'])),
      (e: unknown) => e instanceof DbWriteError && /kota doldu/.test(e.message));
    assert.equal(await db.get('SELECT v FROM t WHERE v = ?', ['a']), undefined, 'kaydedilemeyen satır bellekte de yok');
    assert.equal((await db.get<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys, 1,
      'yapışan PRAGMA yeniden açılışta da açık');

    await db.withTransaction((tx) => tx.exec('INSERT INTO t (v) VALUES (?)', ['a']));   // UNIQUE'e takılmaz
    assert.deepEqual(await db.all('SELECT v FROM t'), [{ v: 'a' }]);
    assert.equal(store.saves, 2);

    store.failNext = 1;                                       // tx dışı yazma da aynı
    await assert.rejects(db.exec('INSERT INTO t (v) VALUES (?)', ['b']), DbWriteError);
    assert.deepEqual(await db.all('SELECT v FROM t ORDER BY v'), [{ v: 'a' }]);
    await db.exec('INSERT INTO t (v) VALUES (?)', ['b']);
    assert.deepEqual(await db.all('SELECT v FROM t ORDER BY v'), [{ v: 'a' }, { v: 'b' }]);
    assert.equal(store.saves, 3);
  } finally { await db.close(); }

  const again = await open(store);
  try {
    assert.deepEqual(await again.all('SELECT v FROM t ORDER BY v'), [{ v: 'a' }, { v: 'b' }], 'depo ile bellek aynı');
  } finally { await again.close(); }
});

test('F3 · taze DB\'de ilk persist başarısızsa bellek boşa döner; migration yeniden denenebilir', async () => {
  const store = new CountingImageStore();
  store.failNext = 1;
  const db = await open(store);
  try {
    await assert.rejects(db.withTransaction((tx) => tx.execScript('CREATE TABLE t (x); PRAGMA user_version = 1')), DbWriteError);
    assert.equal((await db.get<{ n: number }>('SELECT count(*) AS n FROM sqlite_master'))!.n, 0, 'bellek boş');
    assert.equal((await db.get<{ user_version: number }>('PRAGMA user_version'))!.user_version, 0);
    assert.equal(await store.exists(PATH), false, 'depoda görüntü yok');
    await db.withTransaction((tx) => tx.execScript('CREATE TABLE t (x); PRAGMA user_version = 1'));
    assert.equal(await store.exists(PATH), true);
    assert.equal((await db.get<{ user_version: number }>('PRAGMA user_version'))!.user_version, 1);
  } finally { await db.close(); }

  // Gerçek MigrationRunner: ilk migration'ın persist'i düşer → MigrationFailedError; ikinci koşu temiz başlar.
  const fresh = new CountingImageStore();
  fresh.failNext = 1;
  const deps = () => ({
    provider: makeSqlJsProvider({ path: PATH, store: fresh }), files: new ImageFileStore(fresh),
    hash: nodeSha256, clock: new FakeClock(NOW),
  });
  await assert.rejects(new MigrationRunner(deps()).run(), MigrationFailedError);
  assert.equal(await fresh.exists(PATH), false, 'yarım görüntü yok');
  const r = await new MigrationRunner(deps()).run();
  try {
    assert.deepEqual(r.applied, [1]);
    assert.equal(await fresh.exists(PATH), true);
  } finally { await r.db.close(); }
});
