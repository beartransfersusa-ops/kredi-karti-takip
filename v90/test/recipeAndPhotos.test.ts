// Tarif oluşturucu ve fotoğraf deposu — docs/v90/06-ux-flows.md B.13, B.14.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeClock } from '../src/core/clock/dateKey.ts';
import { MigrationRunner } from '../src/core/db/MigrationRunner.ts';
import { NodeSqliteProvider } from '../src/core/db/NodeSqliteProvider.ts';
import { NodeFileStore } from '../src/core/db/NodeFileStore.ts';
import { NodeBlobStore } from '../src/core/backup/BlobStore.node.ts';
import { nodeSha256, nodeSha256Bytes } from '../src/core/db/hash.node.ts';
import type { Db } from '../src/core/db/types.ts';
import {
  addRecipeToMeal, draftNutrition, emptyDraft, loadFoods, loadRecipe, overrideFood,
  portion, saveRecipe, toPer100g,
} from '../src/features/nutrition/recipeQuery.ts';
import { loadDay } from '../src/features/nutrition/nutritionQuery.ts';
import {
  finishDeletion, groupByDate, listPhotos, markForDeletion, savePhoto, sweepOrphans,
} from '../src/features/photos/photoStore.ts';
import type { PhotoEnv } from '../src/features/photos/photoStore.ts';

const NOW = '2026-09-14T09:00:00.000Z';
const TODAY = '2026-09-14';

let n = 0;
const newId = () => `id-${String(++n).padStart(4, '0')}`;

async function freshDb(): Promise<Db> {
  const { db } = await new MigrationRunner({
    provider: new NodeSqliteProvider(':memory:'), files: new NodeFileStore(),
    clock: new FakeClock(NOW), hash: nodeSha256,
  }).run();
  return db;
}

async function addFood(db: Db, id: string, name: string, per100: {
  kcal: number; p: number; c: number; f: number;
}): Promise<void> {
  await db.exec(
    `INSERT INTO food_items
       (id, name, source, serving_unit, kcal_per_100g, protein_g_per_100g,
        carb_g_per_100g, fat_g_per_100g, last_updated, custom_edited)
     VALUES (?,?,'seed:usda','g',?,?,?,?,?,0)`,
    [id, name, per100.kcal, per100.p, per100.c, per100.f, NOW]);
}

// ───────────────────────────────────────────────────── B.13 tarif

test('R110.5 · cooked yield yoksa HAM TOPLAM tabanı kullanılır ve bildirilir', async () => {
  const db = await freshDb();
  try {
    await addFood(db, 'chicken', 'Tavuk göğsü', { kcal: 165, p: 31, c: 0, f: 3.6 });
    await addFood(db, 'rice', 'Pirinç (ham)', { kcal: 360, p: 7, c: 79, f: 0.6 });

    const draft = {
      ...emptyDraft(), name: 'Tavuklu Pilav',
      ingredients: [
        { foodId: 'chicken', foodName: 'Tavuk göğsü', grams: 500 },
        { foodId: 'rice', foodName: 'Pirinç (ham)', grams: 300 },
      ],
    };
    const foods = await db.withTransaction((tx) => loadFoods(tx, ['chicken', 'rice']));
    const map = new Map([...foods].map(([k, v]) => [k, toPer100g(v)]));

    const nutrition = draftNutrition(draft, map)!;
    assert.equal(nutrition.basis, 'rawTotal');
    assert.equal(nutrition.basisG, 800);
    assert.equal(nutrition.rawTotalG, 800);
    assert.ok(nutrition.warnings.includes('noCookedYield'), 'taban ham toplamsa AÇIKÇA bildirilmeli');
    // 500g tavuk = 825 kcal, 300g pirinç = 1080 kcal.
    assert.equal(nutrition.total.kcal, 1905);
  } finally { await db.close(); }
});

test('R110.3/R110.4 · cooked yield verilince porsiyon ona göre hesaplanır', async () => {
  const db = await freshDb();
  try {
    await addFood(db, 'chicken', 'Tavuk göğsü', { kcal: 165, p: 31, c: 0, f: 3.6 });
    await addFood(db, 'rice', 'Pirinç (ham)', { kcal: 360, p: 7, c: 79, f: 0.6 });

    const draft = {
      ...emptyDraft(), name: 'Tavuklu Pilav', cookedYieldG: 1050,
      ingredients: [
        { foodId: 'chicken', foodName: 'Tavuk göğsü', grams: 500 },
        { foodId: 'rice', foodName: 'Pirinç (ham)', grams: 300 },
      ],
    };
    const foods = await db.withTransaction((tx) => loadFoods(tx, ['chicken', 'rice']));
    const nutrition = draftNutrition(draft, new Map([...foods].map(([k, v]) => [k, toPer100g(v)])))!;

    assert.equal(nutrition.basis, 'cookedYield');
    assert.equal(nutrition.basisG, 1050);
    assert.ok(!nutrition.warnings.includes('noCookedYield'));

    // 350 g porsiyon = toplamın 1/3'ü.
    const p = portion(nutrition, 350);
    assert.equal(p.macros.kcal, Math.round(1905 / 3));
  } finally { await db.close(); }
});

test('olağandışı pişmiş ağırlık UYARIR ama engellemez', async () => {
  const db = await freshDb();
  try {
    await addFood(db, 'chicken', 'Tavuk', { kcal: 165, p: 31, c: 0, f: 3.6 });
    const base = { ...emptyDraft(), name: 'X', ingredients: [{ foodId: 'chicken', foodName: 'Tavuk', grams: 100 }] };
    const foods = await db.withTransaction((tx) => loadFoods(tx, ['chicken']));
    const map = new Map([...foods].map(([k, v]) => [k, toPer100g(v)]));

    // 100 g ham → 500 g pişmiş: olağandışı.
    const tooHigh = draftNutrition({ ...base, cookedYieldG: 500 }, map)!;
    assert.ok(tooHigh.warnings.includes('yieldImplausible'));
    assert.equal(tooHigh.basis, 'cookedYield', 'uyarı hesabı DURDURMAZ');

    const normal = draftNutrition({ ...base, cookedYieldG: 90 }, map)!;
    assert.ok(!normal.warnings.includes('yieldImplausible'));
  } finally { await db.close(); }
});

test('tarif kaydetme · düzenlemede malzemeler yeniden yazılır', async () => {
  const db = await freshDb();
  const clock = new FakeClock(NOW);
  try {
    await addFood(db, 'chicken', 'Tavuk', { kcal: 165, p: 31, c: 0, f: 3.6 });
    await addFood(db, 'rice', 'Pirinç', { kcal: 360, p: 7, c: 79, f: 0.6 });

    const id = await db.withTransaction((tx) => saveRecipe(tx, clock, newId, {
      ...emptyDraft(), name: 'Tavuklu Pilav', cookedYieldG: 1050,
      ingredients: [
        { foodId: 'chicken', foodName: 'Tavuk', grams: 500 },
        { foodId: 'rice', foodName: 'Pirinç', grams: 300 },
      ],
    }));

    const loaded = await db.withTransaction((tx) => loadRecipe(tx, id));
    assert.equal(loaded?.name, 'Tavuklu Pilav');
    assert.equal(loaded?.ingredients.length, 2);
    assert.equal(loaded?.cookedYieldG, 1050);

    // Düzenleme: bir malzeme çıkarıldı, gram değişti.
    await db.withTransaction((tx) => saveRecipe(tx, clock, newId, {
      ...loaded!, ingredients: [{ foodId: 'chicken', foodName: 'Tavuk', grams: 600 }],
    }));
    const after = await db.withTransaction((tx) => loadRecipe(tx, id));
    assert.equal(after?.ingredients.length, 1, 'eski satırlar silinip yeniden yazılmalı');
    assert.equal(after?.ingredients[0]?.grams, 600);

    const rows = await db.all('SELECT id FROM recipe_ingredients WHERE recipe_id = ?', [id]);
    assert.equal(rows.length, 1, 'yetim malzeme satırı kalmamalı');
  } finally { await db.close(); }
});

test('B.13 adım 7 · tarif öğüne ANLIK DEĞERLE eklenir; sonra değişse de kayıt sabit', async () => {
  const db = await freshDb();
  const clock = new FakeClock(NOW);
  try {
    await addFood(db, 'chicken', 'Tavuk', { kcal: 165, p: 31, c: 0, f: 3.6 });
    const id = await db.withTransaction((tx) => saveRecipe(tx, clock, newId, {
      ...emptyDraft(), name: 'Tavuk', cookedYieldG: 100,
      ingredients: [{ foodId: 'chicken', foodName: 'Tavuk', grams: 100 }],
    }));

    await db.withTransaction((tx) => addRecipeToMeal(tx, clock, newId, {
      recipeId: id, dateKey: TODAY, slot: 'lunch', portionG: 200,
    }));

    const before = await db.withTransaction((tx) => loadDay(tx, TODAY));
    assert.equal(before.meals.length, 1);
    assert.equal(before.totals.kcal, 330, '200 g = 2 × 165 kcal');

    // Tarif sonradan değişiyor: geçmiş öğün DEĞİŞMEMELİ.
    await db.withTransaction((tx) => saveRecipe(tx, clock, newId, {
      id, name: 'Tavuk', cookedYieldG: 100, note: null,
      ingredients: [{ foodId: 'chicken', foodName: 'Tavuk', grams: 300 }],
    }));
    const after = await db.withTransaction((tx) => loadDay(tx, TODAY));
    assert.equal(after.totals.kcal, 330, 'snapshot sayesinde geçmiş sabit kalır');
  } finally { await db.close(); }
});

test('R111.3 · etiket override custom_edited = 1 işaretler', async () => {
  const db = await freshDb();
  const clock = new FakeClock(NOW);
  try {
    await addFood(db, 'yogurt', 'Yoğurt', { kcal: 61, p: 3.5, c: 4.7, f: 3.3 });
    await db.withTransaction((tx) => overrideFood(tx, clock, {
      foodId: 'yogurt', brand: 'Marka', servingUnit: 'g', servingSizeG: 200,
      kcal: 55, protein: 4.2, carb: 4.0, fat: 2.5, fiber: null,
    }));

    const row = await db.get<{ source: string; custom_edited: number; kcal_per_100g: number; brand: string }>(
      'SELECT source, custom_edited, kcal_per_100g, brand FROM food_items WHERE id = ?', ['yogurt']);
    assert.equal(row?.source, 'label-override');
    assert.equal(row?.custom_edited, 1, 'seed güncellemesi bu satırı atlamalı');
    assert.equal(row?.kcal_per_100g, 55);
    assert.equal(row?.brand, 'Marka');
  } finally { await db.close(); }
});

// ───────────────────────────────────────────────────── B.14 fotoğraflar

function photoEnv(dir: string): PhotoEnv {
  return { blobs: new NodeBlobStore(), photosDir: dir, hashBytes: nodeSha256Bytes, newId };
}

const jpeg = (marker: number) => new Uint8Array([0xff, 0xd8, 0xff, marker, 1, 2, 3, 4]);

test('R116.1 · fotoğraf uygulamaya özel dizine yazılır, satır sonra eklenir', async () => {
  const db = await freshDb();
  const dir = mkdtempSync(join(tmpdir(), 'v90-photos-'));
  const env = photoEnv(dir);
  try {
    const row = await db.withTransaction((tx) => savePhoto(tx, new FakeClock(NOW), env, {
      bytes: jpeg(0xe0), extension: 'jpg', pose: 'front', localDateKey: TODAY,
    }));

    assert.equal(row.pose, 'front');
    assert.equal(row.bytes, 8);
    assert.equal(row.sha256, await nodeSha256Bytes(jpeg(0xe0)));
    assert.ok(await env.blobs.exists(`${dir}/${row.file_name}`), 'dosya diskte olmalı');

    const photos = await db.withTransaction(listPhotos);
    assert.equal(photos.length, 1);
    assert.equal(photos[0]?.id, row.id);
  } finally { await db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('R116.4 · silme dosyayı DA temizler', async () => {
  const db = await freshDb();
  const dir = mkdtempSync(join(tmpdir(), 'v90-photos-'));
  const env = photoEnv(dir);
  try {
    const row = await db.withTransaction((tx) => savePhoto(tx, new FakeClock(NOW), env, {
      bytes: jpeg(0xe1), extension: 'jpg', pose: 'back', localDateKey: TODAY,
    }));

    await db.withTransaction((tx) => markForDeletion(tx, row.id));
    // İşaretlenen fotoğraf grid'den HEMEN kaybolur.
    assert.equal((await db.withTransaction(listPhotos)).length, 0);

    await db.withTransaction((tx) => finishDeletion(tx, env, row));
    assert.equal(await env.blobs.exists(`${dir}/${row.file_name}`), false, 'dosya silinmiş olmalı');
    assert.equal((await db.all('SELECT id FROM progress_photos')).length, 0);
  } finally { await db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('OrphanSweeper · yarıda kalan silmeyi TAMAMLAR', async () => {
  const db = await freshDb();
  const dir = mkdtempSync(join(tmpdir(), 'v90-photos-'));
  const env = photoEnv(dir);
  try {
    const row = await db.withTransaction((tx) => savePhoto(tx, new FakeClock(NOW), env, {
      bytes: jpeg(0xe2), extension: 'jpg', pose: 'front', localDateKey: TODAY,
    }));
    // (a) yapıldı, (b)/(c) yapılmadan uygulama kapandı.
    await db.withTransaction((tx) => markForDeletion(tx, row.id));

    const result = await db.withTransaction((tx) => sweepOrphans(tx, env));
    assert.equal(result.completedDeletions, 1);
    assert.equal(await env.blobs.exists(`${dir}/${row.file_name}`), false);
    assert.equal((await db.all('SELECT id FROM progress_photos')).length, 0);
  } finally { await db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('OrphanSweeper · sahipsiz dosyayı siler, dosyasız satırı SİLMEZ', async () => {
  const db = await freshDb();
  const dir = mkdtempSync(join(tmpdir(), 'v90-photos-'));
  const env = photoEnv(dir);
  try {
    const kept = await db.withTransaction((tx) => savePhoto(tx, new FakeClock(NOW), env, {
      bytes: jpeg(0xe3), extension: 'jpg', pose: 'front', localDateKey: TODAY,
    }));
    const orphanRow = await db.withTransaction((tx) => savePhoto(tx, new FakeClock(NOW), env, {
      bytes: jpeg(0xe4), extension: 'jpg', pose: 'back', localDateKey: TODAY,
    }));

    // Sahipsiz DOSYA (DB'de karşılığı yok).
    await env.blobs.write(`${dir}/sahipsiz.jpg`, jpeg(0xe5));
    // Dosyası kaybolmuş SATIR.
    await env.blobs.remove(`${dir}/${orphanRow.file_name}`);

    const result = await db.withTransaction((tx) => sweepOrphans(tx, env));
    assert.equal(result.removedOrphanFiles, 1, 'sahipsiz dosya silinmeli');
    assert.deepEqual(result.missingFiles, [orphanRow.id], 'dosyasız satır RAPORLANMALI');

    // Kullanıcı verisi sessizce silinmez: satır DURUYOR.
    const rows = await db.all<{ id: string }>('SELECT id FROM progress_photos ORDER BY id');
    assert.equal(rows.length, 2);
    assert.ok(rows.some((r) => r.id === orphanRow.id));
    assert.ok(await env.blobs.exists(`${dir}/${kept.file_name}`));
  } finally { await db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('grid gruplaması · günler yeniden eskiye', () => {
  const mk = (id: string, dateKey: string) => ({
    id, taken_at_utc: NOW, local_date_key: dateKey, time_zone: 'Europe/Istanbul',
    pose: 'front' as const, file_name: `${id}.jpg`, bytes: 1, sha256: 'x',
    width: null, height: null, pending_delete: 0, note: null,
  });
  const groups = groupByDate([mk('a', '2026-09-10'), mk('b', '2026-09-14'), mk('c', '2026-09-10')]);
  assert.deepEqual(groups.map((g) => g.dateKey), ['2026-09-14', '2026-09-10']);
  assert.equal(groups[1]?.photos.length, 2);
});

test('R116.3 · fotoğraf katmanında cloud sync izi YOK', async () => {
  // Gereksinim "hiçbir metin, anahtar ya da 'yakında' ifadesi yoktur" diyor.
  // Bunu yorum olarak bırakmak yerine kaynağı taratıyoruz: ileride biri
  // "buluta yedekle" eklemeye kalkarsa test kırılır.
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');

  // Yorumlar ayıklanır: "cloud sync YOKTUR" açıklaması bir ihlal değil,
  // tam tersinin belgesidir. Denetlenen şey ÇALIŞAN kod ve kullanıcı metni.
  const stripComments = (src: string) => src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

  const sources = [
    'app/photos/index.tsx',
    'src/features/photos/photoStore.ts',
  ].map((p) => stripComments(readFileSync(join(root, p), 'utf8')));

  const photoKeys = Object.entries(
    (await import('../src/ui/i18n/index.ts')).tr,
  ).filter(([k]) => k.startsWith('photos.')).map(([, v]) => v);

  /*
   * Yalnızca TEK ANLAMLI işaretler aranıyor. Türkçe olumsuzluk eki fiil
   * gövdesine bitişik olduğu için ("buluta gönderilMEZ") fiil kalıbı aramak
   * doğruyu yanlışla karıştırır: gizliliği anlatan cümle, ihlal sayılırdı.
   * Bu yüzden marka adları, İngilizce terim ve "yakında" vaadi aranıyor.
   */
  const forbidden = [/icloud/i, /google drive/i, /cloud ?sync/i, /dropbox/i, /yakında/i];
  for (const text of [...sources, ...photoKeys]) {
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(text), `cloud sync izi bulundu: ${pattern} → ${text.slice(0, 80)}`);
    }
  }

  // Anahtar düzeyinde de yok: `photos.cloudSync` gibi bir ayar olamaz.
  // (Denetim `photos.*` ile sınırlı: `settings.privacy.noCloud` adında "Cloud"
  // geçer ama anlamı "bulut YOK"tur; onu ihlal saymak yanlış olurdu.)
  const allKeys = Object.keys((await import('../src/ui/i18n/index.ts')).tr);
  assert.deepEqual(allKeys.filter((k) => k.startsWith('photos.') && /cloud|sync/i.test(k)), []);

  // Buna karşılık "buluta gönderilmez" ifadesi BULUNMALI: kullanıcıya ne
  // yapılmadığı açıkça söyleniyor (denetim boş koşmasın).
  assert.ok(photoKeys.some((v) => v.includes('buluta gönderilmez')));
});
