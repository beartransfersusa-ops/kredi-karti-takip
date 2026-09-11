// Tarif ve porsiyon hesabı — docs/v90/04-domain-engines.md §10.
// Kritik kural: porsiyon YUVARLANMIŞ per100g'den değil, tam hassasiyetli
// toplamdan hesaplanır; aksi hâlde yuvarlama hatası porsiyona taşınır.

export interface Per100g { kcal: number; protein: number; carb: number; fat: number; fiber?: number | null }
export interface Macros { kcal: number; proteinG: number; carbG: number; fatG: number; fiberG: number | null }
export interface RecipeIngredient { foodId: string; grams: number }
export interface RecipeInput { id: string; name: string; cookedYieldG?: number | null; ingredients: RecipeIngredient[] }
export type RecipeWarning = 'noCookedYield' | 'yieldImplausible' | 'portionExceedsBasis' | 'ingredientMissing';

export interface RecipeNutrition {
  recipeId: string;
  rawTotalG: number;
  basis: 'cookedYield' | 'rawTotal';
  basisG: number;
  /** YUVARLANMAMIŞ — porsiyon hesabının kaynağı. */
  total: Macros;
  per100g: Macros;
  warnings: RecipeWarning[];
}

export const round1 = (x: number): number => Math.round((x + Number.EPSILON) * 10) / 10;
export const roundKcal = (x: number): number => Math.round(x + Number.EPSILON);

export function roundMacros(m: Macros): Macros {
  return {
    kcal: roundKcal(m.kcal), proteinG: round1(m.proteinG), carbG: round1(m.carbG),
    fatG: round1(m.fatG), fiberG: m.fiberG === null ? null : round1(m.fiberG),
  };
}

const scale = (m: Macros, k: number): Macros => ({
  kcal: m.kcal * k, proteinG: m.proteinG * k, carbG: m.carbG * k, fatG: m.fatG * k,
  fiberG: m.fiberG === null ? null : m.fiberG * k,
});

export function compute(recipe: RecipeInput, foods: ReadonlyMap<string, Per100g>): RecipeNutrition {
  if (recipe.ingredients.length === 0) throw new Error('tarifte en az bir malzeme olmalı');
  const warnings = new Set<RecipeWarning>();
  const total: Macros = { kcal: 0, proteinG: 0, carbG: 0, fatG: 0, fiberG: 0 };
  let fiberKnown = true;
  let rawTotalG = 0;

  for (const ing of recipe.ingredients) {
    if (!(ing.grams > 0)) throw new Error(`malzeme gramı > 0 olmalı: ${ing.foodId}`);
    const f = foods.get(ing.foodId);
    if (!f) { warnings.add('ingredientMissing'); continue; }
    const k = ing.grams / 100;
    rawTotalG += ing.grams;
    total.kcal += f.kcal * k;
    total.proteinG += f.protein * k;
    total.carbG += f.carb * k;
    total.fatG += f.fat * k;
    if (f.fiber == null) fiberKnown = false;
    else total.fiberG = (total.fiberG ?? 0) + f.fiber * k;
  }
  if (!fiberKnown) total.fiberG = null;

  const yieldG = recipe.cookedYieldG ?? null;
  if (yieldG === null) warnings.add('noCookedYield');                       // R110.5 zorunlu not
  else if (yieldG < rawTotalG * 0.25 || yieldG > rawTotalG * 4) warnings.add('yieldImplausible');

  const basisG = yieldG ?? rawTotalG;
  return {
    recipeId: recipe.id, rawTotalG, basis: yieldG !== null ? 'cookedYield' : 'rawTotal', basisG,
    total, per100g: scale(total, 100 / basisG), warnings: [...warnings],
  };
}

export interface PortionNutrition {
  recipeId: string; portionG: number; basis: RecipeNutrition['basis'];
  macros: Macros; warnings: RecipeWarning[];
}

export function portion(n: RecipeNutrition, portionG: number): PortionNutrition {
  if (!Number.isFinite(portionG) || portionG <= 0) throw new Error('porsiyon > 0 olmalı');
  const warnings = [...n.warnings];
  if (portionG > n.basisG) warnings.push('portionExceedsBasis');    // birden çok parti olabilir; engellenmez
  return { recipeId: n.recipeId, portionG, basis: n.basis, macros: roundMacros(scale(n.total, portionG / n.basisG)), warnings };
}

/** Yalnızca gösterim; porsiyon hesabında KULLANILMAZ. */
export const displayPer100g = (n: RecipeNutrition): Macros => roundMacros(n.per100g);
