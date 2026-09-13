// Beslenme günlüğü okuması — docs/v90/06-ux-flows.md B.12.
//
// Öğün girdileri ANLIK DEĞER (snapshot) saklar: besin sonradan düzenlense de
// geçmiş gün toplamları değişmez (03 §1 `*_snapshot` kolonları).
import type { Tx } from '../../core/db/types.ts';
import type { DateKey } from '../../domain/types.ts';
import { addDaysKey } from '../format.ts';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'preWorkout', 'postWorkout'] as const;
export type MealSlot = typeof MEAL_SLOTS[number];

export interface MealEntryView {
  id: string;
  name: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
}

export interface MealView {
  id: string;
  slot: MealSlot;
  note: string | null;
  entries: MealEntryView[];
  totals: Totals;
}

export interface Totals { kcal: number; proteinG: number; carbG: number; fatG: number }

export interface NutritionDay {
  dateKey: DateKey;
  meals: MealView[];
  totals: Totals;
  target: { kcal: number; proteinG: number } | null;
  yesterdayHasData: boolean;
}

const ZERO: Totals = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0 };

const sum = (a: Totals, b: Totals): Totals => ({
  kcal: a.kcal + b.kcal, proteinG: a.proteinG + b.proteinG,
  carbG: a.carbG + b.carbG, fatG: a.fatG + b.fatG,
});

export async function loadDay(tx: Tx, dateKey: DateKey): Promise<NutritionDay> {
  const logs = await tx.all<{ id: string; meal_slot: string; note: string | null }>(
    'SELECT id, meal_slot, note FROM meal_logs WHERE local_date_key = ? ORDER BY logged_at_utc',
    [dateKey]);

  const meals: MealView[] = [];
  for (const log of logs) {
    const rows = await tx.all<{
      id: string; grams: number; kcal_snapshot: number; protein_g_snapshot: number;
      carb_g_snapshot: number; fat_g_snapshot: number;
      food_name: string | null; recipe_name: string | null;
    }>(
      `SELECT me.id, me.grams, me.kcal_snapshot, me.protein_g_snapshot,
              me.carb_g_snapshot, me.fat_g_snapshot,
              f.name AS food_name, r.name AS recipe_name
       FROM meal_entries me
       LEFT JOIN food_items f ON f.id = me.food_id
       LEFT JOIN recipes r ON r.id = me.recipe_id
       WHERE me.meal_log_id = ? ORDER BY me.order_index`, [log.id]);

    const entries: MealEntryView[] = rows.map((r) => ({
      id: r.id,
      name: r.food_name ?? r.recipe_name ?? 'Bilinmeyen',
      grams: r.grams,
      kcal: r.kcal_snapshot,
      proteinG: r.protein_g_snapshot,
      carbG: r.carb_g_snapshot,
      fatG: r.fat_g_snapshot,
    }));

    meals.push({
      id: log.id,
      slot: log.meal_slot as MealSlot,
      note: log.note,
      entries,
      totals: entries.reduce<Totals>((acc, e) => sum(acc, {
        kcal: e.kcal, proteinG: e.proteinG, carbG: e.carbG, fatG: e.fatG,
      }), ZERO),
    });
  }

  const target = await tx.get<{ kcal: number; protein_g: number }>(
    `SELECT kcal, protein_g FROM nutrition_targets
     WHERE effective_from_date_key <= ? ORDER BY effective_from_date_key DESC LIMIT 1`, [dateKey]);

  const yesterday = await tx.get<{ n: number }>(
    'SELECT COUNT(*) n FROM meal_logs WHERE local_date_key = ?', [addDaysKey(dateKey, -1)]);

  return {
    dateKey,
    meals,
    totals: meals.reduce<Totals>((acc, m) => sum(acc, m.totals), ZERO),
    target: target ? { kcal: target.kcal, proteinG: target.protein_g } : null,
    yesterdayHasData: (yesterday?.n ?? 0) > 0,
  };
}

/**
 * "Copy Yesterday" — dünün öğünleri bugüne EKLENİR, üzerine yazılmaz
 * (06 açık nokta: çakışmada "ekle" seçildi). Snapshot'lar GÜNCEL
 * food_items/recipes değerinden YENİDEN hesaplanır (B.12 tablosu): dün
 * loglanan kayıt olduğu gibi kalır, bugünkü kopya o aradaki düzeltmeleri taşır.
 */
export async function copyDay(
  tx: Tx, from: DateKey, to: DateKey, nowUtc: string, timeZone: string, newId: () => string,
): Promise<number> {
  const { copyMeal } = await import('./copyService.ts');
  const logs = await tx.all<{ id: string; meal_slot: string }>(
    'SELECT id, meal_slot FROM meal_logs WHERE local_date_key = ? ORDER BY logged_at_utc', [from]);
  const clock = { nowUtc: () => new Date(nowUtc), timeZone: () => timeZone, todayKey: () => to };
  let copied = 0;
  for (const log of logs) {
    const newLogId = await copyMeal(tx, clock, newId, { mealLogId: log.id, toDateKey: to, slot: log.meal_slot as MealSlot });
    copied += (await tx.get<{ n: number }>('SELECT COUNT(*) n FROM meal_entries WHERE meal_log_id = ?', [newLogId]))?.n ?? 0;
  }
  return copied;
}
