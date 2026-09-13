// Kopyalama eylemleri — docs/v90/06-ux-flows.md B.12 (R109.1, R109.2).
//
// Her eylem TEK transaction: kısmi öğün oluşmaz. Snapshot'lar GÜNCEL
// food_items / recipes değerinden yeniden hesaplanır (B.12 tablosu, "kopyalama
// snapshot kaynağı" açık noktasının kararı) — kaynak öğünün eski snapshot'ı
// kopyalanmaz; kullanıcı besini o arada düzelttiyse yeni kopya düzeltilmiş
// değeri taşır. Geçmiş kayıtların kendisi ise değişmez.
import type { Clock } from '../../core/clock/dateKey.ts';
import type { Tx } from '../../core/db/types.ts';
import type { DateKey } from '../../domain/types.ts';
import { compute, portion } from '../../domain/nutrition/RecipeBuilder.ts';
import type { Per100g } from '../../domain/nutrition/RecipeBuilder.ts';
import type { MealSlot } from './nutritionQuery.ts';
import { addDaysKey } from '../format.ts';

interface Snapshot { kcal: number; protein: number; carb: number; fat: number; fiber: number | null }

/**
 * Bir besin ya da tarifin `grams` için GÜNCEL anlık değeri.
 * Tarif: per100g (cooked yield tabanlı) × grams/100 — B.13 adım 7 ile aynı yol.
 */
export async function currentSnapshot(
  tx: Tx, ref: { foodId: string | null; recipeId: string | null }, grams: number,
): Promise<Snapshot> {
  if (ref.foodId) {
    const f = await tx.get<{ kcal_per_100g: number; protein_g_per_100g: number; carb_g_per_100g: number; fat_g_per_100g: number; fiber_g_per_100g: number | null }>(
      'SELECT kcal_per_100g, protein_g_per_100g, carb_g_per_100g, fat_g_per_100g, fiber_g_per_100g FROM food_items WHERE id = ?',
      [ref.foodId]);
    if (!f) throw new Error(`besin bulunamadı: ${ref.foodId}`);
    const k = grams / 100;
    return {
      kcal: f.kcal_per_100g * k, protein: f.protein_g_per_100g * k, carb: f.carb_g_per_100g * k,
      fat: f.fat_g_per_100g * k, fiber: f.fiber_g_per_100g === null ? null : f.fiber_g_per_100g * k,
    };
  }
  if (ref.recipeId) {
    const r = await tx.get<{ cooked_yield_g: number | null }>('SELECT cooked_yield_g FROM recipes WHERE id = ?', [ref.recipeId]);
    if (!r) throw new Error(`tarif bulunamadı: ${ref.recipeId}`);
    const ings = await tx.all<{ food_id: string; grams: number; kcal_per_100g: number; protein_g_per_100g: number; carb_g_per_100g: number; fat_g_per_100g: number; fiber_g_per_100g: number | null }>(
      `SELECT ri.food_id, ri.grams, f.kcal_per_100g, f.protein_g_per_100g, f.carb_g_per_100g, f.fat_g_per_100g, f.fiber_g_per_100g
       FROM recipe_ingredients ri JOIN food_items f ON f.id = ri.food_id WHERE ri.recipe_id = ? ORDER BY ri.order_index`,
      [ref.recipeId]);
    const foods = new Map<string, Per100g>(ings.map((x) => [x.food_id, {
      kcal: x.kcal_per_100g, protein: x.protein_g_per_100g, carb: x.carb_g_per_100g, fat: x.fat_g_per_100g, fiber: x.fiber_g_per_100g,
    }]));
    const n = compute({
      id: ref.recipeId, name: '', cookedYieldG: r.cooked_yield_g,
      ingredients: ings.map((x) => ({ foodId: x.food_id, grams: x.grams })),
    }, foods);
    const p = portion(n, grams).macros;
    return { kcal: p.kcal, protein: p.proteinG, carb: p.carbG, fat: p.fatG, fiber: p.fiberG };
  }
  throw new Error('girdi ne besin ne tarif');
}

async function insertEntry(
  tx: Tx, newId: () => string, mealLogId: string,
  ref: { foodId: string | null; recipeId: string | null }, grams: number, orderIndex: number,
): Promise<void> {
  const s = await currentSnapshot(tx, ref, grams);
  await tx.exec(
    `INSERT INTO meal_entries
       (id, meal_log_id, food_id, recipe_id, grams, kcal_snapshot, protein_g_snapshot,
        carb_g_snapshot, fat_g_snapshot, fiber_g_snapshot, order_index)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [newId(), mealLogId, ref.foodId, ref.recipeId, grams, s.kcal, s.protein, s.carb, s.fat, s.fiber, orderIndex]);
}

/** Tek bir öğünü (meal_logs satırı + girdileri) başka gün/slot'a kopyalar. */
export async function copyMeal(
  tx: Tx, clock: Clock, newId: () => string,
  input: { mealLogId: string; toDateKey: DateKey; slot: MealSlot },
): Promise<string> {
  const src = await tx.get<{ id: string; note: string | null }>('SELECT id, note FROM meal_logs WHERE id = ?', [input.mealLogId]);
  if (!src) throw new Error(`öğün bulunamadı: ${input.mealLogId}`);
  const now = clock.nowUtc().toISOString();
  const newLogId = newId();
  await tx.exec(
    `INSERT INTO meal_logs (id, local_date_key, time_zone, logged_at_utc, meal_slot, copied_from_id, note)
     VALUES (?,?,?,?,?,?,?)`, [newLogId, input.toDateKey, clock.timeZone(), now, input.slot, src.id, src.note]);

  const entries = await tx.all<{ food_id: string | null; recipe_id: string | null; grams: number; order_index: number }>(
    'SELECT food_id, recipe_id, grams, order_index FROM meal_entries WHERE meal_log_id = ? ORDER BY order_index', [src.id]);
  for (const e of entries) {
    await insertEntry(tx, newId, newLogId, { foodId: e.food_id, recipeId: e.recipe_id }, e.grams, e.order_index);
  }
  return newLogId;
}

/** Son 7 gün içindeki aynı slot'un EN YENİ kaydını bugüne kopyalar. */
export async function repeatSlot(
  tx: Tx, clock: Clock, newId: () => string, input: { slot: MealSlot; toDateKey: DateKey },
): Promise<string | null> {
  const from = addDaysKey(input.toDateKey, -7);
  const last = await tx.get<{ id: string }>(
    `SELECT id FROM meal_logs
     WHERE meal_slot = ? AND local_date_key >= ? AND local_date_key < ?
     ORDER BY local_date_key DESC, logged_at_utc DESC LIMIT 1`, [input.slot, from, input.toDateKey]);
  if (!last) return null;                             // "Son 7 günde bu öğün için kayıt yok."
  return copyMeal(tx, clock, newId, { mealLogId: last.id, toDateKey: input.toDateKey, slot: input.slot });
}

export async function saveAsMeal(
  tx: Tx, clock: Clock, newId: () => string, input: { mealLogId: string; name: string },
): Promise<string> {
  const entries = await tx.all<{ food_id: string | null; recipe_id: string | null; grams: number; order_index: number }>(
    'SELECT food_id, recipe_id, grams, order_index FROM meal_entries WHERE meal_log_id = ? ORDER BY order_index', [input.mealLogId]);
  if (entries.length === 0) throw new Error('boş öğün kaydedilemez');
  const id = newId();
  await tx.exec('INSERT INTO saved_meals (id, name, created_at_utc) VALUES (?,?,?)',
    [id, input.name.trim(), clock.nowUtc().toISOString()]);
  for (const e of entries) {
    // Kayıtlı öğün SNAPSHOT TAŞIMAZ: yalnızca ne/kaç gram. Değer eklenirken hesaplanır.
    await tx.exec(
      'INSERT INTO saved_meal_entries (id, saved_meal_id, food_id, recipe_id, grams, order_index) VALUES (?,?,?,?,?,?)',
      [newId(), id, e.food_id, e.recipe_id, e.grams, e.order_index]);
  }
  return id;
}

export async function listSavedMeals(tx: Tx): Promise<Array<{ id: string; name: string; itemCount: number }>> {
  const rows = await tx.all<{ id: string; name: string; itemCount: number }>(
    `SELECT sm.id, sm.name, COUNT(sme.id) AS itemCount
     FROM saved_meals sm LEFT JOIN saved_meal_entries sme ON sme.saved_meal_id = sm.id
     GROUP BY sm.id ORDER BY sm.name`);
  // Sürücü null-prototype satır döndürebilir; ekranlar ve testler düz nesne bekler.
  return rows.map((r) => ({ id: r.id, name: r.name, itemCount: Number(r.itemCount) }));
}

export async function insertSavedMeal(
  tx: Tx, clock: Clock, newId: () => string,
  input: { savedMealId: string; toDateKey: DateKey; slot: MealSlot },
): Promise<string> {
  const entries = await tx.all<{ food_id: string | null; recipe_id: string | null; grams: number; order_index: number }>(
    'SELECT food_id, recipe_id, grams, order_index FROM saved_meal_entries WHERE saved_meal_id = ? ORDER BY order_index',
    [input.savedMealId]);
  if (entries.length === 0) throw new Error(`kayıtlı öğün boş ya da yok: ${input.savedMealId}`);
  const now = clock.nowUtc().toISOString();
  const logId = newId();
  await tx.exec(
    `INSERT INTO meal_logs (id, local_date_key, time_zone, logged_at_utc, meal_slot, saved_meal_id)
     VALUES (?,?,?,?,?,?)`, [logId, input.toDateKey, clock.timeZone(), now, input.slot, input.savedMealId]);
  for (const e of entries) {
    await insertEntry(tx, newId, logId, { foodId: e.food_id, recipeId: e.recipe_id }, e.grams, e.order_index);
  }
  return logId;
}

export async function toggleFavorite(tx: Tx, clock: Clock, foodId: string): Promise<boolean> {
  const has = await tx.get<{ food_id: string }>('SELECT food_id FROM food_favorites WHERE food_id = ?', [foodId]);
  if (has) { await tx.exec('DELETE FROM food_favorites WHERE food_id = ?', [foodId]); return false; }
  await tx.exec('INSERT INTO food_favorites (food_id, added_at_utc) VALUES (?,?)', [foodId, clock.nowUtc().toISOString()]);
  return true;
}

/** Son 30 gün, sıklık sıralı (02 §10). */
export async function recentFoodIds(tx: Tx, todayKey: DateKey, limit = 30): Promise<string[]> {
  const rows = await tx.all<{ food_id: string }>(
    `SELECT me.food_id, COUNT(*) AS n
     FROM meal_entries me JOIN meal_logs ml ON ml.id = me.meal_log_id
     WHERE me.food_id IS NOT NULL AND ml.local_date_key >= ?
     GROUP BY me.food_id ORDER BY n DESC, MAX(ml.logged_at_utc) DESC LIMIT ?`,
    [addDaysKey(todayKey, -30), limit]);
  return rows.map((r) => r.food_id);
}
