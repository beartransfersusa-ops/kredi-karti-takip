// Kopyalama eylemleri — docs/v90/06-ux-flows.md B.12 (R109), video manifest'i B.15 (R114).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeClock } from '../src/core/clock/dateKey.ts';
import { MigrationRunner } from '../src/core/db/MigrationRunner.ts';
import { NodeSqliteProvider } from '../src/core/db/NodeSqliteProvider.ts';
import { NodeFileStore } from '../src/core/db/NodeFileStore.ts';
import { nodeSha256 } from '../src/core/db/hash.node.ts';
import type { Db } from '../src/core/db/types.ts';
import { copyDay, loadDay } from '../src/features/nutrition/nutritionQuery.ts';
import {
  copyMeal, insertSavedMeal, listSavedMeals, recentFoodIds, repeatSlot, saveAsMeal, toggleFavorite,
} from '../src/features/nutrition/copyService.ts';
import { findVideo, initialState, sourceLink, validateManifest } from '../src/features/video/videoManifest.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = '2026-09-14T09:00:00.000Z';
const clock = new FakeClock(NOW);
let n = 0;
const newId = () => `id-${String(++n).padStart(4, '0')}`;

async function db(): Promise<Db> {
  const r = await new MigrationRunner({
    provider: new NodeSqliteProvider(':memory:'), files: new NodeFileStore(), clock, hash: nodeSha256,
  }).run();
  await r.db.exec(
    `INSERT INTO food_items (id, name, source, serving_unit, kcal_per_100g, protein_g_per_100g,
       carb_g_per_100g, fat_g_per_100g, last_updated, custom_edited)
     VALUES ('tavuk', 'Tavuk', 'seed:usda', 'g', 120, 22.5, 0, 2.6, ?, 0)`, [NOW]);
  return r.db;
}

async function logMeal(d: Db, dateKey: string, slot: string, grams: number): Promise<string> {
  const id = newId();
  await d.exec(`INSERT INTO meal_logs (id, local_date_key, time_zone, logged_at_utc, meal_slot)
                VALUES (?,?,'Europe/Istanbul',?,?)`, [id, dateKey, NOW, slot]);
  // Snapshot, o günkü değerle (120 kcal/100 g) yazıldı.
  await d.exec(`INSERT INTO meal_entries (id, meal_log_id, food_id, grams, kcal_snapshot, protein_g_snapshot,
                  carb_g_snapshot, fat_g_snapshot, order_index)
                VALUES (?,?,'tavuk',?,?,?,0,?,0)`,
    [newId(), id, grams, 120 * grams / 100, 22.5 * grams / 100, 2.6 * grams / 100]);
  return id;
}

test('B.12 · kopya snapshot\'ı GÜNCEL besin değerinden hesaplanır, kaynak kayıt değişmez', async () => {
  const d = await db();
  try {
    const src = await logMeal(d, '2026-09-13', 'lunch', 200);   // 240 kcal ile loglandı
    // Kullanıcı bu arada tavuğu etiketten düzeltti: 150 kcal/100 g.
    await d.exec(`UPDATE food_items SET kcal_per_100g = 150, custom_edited = 1 WHERE id = 'tavuk'`);

    await d.withTransaction((tx) => copyMeal(tx, clock, newId, { mealLogId: src, toDateKey: '2026-09-14', slot: 'lunch' }));

    const yesterday = await d.withTransaction((tx) => loadDay(tx, '2026-09-13'));
    const today = await d.withTransaction((tx) => loadDay(tx, '2026-09-14'));
    assert.equal(yesterday.totals.kcal, 240, 'geçmiş kayıt DEĞİŞMEZ');
    assert.equal(today.totals.kcal, 300, 'kopya güncel değeri taşır (200 g × 150)');
    assert.equal(today.meals[0]?.slot, 'lunch');
  } finally { await d.close(); }
});

test('Copy Yesterday · ekler, üzerine yazmaz; copied_from_id kaynağı gösterir', async () => {
  const d = await db();
  try {
    await logMeal(d, '2026-09-13', 'breakfast', 100);
    await logMeal(d, '2026-09-13', 'lunch', 200);
    await logMeal(d, '2026-09-14', 'breakfast', 50);            // bugün zaten dolu
    const copied = await d.withTransaction((tx) => copyDay(tx, '2026-09-13', '2026-09-14', NOW, 'Europe/Istanbul', newId));
    assert.equal(copied, 2);
    const today = await d.withTransaction((tx) => loadDay(tx, '2026-09-14'));
    assert.equal(today.meals.length, 3, 'mevcut kahvaltı silinmedi, 2 öğün eklendi');
    const links = await d.all<{ copied_from_id: string | null }>(
      `SELECT copied_from_id FROM meal_logs WHERE local_date_key = '2026-09-14'`);
    assert.equal(links.filter((l) => l.copied_from_id !== null).length, 2);
  } finally { await d.close(); }
});

test('Repeat slot · son 7 günün EN YENİ kaydı; yoksa null', async () => {
  const d = await db();
  try {
    assert.equal(await d.withTransaction((tx) => repeatSlot(tx, clock, newId, { slot: 'breakfast', toDateKey: '2026-09-14' })), null);
    await logMeal(d, '2026-09-08', 'breakfast', 100);
    await logMeal(d, '2026-09-12', 'breakfast', 300);           // en yeni
    await logMeal(d, '2026-09-01', 'breakfast', 999);           // 7 gün dışı
    const id = await d.withTransaction((tx) => repeatSlot(tx, clock, newId, { slot: 'breakfast', toDateKey: '2026-09-14' }));
    assert.ok(id);
    const today = await d.withTransaction((tx) => loadDay(tx, '2026-09-14'));
    assert.equal(today.meals[0]?.entries[0]?.grams, 300, '12 Eylül kaydı (en yeni) tekrarlanır');
  } finally { await d.close(); }
});

test('Saved Meal · kaydet → listele → ekle; snapshot ekleme anında hesaplanır', async () => {
  const d = await db();
  try {
    const src = await logMeal(d, '2026-09-13', 'dinner', 250);
    const savedId = await d.withTransaction((tx) => saveAsMeal(tx, clock, newId, { mealLogId: src, name: '  Akşam standardı ' }));
    const list = await d.withTransaction(listSavedMeals);
    assert.deepEqual(list, [{ id: savedId, name: 'Akşam standardı', itemCount: 1 }]);

    await d.exec(`UPDATE food_items SET kcal_per_100g = 100 WHERE id = 'tavuk'`);
    await d.withTransaction((tx) => insertSavedMeal(tx, clock, newId, { savedMealId: savedId, toDateKey: '2026-09-14', slot: 'dinner' }));
    const today = await d.withTransaction((tx) => loadDay(tx, '2026-09-14'));
    assert.equal(today.totals.kcal, 250, 'kayıtlı öğün snapshot taşımaz; 250 g × güncel 100 kcal');

    await assert.rejects(
      () => d.withTransaction((tx) => saveAsMeal(tx, clock, newId, { mealLogId: 'yok', name: 'x' })),
      /boş öğün/);
  } finally { await d.close(); }
});

test('Favoriler ve Son besinler', async () => {
  const d = await db();
  try {
    assert.equal(await d.withTransaction((tx) => toggleFavorite(tx, clock, 'tavuk')), true);
    assert.equal(await d.withTransaction((tx) => toggleFavorite(tx, clock, 'tavuk')), false);
    assert.deepEqual(await d.withTransaction((tx) => recentFoodIds(tx, '2026-09-14')), []);
    await logMeal(d, '2026-09-13', 'lunch', 100);
    await logMeal(d, '2026-07-01', 'lunch', 100);                // 30 gün dışı
    assert.deepEqual(await d.withTransaction((tx) => recentFoodIds(tx, '2026-09-14')), ['tavuk']);
  } finally { await d.close(); }
});

// ─────────────────────────────────────────────── B.15 · video manifest'i (R114)

test('R114 · dağıtılan manifest geçerli ve boş; boşluk bilinçli', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'data/exercise-videos.json'), 'utf8'));
  const known = new Set(['incline-smith-press']);
  const v = validateManifest(manifest, known);
  assert.deepEqual(v, { ok: true, count: 0 });
  assert.equal(findVideo(manifest, 'incline-smith-press'), null);
  assert.deepEqual(initialState(manifest, 'incline-smith-press', true), { kind: 'none' },
    'kayıt yoksa player hiç denenmez; yalnızca ipuçları (R114.3/4)');
});

test('R114.1/R114.5 · uydurma ya da yeniden host edilmiş giriş REDDEDİLİR', () => {
  const known = new Set(['x']);
  const bad = validateManifest({ formatVersion: 1, videos: [{
    exerciseId: 'x', videoProvider: 'youtube', videoId: 'kisa', channelName: '',
    sourceUrl: 'https://cdn.benim-sunucum.com/video.mp4', lastVerifiedAt: 'dün',
  }] }, known);
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.errors.some((e) => e.includes('videoId')));
    assert.ok(bad.errors.some((e) => e.includes('R114.5')), 'YouTube dışı host reddedilir');
    assert.ok(bad.errors.some((e) => e.includes('lastVerifiedAt')));
  }
  assert.equal(validateManifest({ formatVersion: 1, videos: [{
    exerciseId: 'yok', videoProvider: 'youtube', videoId: 'dQw4w9WgXcQ', channelName: 'K',
    sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', lastVerifiedAt: '2026-09-01',
  }] }, known).ok, false, 'katalogda olmayan hareket');

  const good = { exerciseId: 'x', videoProvider: 'youtube' as const, videoId: 'dQw4w9WgXcQ', channelName: 'K',
    sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', lastVerifiedAt: '2026-09-01', fallbackUrl: 'https://example.org/k' };
  assert.equal(validateManifest({ formatVersion: 1, videos: [good] }, known).ok, true);
  assert.equal(sourceLink(good), 'https://example.org/k', 'fallbackUrl öncelikli');
  assert.deepEqual(initialState({ formatVersion: 1, videos: [good] }, 'x', false), { kind: 'offline', entry: good });
});
