// Seed kurulumu — docs/v90/03-data-model.md §1, src/core/db/seed.ts.
//
// En kritik garanti: seed tazelemesi KULLANICI VERİSİNİ bozmaz. Kullanıcının
// kendi eklediği hareket ve kendi düzenlediği şablon satırı korunur; seed'den
// düşen hareket SİLİNMEZ (geçmiş set'ler ona referans verir).
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
import { installSeed } from '../src/core/db/seed.ts';
import type { SeedBundle, SeedExercise } from '../src/core/db/seed.ts';
import { readCatalog } from '../src/core/db/catalog.ts';
import type { Db } from '../src/core/db/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const NOW = '2026-09-13T09:00:00.000Z';

/** Gerçek, belgeden üretilmiş seed — testin kurgusal veriyle kaçmaması için. */
function realBundle(): SeedBundle {
  const ex = readJson('data/exercises.json');
  return {
    seedVersion: ex.seedVersion,
    exercises: ex.exercises,
    relations: ex.relations,
    program: readJson('data/programs/v90.json'),
    targets: readJson('data/muscle-volume-targets.json').targets,
    foods: readJson('data/food-items.json').foods,
  };
}

async function freshDb(): Promise<Db> {
  const { db } = await new MigrationRunner({
    provider: new NodeSqliteProvider(':memory:'), files: new NodeFileStore(),
    clock: new FakeClock(NOW), hash: nodeSha256,
  }).run();
  return db;
}

const count = async (db: Db, table: string): Promise<number> =>
  (await db.get<{ n: number }>(`SELECT COUNT(*) n FROM ${table}`))!.n;

test('ilk kurulum · katalog, ilişkiler, şablon ve hedefler yazılır', async () => {
  const db = await freshDb();
  const bundle = realBundle();
  try {
    const r = await db.withTransaction((tx) => installSeed(tx, bundle, NOW));
    assert.equal(r.skipped, false);
    assert.equal(r.insertedExercises, 32);
    assert.equal(r.updatedExercises, 0);
    assert.equal(r.relations, 14);
    assert.equal(r.workoutTemplates, 5);

    assert.equal(await count(db, 'exercises'), 32);
    assert.equal(await count(db, 'exercise_relations'), 14);
    assert.equal(await count(db, 'workout_templates'), 5);
    assert.equal(await count(db, 'template_exercises'), 30);
    assert.equal(await count(db, 'muscle_volume_targets'), 16);

    // Şema kısıtları temiz kalmalı.
    const fk = await db.all('PRAGMA foreign_key_check');
    assert.equal(fk.length, 0);
  } finally { await db.close(); }
});

test('ikinci çalıştırma no-op · aynı sürüm yeniden yazılmaz', async () => {
  const db = await freshDb();
  const bundle = realBundle();
  try {
    await db.withTransaction((tx) => installSeed(tx, bundle, NOW));
    const second = await db.withTransaction((tx) => installSeed(tx, bundle, NOW));
    assert.equal(second.skipped, true);
    assert.equal(second.insertedExercises, 0);
    assert.equal(await count(db, 'exercises'), 32);
  } finally { await db.close(); }
});

test('yeni sürüm · metin düzeltmesi UPDATE edilir, yeni hareket eklenir', async () => {
  const db = await freshDb();
  const v1 = realBundle();
  try {
    await db.withTransaction((tx) => installSeed(tx, v1, NOW));

    const first = v1.exercises[0]!;
    const renamed: SeedExercise = { ...first, nameTr: 'Düzeltilmiş Ad' };
    const added: SeedExercise = { ...first, id: 'yeni-hareket', name: 'New', nameTr: 'Yeni' };
    const v2: SeedBundle = {
      ...v1, seedVersion: v1.seedVersion + 1,
      exercises: [renamed, ...v1.exercises.slice(1), added],
    };

    const r = await db.withTransaction((tx) => installSeed(tx, v2, NOW));
    assert.equal(r.skipped, false);
    assert.equal(r.insertedExercises, 1);
    assert.equal(r.updatedExercises, 32);

    const catalog = await db.withTransaction(readCatalog);
    assert.equal(catalog.get(first.id)?.nameTr, 'Düzeltilmiş Ad');
    assert.equal(catalog.get('yeni-hareket')?.nameTr, 'Yeni');
  } finally { await db.close(); }
});

test('kullanıcının kendi hareketi (is_custom=1) seed tazelemesinde KORUNUR', async () => {
  const db = await freshDb();
  const v1 = realBundle();
  try {
    await db.withTransaction((tx) => installSeed(tx, v1, NOW));
    await db.exec(
      `INSERT INTO exercises
         (id, name, name_tr, primary_muscle, secondary_muscles_json, movement_pattern, equipment_json,
          lengthened_bias, skill_level, joint_stress_json, load_progression_type, is_unilateral,
          volume_multiplier, default_increment_kg, cues_json, is_custom, seed_version, is_deleted,
          created_at_utc, updated_at_utc)
       VALUES ('benim','Mine','Benim Hareketim','chest','[]','horizontalPush','[]',1,'intermediate',
               '{}','externalLoadHigherIsHarder',0,1,2.5,'["a","b","c"]',1,1,0,?,?)`, [NOW, NOW]);

    const v2: SeedBundle = { ...v1, seedVersion: v1.seedVersion + 1 };
    const r = await db.withTransaction((tx) => installSeed(tx, v2, NOW));

    assert.equal(r.softDeletedExercises, 0, 'özel hareket seed dışı diye silinmemeli');
    const mine = await db.get<{ name_tr: string; is_deleted: number }>(
      'SELECT name_tr, is_deleted FROM exercises WHERE id = ?', ['benim']);
    assert.equal(mine?.name_tr, 'Benim Hareketim');
    assert.equal(mine?.is_deleted, 0);
  } finally { await db.close(); }
});

test('seed\'den düşen hareket SİLİNMEZ, is_deleted=1 olur (geçmiş referansları)', async () => {
  const db = await freshDb();
  const v1 = realBundle();
  try {
    await db.withTransaction((tx) => installSeed(tx, v1, NOW));
    const dropped = v1.exercises[v1.exercises.length - 1]!;

    const v2: SeedBundle = {
      ...v1, seedVersion: v1.seedVersion + 1,
      exercises: v1.exercises.slice(0, -1),
      // İlişkiler de düşen harekete referans vermemeli.
      relations: v1.relations.filter((r) =>
        r.exerciseId !== dropped.id && r.relatedExerciseId !== dropped.id),
      program: {
        ...v1.program,
        workoutTemplates: v1.program.workoutTemplates.map((t) => ({
          ...t, exercises: t.exercises.filter((e) => e.exerciseId !== dropped.id),
        })),
      },
    };

    const r = await db.withTransaction((tx) => installSeed(tx, v2, NOW));
    assert.equal(r.softDeletedExercises, 1);

    const row = await db.get<{ is_deleted: number }>(
      'SELECT is_deleted FROM exercises WHERE id = ?', [dropped.id]);
    assert.equal(row?.is_deleted, 1, 'satır DURUYOR, yalnızca işaretlendi');
    assert.equal(await count(db, 'exercises'), 32, 'satır sayısı değişmez');
  } finally { await db.close(); }
});

test('kullanıcının düzenlediği şablon satırı (is_customized=1) ezilmez', async () => {
  const db = await freshDb();
  const v1 = realBundle();
  try {
    await db.withTransaction((tx) => installSeed(tx, v1, NOW));
    const first = v1.program.workoutTemplates[0]!;
    const rowId = `${first.id}-0`;
    await db.exec(
      'UPDATE template_exercises SET working_sets = 9, is_customized = 1 WHERE id = ?', [rowId]);

    const v2: SeedBundle = { ...v1, seedVersion: v1.seedVersion + 1 };
    await db.withTransaction((tx) => installSeed(tx, v2, NOW));

    const row = await db.get<{ working_sets: number }>(
      'SELECT working_sets FROM template_exercises WHERE id = ?', [rowId]);
    assert.equal(row?.working_sets, 9, 'kullanıcı düzenlemesi korunmalı');

    // Düzenlenmemiş satır ise belgeye göre güncellenir.
    const untouched = await db.get<{ working_sets: number }>(
      'SELECT working_sets FROM template_exercises WHERE id = ?', [`${first.id}-1`]);
    assert.equal(untouched?.working_sets, first.exercises[1]!.workingSets);
  } finally { await db.close(); }
});

test('katalog okuması JSON kolonlarını doğru çözer', async () => {
  const db = await freshDb();
  const bundle = realBundle();
  try {
    await db.withTransaction((tx) => installSeed(tx, bundle, NOW));
    const catalog = await db.withTransaction(readCatalog);
    const source = bundle.exercises[0]!;
    const parsed = catalog.get(source.id)!;

    assert.deepEqual(parsed.equipment, source.equipment);
    assert.deepEqual(parsed.secondaryMuscles, source.secondaryMuscles);
    assert.deepEqual(parsed.jointStressProfile, source.jointStressProfile);
    assert.deepEqual(parsed.cues, source.cues);
    assert.equal(parsed.isUnilateral, source.isUnilateral);
    assert.equal(parsed.defaultIncrementKg, source.defaultIncrementKg);
  } finally { await db.close(); }
});

// ───────────────────────────────────────────────── §46 · besin seed'i (R111.3)

test('besin seed\'i · ilk kurulumda tüm besinler, hepsi seed kaynaklı', async () => {
  const db = await freshDb();
  const bundle = realBundle();
  try {
    const r = await db.withTransaction((tx) => installSeed(tx, bundle, NOW));
    assert.equal(r.insertedFoods, bundle.foods.length);
    assert.equal(r.preservedFoods, 0);
    assert.equal(await count(db, 'food_items'), bundle.foods.length);

    const simit = await db.get<{ source: string; serving_unit: string; serving_size_g: number; kcal_per_100g: number; custom_edited: number }>(
      'SELECT source, serving_unit, serving_size_g, kcal_per_100g, custom_edited FROM food_items WHERE id = ?', ['simit']);
    assert.equal(simit?.source, 'seed:tr-label');
    assert.equal(simit?.serving_unit, 'piece');
    assert.equal(simit?.serving_size_g, 90);
    assert.equal(simit?.kcal_per_100g, 320, 'değer 100 g başına (R46.4)');
    assert.equal(simit?.custom_edited, 0);
  } finally { await db.close(); }
});

test('R111.3 · etiketten düzenlenen besin seed tazelemesinde KORUNUR', async () => {
  const db = await freshDb();
  const v1 = realBundle();
  try {
    await db.withTransaction((tx) => installSeed(tx, v1, NOW));

    // Kullanıcı yoğurdun değerini etiketten düzeltti (B.13 adım 8–9).
    await db.exec(
      `UPDATE food_items SET kcal_per_100g = 55, source = 'label-override', custom_edited = 1
       WHERE id = 'yogurt-tam-yagli'`);

    // Yeni seed sürümü aynı besini farklı bir değerle getiriyor.
    const v2: SeedBundle = {
      ...v1, seedVersion: v1.seedVersion + 1,
      foods: v1.foods.map((f) => (f.id === 'yogurt-tam-yagli'
        ? { ...f, per100g: { ...f.per100g, kcal: 99 } } : f)),
    };
    const r = await db.withTransaction((tx) => installSeed(tx, v2, NOW));
    assert.equal(r.preservedFoods, 1, 'override edilen satır sayılmalı');
    assert.equal(r.updatedFoods, v1.foods.length - 1, 'dokunulmamış olanlar tazelenir');

    const row = await db.get<{ kcal_per_100g: number; source: string; custom_edited: number }>(
      'SELECT kcal_per_100g, source, custom_edited FROM food_items WHERE id = ?', ['yogurt-tam-yagli']);
    assert.equal(row?.kcal_per_100g, 55, 'kullanıcının değeri kalmalı, 99 DEĞİL');
    assert.equal(row?.source, 'label-override');
    assert.equal(row?.custom_edited, 1);
  } finally { await db.close(); }
});

test('kullanıcının kendi eklediği besin seed tazelemesinde silinmez', async () => {
  const db = await freshDb();
  const v1 = realBundle();
  try {
    await db.withTransaction((tx) => installSeed(tx, v1, NOW));
    await db.exec(
      `INSERT INTO food_items (id, name, source, serving_unit, kcal_per_100g, protein_g_per_100g,
         carb_g_per_100g, fat_g_per_100g, last_updated, custom_edited)
       VALUES ('benim-besinim', 'Benim Besinim', 'user', 'g', 100, 10, 10, 2, ?, 1)`, [NOW]);

    const r = await db.withTransaction((tx) => installSeed(tx, { ...v1, seedVersion: v1.seedVersion + 1 }, NOW));
    assert.equal(r.softDeletedFoods, 0, 'kullanıcı besini seed dışı diye silinmemeli');
    const mine = await db.get<{ is_deleted: number }>('SELECT is_deleted FROM food_items WHERE id = ?', ['benim-besinim']);
    assert.equal(mine?.is_deleted, 0);
  } finally { await db.close(); }
});

test('seed\'den düşen besin SİLİNMEZ, is_deleted=1 olur (meal_entries referansı)', async () => {
  const db = await freshDb();
  const v1 = realBundle();
  try {
    await db.withTransaction((tx) => installSeed(tx, v1, NOW));
    const dropped = v1.foods[0]!;
    const v2: SeedBundle = { ...v1, seedVersion: v1.seedVersion + 1, foods: v1.foods.slice(1) };
    const r = await db.withTransaction((tx) => installSeed(tx, v2, NOW));
    assert.equal(r.softDeletedFoods, 1);
    const row = await db.get<{ is_deleted: number }>('SELECT is_deleted FROM food_items WHERE id = ?', [dropped.id]);
    assert.equal(row?.is_deleted, 1);
    assert.equal(await count(db, 'food_items'), v1.foods.length, 'satır sayısı değişmez');
  } finally { await db.close(); }
});
