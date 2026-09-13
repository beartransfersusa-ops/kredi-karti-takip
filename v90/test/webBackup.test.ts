// Web yığını uçtan uca — docs/v90/02-architecture.md §12.2, §12.3; ADR-013
// Karar 2, 3, 6; AT-14, AT-15 (sql.js yolunda Node'da).
//
// ADR-013 "AT-14/AT-15 sql.js yolunda Node'da koşar" der; bu dosya o iddiayı
// gerçekten koşturur. Bileşim tarayıcıdakiyle (src/platform/web/stores.ts,
// blobs.web.ts, db.web.ts) BİRE BİR aynıdır; yalnızca IndexedDB yerine
// bellek depoları vardır:
//   görüntü    EncryptedImageStore(InMemoryImageStore, keys)
//   kv         EncryptedKvStore(InMemoryKvStore, keys)          ← AYNI anahtar
//   blobs      RoutedBlobStore(PrefixBlobStore(kv), görüntü)
//   sağlayıcı  makeSqlJsProvider({ path, store: görüntü })
//   files      ImageFileStore(görüntü)
//   bootstrap  src/bootstrap/container.ts, dbPath 'v90.sqlite'
// Senaryolar: (a) fotoğrafsız yedek aynı yığına geri yüklenir (F1 regresyonu),
// (b) fotoğraf → export → sıfırla → import bayt bayt aynı ve düz depoda görünmez
// (R93.1), (c) bozuk ZIP reddedilir; canlı görüntü ve fotoğraflar bayt bayt
// aynı kalır (R95.7). Deterministik: FakeClock, sayaç kimlikleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { bootstrap } from '../src/bootstrap/container.ts';
import type { Services } from '../src/bootstrap/container.ts';
import { FakeClock } from '../src/core/clock/dateKey.ts';
import { ZipArchiver } from '../src/core/backup/archive.ts';
import { EncryptedKvStore } from '../src/core/backup/EncryptedKvStore.ts';
import { BackupImportError } from '../src/core/backup/errors.ts';
import { InMemoryKvStore } from '../src/core/backup/KvStore.ts';
import { PrefixBlobStore } from '../src/core/backup/PrefixBlobStore.ts';
import { RoutedBlobStore } from '../src/core/backup/RoutedBlobStore.ts';
import { DATA_PATH, PHOTO_PREFIX, userTables } from '../src/core/backup/TableRegistry.ts';
import { EncryptedImageStore, InMemoryKeyProvider } from '../src/core/db/EncryptedImageStore.ts';
import { ImageFileStore } from '../src/core/db/ImageFileStore.ts';
import { InMemoryImageStore } from '../src/core/db/imageStore.ts';
import { nodeSha256, nodeSha256Bytes } from '../src/core/db/hash.node.ts';
import { makeSqlJsProvider } from '../src/core/db/SqlJsProvider.ts';
import type { SeedBundle } from '../src/core/db/seed.ts';
import { makeExporter, makeImporter } from '../src/features/backup/backupService.ts';
import type { BackupEnv } from '../src/features/backup/backupService.ts';
import type { BackupExporter } from '../src/core/backup/BackupExporter.ts';
import type { BackupImporter } from '../src/core/backup/BackupImporter.ts';
import { listPhotos, savePhoto } from '../src/features/photos/photoStore.ts';
import type { PhotoEnv, PhotoRow } from '../src/features/photos/photoStore.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const DB = 'v90.sqlite';                   // depo anahtarı; dosya yolu değil (blobs.web.ts ile aynı)
const PHOTOS = 'photos';                   // photosDir() (blobs.web.ts)
const NOW = '2026-09-14T09:00:00.000Z';
const TZ = 'Europe/Istanbul';
const SECRET = 'ferritin-88-hemoglobin';

let n = 0;
const newId = () => `id-${String(++n).padStart(4, '0')}`;

/** JPEG SOI + APP0/JFIF başlığı ve biraz gövde; `bytes`'ta 22 bayt. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
const containsBytes = (hay: Uint8Array | undefined, needle: Uint8Array | string): boolean =>
  hay !== undefined && Buffer.from(hay).includes(typeof needle === 'string' ? Buffer.from(needle, 'utf8') : Buffer.from(needle));

function seedBundle(): SeedBundle {
  const ex = readJson('data/exercises.json');
  return {
    seedVersion: ex.seedVersion, exercises: ex.exercises, relations: ex.relations,
    program: readJson('data/programs/v90.json'),
    targets: readJson('data/muscle-volume-targets.json').targets,
    foods: readJson('data/food-items.json').foods,
  };
}

// ── web yığını (stores.ts + blobs.web.ts + db.web.ts bileşimi, bellek depolarıyla)

interface Stack {
  keys: InMemoryKeyProvider;
  inner: InMemoryImageStore;               // düz görüntü deposu (IndexedDB "images" karşılığı)
  store: EncryptedImageStore;
  kvInner: InMemoryKvStore;                // düz kv deposu (IndexedDB "blobs" karşılığı)
  blobs: RoutedBlobStore;
  files: ImageFileStore;
}

function makeStack(): Stack {
  const keys = new InMemoryKeyProvider();
  const inner = new InMemoryImageStore();
  const store = new EncryptedImageStore(inner, keys);
  const kvInner = new InMemoryKvStore();
  const kv = new EncryptedKvStore(kvInner, keys);
  const blobs = new RoutedBlobStore(new PrefixBlobStore(kv), store);
  return { keys, inner, store, kvInner, blobs, files: new ImageFileStore(store) };
}

interface WebApp {
  s: Services; clock: FakeClock; photoEnv: PhotoEnv;
  exporter: BackupExporter; importer: BackupImporter;
}

async function boot(st: Stack): Promise<WebApp> {
  const clock = new FakeClock(NOW, TZ);
  const photoEnv: PhotoEnv = { blobs: st.blobs, photosDir: PHOTOS, hashBytes: nodeSha256Bytes, newId };
  const s = await bootstrap({
    clock, files: st.files, hash: nodeSha256, seed: seedBundle(),
    build: { isProduction: true, isExpoGo: false },
    photos: photoEnv,
    makeProvider: (p) => makeSqlJsProvider({ path: p, store: st.store }),
    dbPath: DB,
    log: () => { /* sessiz */ },
  });
  // Yedekleme ekranının bağladığı ortam (src/features/backup/backupService.ts).
  const env: BackupEnv = {
    db: () => s.db, clock, hash: nodeSha256, hashBytes: nodeSha256Bytes,
    blobs: st.blobs, dbPath: s.dbPath, photosDir: PHOTOS, appVersion: '0.1.0',
    openMigrated: s.openMigrated, closeLive: s.closeLive, reopenLive: s.reopenLive,
    hasActiveSession: async () => false,
  };
  return { s, clock, photoEnv, exporter: makeExporter(env), importer: makeImporter(env) };
}

/** Her katmandan bir satır: ölçüm + hassas laboratuvar değeri. */
async function insertSamples(s: Services): Promise<void> {
  await s.db.withTransaction(async (tx) => {
    await tx.exec(`INSERT INTO weight_logs (id, measured_at_utc, local_date_key, time_zone, weight_kg)
      VALUES ('w1', ?, '2026-09-14', ?, 107)`, [NOW, TZ]);
    await tx.exec(`INSERT INTO lab_results (id, local_date_key, marker, value, unit)
      VALUES ('l1', '2026-09-14', ?, 88, 'ng/mL')`, [SECRET]);
  });
}

/** "Uygulamayı sıfırla": tüm kullanıcı tabloları (seed dahil) boşaltılır. */
async function wipe(s: Services): Promise<void> {
  await s.db.withTransaction(async (tx) => {
    await tx.execScript('PRAGMA defer_foreign_keys = ON');
    for (const t of await userTables(tx)) await tx.exec(`DELETE FROM ${t}`);
  });
}

/** Düz depoların bayt bayt anlık görüntüsü (R95.7 karşılaştırması için). */
async function rawSnapshot(st: Stack): Promise<{ images: Array<[string, Uint8Array]>; kv: Array<[string, Uint8Array]> }> {
  const images: Array<[string, Uint8Array]> = [];
  for (const name of st.inner.names().sort()) images.push([name, new Uint8Array(st.inner.raw(name)!)]);
  const kv: Array<[string, Uint8Array]> = [];
  for (const k of await st.kvInner.keys('')) kv.push([k, (await st.kvInner.get(k))!]);
  return { images, kv };
}

// ───────────────────────────────────────────── (a) fotoğrafsız yedek

test('F1 · fotoğrafsız yedek: export → aynı yığına import başarılı; satırlar geri gelir', async () => {
  const st = makeStack();
  const app = await boot(st);
  try {
    assert.equal(app.s.isEncrypted, true, 'web yığını şifreli (R93.7)');
    await insertSamples(app.s);
    const { zip, manifest } = await app.exporter.export();
    assert.equal(manifest.photos.count, 0);
    assert.equal(manifest.tables.weight_logs, 1);
    assert.equal(await st.blobs.exists(PHOTOS), false, 'hiç fotoğraf yazılmadı: canlı dizin yok');

    await wipe(app.s);
    assert.equal(await app.s.db.get('SELECT 1 FROM weight_logs'), undefined, 'sıfırlandı');

    const report = await app.importer.import(zip);           // eskiden: "yeniden adlandırılacak dosya yok"
    assert.equal(report.photos, 0);
    assert.equal(report.tables.weight_logs, 1);
    assert.deepEqual(await app.s.db.get('SELECT weight_kg FROM weight_logs WHERE id = ?', ['w1']), { weight_kg: 107 });
    assert.deepEqual(await app.s.db.get('SELECT marker FROM lab_results WHERE id = ?', ['l1']), { marker: SECRET });

    assert.deepEqual(await st.blobs.list(PHOTOS), []);
    assert.equal(await st.blobs.exists(PHOTOS), true, 'boş fotoğraf dizini işaretle var');
    assert.equal(await st.blobs.exists(`${PHOTOS}.import`), false, 'staging taşındı');
    assert.equal(await st.blobs.exists('restore-point.json'), true, 'geri alma penceresi yazıldı');
    assert.ok(st.inner.names().includes('v90.pre-import.sqlite'), 'geri alma kopyası görüntü deposunda');
    assert.equal(st.inner.names().includes('v90.import.sqlite'), false, 'staging görüntüsü kalmadı');
    assert.equal(containsBytes(st.inner.raw('v90.pre-import.sqlite'), 'SQLite format 3'), false, 'kopya da şifreli');
  } finally { await app.s.close(); }
});

// ───────────────────────────────────────────── (b) fotoğraf round-trip

test('AT-14 · fotoğraf → export → sıfırla → import: baytlar aynı, satırlar geri; düz depoda fotoğraf görünmez (R93.1)', async () => {
  const st = makeStack();
  const app = await boot(st);
  try {
    await insertSamples(app.s);
    const row = await app.s.db.withTransaction((tx) => savePhoto(tx, app.clock, app.photoEnv, {
      bytes: JPEG, extension: 'jpg', pose: 'front', localDateKey: '2026-09-14',
    }));
    assert.deepEqual(await st.blobs.read(`${PHOTOS}/${row.file_name}`), JPEG);

    // Düz kv deposu: anahtar adı düz, değer şifreli; fotoğraf baytı ve JPEG işareti yok.
    assert.deepEqual(await st.kvInner.keys(''), [`${PHOTOS}/`, `${PHOTOS}/${row.file_name}`]);
    const raw = (await st.kvInner.get(`${PHOTOS}/${row.file_name}`))!;
    assert.deepEqual(Array.from(raw.subarray(0, 5)), [0x56, 0x39, 0x30, 0x45, 0x01], 'V90E çerçevesi');
    assert.equal(containsBytes(raw, JPEG), false);
    assert.equal(containsBytes(raw, JPEG.subarray(0, 4)), false, 'JPEG SOI/APP0 sızmadı');
    assert.equal(containsBytes(st.inner.raw(DB), SECRET), false, 'canlı görüntü şifreli');

    const { zip, manifest } = await app.exporter.export();
    assert.equal(manifest.photos.count, 1);
    assert.equal(manifest.photoShas[row.file_name], await nodeSha256Bytes(JPEG));
    const entry = (await new ZipArchiver().read(zip)).find((e) => e.path === `${PHOTO_PREFIX}${row.file_name}`);
    assert.deepEqual(entry?.data, JPEG, 'ZIP şifresiz, fotoğraf olduğu gibi (02 §12.2)');

    await wipe(app.s);
    await st.blobs.removeDir(PHOTOS);
    assert.equal(await st.blobs.exists(PHOTOS), false);
    assert.equal(st.kvInner.size, 0);

    const report = await app.importer.import(zip);
    assert.equal(report.photos, 1);
    assert.deepEqual(await st.blobs.read(`${PHOTOS}/${row.file_name}`), JPEG, 'fotoğraf bayt bayt aynı');
    assert.deepEqual(await st.blobs.list(PHOTOS), [row.file_name]);
    const back = await app.s.db.get<PhotoRow>('SELECT * FROM progress_photos WHERE id = ?', [row.id]);
    assert.equal(back?.file_name, row.file_name);
    assert.equal(back?.sha256, row.sha256);
    assert.equal(back?.bytes, JPEG.byteLength);
    assert.equal((await app.s.db.withTransaction(listPhotos)).length, 1);
    assert.deepEqual(await app.s.db.get('SELECT weight_kg FROM weight_logs WHERE id = ?', ['w1']), { weight_kg: 107 });

    // Geri yüklenen fotoğraf da düz depoda şifreli.
    const rawAgain = (await st.kvInner.get(`${PHOTOS}/${row.file_name}`))!;
    assert.equal(containsBytes(rawAgain, JPEG.subarray(0, 4)), false);
    assert.notDeepEqual(rawAgain, raw, 'yeni yazım, yeni IV');
  } finally { await app.s.close(); }
});

// ───────────────────────────────────────────── (c) bozuk ZIP

test('AT-15 / R95.7 · data.json kurcalanmış ZIP reddedilir; canlı görüntü ve fotoğraflar bayt bayt aynı', async () => {
  const st = makeStack();
  const app = await boot(st);
  try {
    await insertSamples(app.s);
    const row = await app.s.db.withTransaction((tx) => savePhoto(tx, app.clock, app.photoEnv, {
      bytes: JPEG, extension: 'jpg', pose: 'back', localDateKey: '2026-09-14',
    }));
    const { zip } = await app.exporter.export();

    const archiver = new ZipArchiver();
    const entries = await archiver.read(zip);
    const data = entries.find((e) => e.path === DATA_PATH)!;
    data.data[10] = data.data[10]! ^ 0xff;                  // data.json'da bir bayt çevrildi
    const badZip = await archiver.write(entries);

    const before = await rawSnapshot(st);
    await assert.rejects(app.importer.import(badZip), (e: unknown) => {
      assert.ok(e instanceof BackupImportError);
      assert.equal(e.stage, 'checksum');
      assert.equal(e.messageTr, 'İçe aktarma başarısız; mevcut verin değişmedi.');
      return true;
    });
    assert.deepEqual(await rawSnapshot(st), before, 'düz depolar bayt bayt aynı (görüntü YENİDEN YAZILMADI)');

    // Canlı DB açık ve okunur; fotoğraf yerinde.
    assert.deepEqual(await app.s.db.get('SELECT marker FROM lab_results WHERE id = ?', ['l1']), { marker: SECRET });
    assert.deepEqual(await st.blobs.read(`${PHOTOS}/${row.file_name}`), JPEG);
  } finally { await app.s.close(); }
});

test('AT-15 / R95.7 · fotoğrafı kurcalanmış ZIP staging\'den sonra reddedilir; staging temizlenir, canlı dokunulmaz', async () => {
  const st = makeStack();
  const app = await boot(st);
  try {
    await insertSamples(app.s);
    const row = await app.s.db.withTransaction((tx) => savePhoto(tx, app.clock, app.photoEnv, {
      bytes: JPEG, extension: 'jpg', pose: 'front', localDateKey: '2026-09-14',
    }));
    const { zip } = await app.exporter.export();

    const archiver = new ZipArchiver();
    const entries = await archiver.read(zip);
    const photo = entries.find((e) => e.path === `${PHOTO_PREFIX}${row.file_name}`)!;
    photo.data[photo.data.byteLength - 1] = photo.data[photo.data.byteLength - 1]! ^ 0xff;
    const badZip = await archiver.write(entries);

    const before = await rawSnapshot(st);
    await assert.rejects(app.importer.import(badZip), (e: unknown) => {
      assert.ok(e instanceof BackupImportError);
      assert.equal(e.stage, 'photos');                       // staging DB yazıldıktan sonra
      return true;
    });
    assert.deepEqual(await rawSnapshot(st), before, 'staging görüntüsü ve photos.import/ temizlendi; canlı aynı');
    assert.equal(st.inner.names().includes('v90.import.sqlite'), false);
    assert.deepEqual(await st.blobs.list(PHOTOS), [row.file_name]);
    assert.deepEqual(await app.s.db.get('SELECT weight_kg FROM weight_logs WHERE id = ?', ['w1']), { weight_kg: 107 });
  } finally { await app.s.close(); }
});
