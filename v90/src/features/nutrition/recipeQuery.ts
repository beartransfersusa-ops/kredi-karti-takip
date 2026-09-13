// Tarif okuma/yazma — docs/v90/06-ux-flows.md B.13 (R110, R111.3).
//
// Hesabın tamamı `RecipeBuilder` (saf) içindedir; burada yalnızca DB'ye
// bağlama var. Öğüne eklenirken ANLIK DEĞER yazılır: tarif sonradan
// değişse de geçmiş öğün kayıtları değişmez.
import { compute, portion } from '../../domain/nutrition/RecipeBuilder.ts';
import type { Per100g, RecipeInput, RecipeNutrition } from '../../domain/nutrition/RecipeBuilder.ts';
import type { Clock } from '../../core/clock/dateKey.ts';
import type { Tx } from '../../core/db/types.ts';

export interface FoodRow {
  id: string; name: string; brand: string | null; source: string;
  serving_unit: string; serving_size_g: number | null;
  kcal_per_100g: number; protein_g_per_100g: number;
  carb_g_per_100g: number; fat_g_per_100g: number; fiber_g_per_100g: number | null;
  custom_edited: number; last_updated: string;
}

export interface RecipeDraftIngredient {
  foodId: string;
  foodName: string;
  grams: number;
}

export interface RecipeDraft {
  id: string | null;
  name: string;
  cookedYieldG: number | null;
  note: string | null;
  ingredients: RecipeDraftIngredient[];
}

export const emptyDraft = (): RecipeDraft => ({
  id: null, name: '', cookedYieldG: null, note: null, ingredients: [],
});

export const toPer100g = (f: FoodRow): Per100g => ({
  kcal: f.kcal_per_100g,
  protein: f.protein_g_per_100g,
  carb: f.carb_g_per_100g,
  fat: f.fat_g_per_100g,
  fiber: f.fiber_g_per_100g,
});

/** Taslağın besin değerleri; malzeme yoksa `null` (toplam "—" gösterilir). */
export function draftNutrition(
  draft: RecipeDraft, foods: ReadonlyMap<string, Per100g>,
): RecipeNutrition | null {
  if (draft.ingredients.length === 0) return null;
  const input: RecipeInput = {
    id: draft.id ?? 'draft',
    name: draft.name,
    cookedYieldG: draft.cookedYieldG,
    ingredients: draft.ingredients.map((i) => ({ foodId: i.foodId, grams: i.grams })),
  };
  return compute(input, foods);
}

export { portion };

export async function loadFoods(tx: Tx, ids: readonly string[]): Promise<Map<string, FoodRow>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.all<FoodRow>(
    `SELECT * FROM food_items WHERE id IN (${ids.map(() => '?').join(',')})`, [...ids]);
  return new Map(rows.map((r) => [r.id, r]));
}

export async function loadRecipe(tx: Tx, recipeId: string): Promise<RecipeDraft | null> {
  const r = await tx.get<{ id: string; name: string; cooked_yield_g: number | null; note: string | null }>(
    'SELECT id, name, cooked_yield_g, note FROM recipes WHERE id = ? AND is_deleted = 0', [recipeId]);
  if (!r) return null;

  const rows = await tx.all<{ food_id: string; grams: number; name: string }>(
    `SELECT ri.food_id, ri.grams, f.name
     FROM recipe_ingredients ri JOIN food_items f ON f.id = ri.food_id
     WHERE ri.recipe_id = ? ORDER BY ri.order_index`, [recipeId]);

  return {
    id: r.id, name: r.name, cookedYieldG: r.cooked_yield_g, note: r.note,
    ingredients: rows.map((x) => ({ foodId: x.food_id, foodName: x.name, grams: x.grams })),
  };
}

export async function listRecipes(tx: Tx): Promise<Array<{ id: string; name: string; cookedYieldG: number | null }>> {
  const rows = await tx.all<{ id: string; name: string; cooked_yield_g: number | null }>(
    'SELECT id, name, cooked_yield_g FROM recipes WHERE is_deleted = 0 ORDER BY name');
  return rows.map((r) => ({ id: r.id, name: r.name, cookedYieldG: r.cooked_yield_g }));
}

/**
 * Tek transaction. Düzenlemede malzeme satırları silinip yeniden yazılır
 * (B.13 adım 6): sıra ve gram değişimlerini kısmi güncellemeyle takip etmek
 * yerine tam yeniden yazma, tutarsız ara durum bırakmaz.
 */
export async function saveRecipe(
  tx: Tx, clock: Clock, newId: () => string, draft: RecipeDraft,
): Promise<string> {
  const now = clock.nowUtc().toISOString();
  const id = draft.id ?? newId();

  if (draft.id) {
    await tx.exec(
      'UPDATE recipes SET name = ?, cooked_yield_g = ?, note = ?, updated_at_utc = ? WHERE id = ?',
      [draft.name, draft.cookedYieldG, draft.note, now, id]);
    await tx.exec('DELETE FROM recipe_ingredients WHERE recipe_id = ?', [id]);
  } else {
    await tx.exec(
      `INSERT INTO recipes (id, name, cooked_yield_g, note, is_deleted, created_at_utc, updated_at_utc)
       VALUES (?,?,?,?,0,?,?)`,
      [id, draft.name, draft.cookedYieldG, draft.note, now, now]);
  }

  for (const [index, ing] of draft.ingredients.entries()) {
    await tx.exec(
      `INSERT INTO recipe_ingredients (id, recipe_id, food_id, grams, order_index)
       VALUES (?,?,?,?,?)`, [newId(), id, ing.foodId, ing.grams, index]);
  }
  return id;
}

/** Tarifi öğüne ekler; snapshot `per100gCooked` üzerinden hesaplanır (B.13 adım 7). */
export async function addRecipeToMeal(
  tx: Tx, clock: Clock, newId: () => string,
  input: { recipeId: string; dateKey: string; slot: string; portionG: number },
): Promise<void> {
  const draft = await loadRecipe(tx, input.recipeId);
  if (!draft) throw new Error(`tarif bulunamadı: ${input.recipeId}`);

  const foods = await loadFoods(tx, draft.ingredients.map((i) => i.foodId));
  const nutrition = draftNutrition(draft, new Map([...foods].map(([k, v]) => [k, toPer100g(v)])));
  if (!nutrition) throw new Error('tarifin malzemesi yok');

  const macros = portion(nutrition, input.portionG).macros;
  const now = clock.nowUtc().toISOString();
  const logId = newId();

  await tx.exec(
    `INSERT INTO meal_logs (id, local_date_key, time_zone, logged_at_utc, meal_slot)
     VALUES (?,?,?,?,?)`, [logId, input.dateKey, clock.timeZone(), now, input.slot]);
  await tx.exec(
    `INSERT INTO meal_entries
       (id, meal_log_id, recipe_id, grams, kcal_snapshot, protein_g_snapshot,
        carb_g_snapshot, fat_g_snapshot, fiber_g_snapshot, order_index)
     VALUES (?,?,?,?,?,?,?,?,?,0)`,
    [newId(), logId, input.recipeId, input.portionG,
      macros.kcal, macros.proteinG, macros.carbG, macros.fatG, macros.fiberG]);
}

/**
 * Etiketten düzenleme (B.13 adım 8–9). `custom_edited = 1` işaretlenir;
 * seed güncellemesi bu satırları ATLAR (R111.3).
 */
export async function overrideFood(
  tx: Tx, clock: Clock,
  input: {
    foodId: string; brand: string | null; servingUnit: string; servingSizeG: number | null;
    kcal: number; protein: number; carb: number; fat: number; fiber: number | null;
  },
): Promise<void> {
  await tx.exec(
    `UPDATE food_items SET
       brand = ?, serving_unit = ?, serving_size_g = ?,
       kcal_per_100g = ?, protein_g_per_100g = ?, carb_g_per_100g = ?,
       fat_g_per_100g = ?, fiber_g_per_100g = ?,
       source = 'label-override', custom_edited = 1, last_updated = ?
     WHERE id = ?`,
    [input.brand, input.servingUnit, input.servingSizeG,
      input.kcal, input.protein, input.carb, input.fat, input.fiber,
      clock.nowUtc().toISOString(), input.foodId]);
}
