// Akıllı hareket değiştirme — docs/v90/04-domain-engines.md §8.
// Alternatifler RASTGELE DEĞİLDİR (R99.2): deterministik puanlama, eşitlikte id.

import type { EquipmentTag, Exercise, ExerciseRelation, Joint, SkillLevel } from '../types.ts';

export const SKILL_ORDER: Readonly<Record<SkillLevel, number>> = {
  beginner: 0, intermediate: 1, advanced: 2,
};

/** 02 §8.3 ağırlıkları. */
export const WEIGHTS = {
  primaryMuscle: 100, movementPattern: 60, secondaryJaccard: 20, lengthenedBias: 10,
  loadType: 8, skillOk: 5, painPerLevel: -25, explicitRelation: 15, history: 3,
} as const;

export interface SubstitutionContext {
  available: EquipmentTag[];
  painAreas?: Joint[];
  experience?: SkillLevel;
  historyExerciseIds?: ReadonlySet<string>;
  relations?: readonly ExerciseRelation[];
}

export interface SubstitutionCandidate {
  exercise: Exercise;
  score: number;
  sameIntent: boolean;
  reasonsTr: string[];
}

export interface SubstitutionResult {
  sameIntent: SubstitutionCandidate[];
  otherIntent: SubstitutionCandidate[];
}

/** Vücut ağırlığı her zaman mevcuttur; kullanıcı kapatamaz (R37.4). */
const ALWAYS_AVAILABLE: EquipmentTag = 'bodyweightOnly';

export function isAvailable(ex: Exercise, available: readonly EquipmentTag[]): boolean {
  const set = new Set<EquipmentTag>([...available, ALWAYS_AVAILABLE]);
  return ex.equipment.every((t) => set.has(t));
}

export function alternatives(
  baseId: string,
  catalog: readonly Exercise[],
  ctx: SubstitutionContext,
): SubstitutionResult {
  const base = catalog.find((e) => e.id === baseId);
  if (!base) throw new Error(`katalogda yok: ${baseId}`);

  const relationPriority = new Map<string, number>();
  for (const r of ctx.relations ?? []) {
    if (r.exerciseId === baseId) relationPriority.set(r.relatedExerciseId, r.priority);
  }

  const scored: SubstitutionCandidate[] = [];
  for (const c of catalog) {
    if (c.id === baseId) continue;
    if (!isAvailable(c, ctx.available)) continue;
    if (c.primaryMuscle !== base.primaryMuscle && c.movementPattern !== base.movementPattern) continue;
    const hasRelation = relationPriority.has(c.id);
    scored.push({
      exercise: c,
      score: score(base, c, ctx, hasRelation),
      sameIntent: c.movementPattern === base.movementPattern,
      reasonsTr: reasons(base, c, ctx, hasRelation),
    });
  }

  const order = (a: SubstitutionCandidate, b: SubstitutionCandidate) => {
    const pa = relationPriority.get(a.exercise.id);
    const pb = relationPriority.get(b.exercise.id);
    if (pa != null && pb != null && pa !== pb) return pa - pb;   // explicit ilişki sırası önce
    if (pa != null && pb == null) return -1;
    if (pa == null && pb != null) return 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.exercise.id < b.exercise.id ? -1 : 1;               // deterministik (R99.2)
  };

  return {
    sameIntent: scored.filter((c) => c.sameIntent).sort(order),
    otherIntent: scored.filter((c) => !c.sameIntent).sort(order),
  };
}

export function score(base: Exercise, c: Exercise, ctx: SubstitutionContext, hasRelation: boolean): number {
  let s = 0;
  if (c.primaryMuscle === base.primaryMuscle) s += WEIGHTS.primaryMuscle;
  if (c.movementPattern === base.movementPattern) s += WEIGHTS.movementPattern;
  s += WEIGHTS.secondaryJaccard * jaccard(base.secondaryMuscles, c.secondaryMuscles);
  s += WEIGHTS.lengthenedBias * (3 - Math.abs(base.lengthenedBias - c.lengthenedBias));
  if (c.loadProgressionType === base.loadProgressionType) s += WEIGHTS.loadType;
  const exp = ctx.experience ?? 'intermediate';
  if (SKILL_ORDER[c.skillLevel] <= SKILL_ORDER[exp]) s += WEIGHTS.skillOk;
  for (const j of ctx.painAreas ?? []) s += WEIGHTS.painPerLevel * (c.jointStressProfile[j] ?? 0);
  if (hasRelation) s += WEIGHTS.explicitRelation;
  if (ctx.historyExerciseIds?.has(c.id)) s += WEIGHTS.history;
  return s;
}

function reasons(base: Exercise, c: Exercise, ctx: SubstitutionContext, hasRelation: boolean): string[] {
  const out: string[] = [];
  if (c.primaryMuscle === base.primaryMuscle) out.push('Aynı kas');
  if (c.movementPattern === base.movementPattern) out.push('aynı hareket kalıbı');
  if (hasRelation) out.push('önerilen alternatif');
  const relieved = (ctx.painAreas ?? []).filter(
    (j) => (c.jointStressProfile[j] ?? 0) < (base.jointStressProfile[j] ?? 0));
  if (relieved.length) out.push(`${relieved.map(jointTr).join(' ve ')} yükü daha az`);
  const exp = ctx.experience ?? 'intermediate';
  if (SKILL_ORDER[c.skillLevel] > SKILL_ORDER[exp]) out.push('ileri seviye');
  out.push('ekipmanın var');
  return out.slice(0, 3);
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

const JOINT_TR: Record<Joint, string> = {
  shoulder: 'omuz', elbow: 'dirsek', wrist: 'bilek', lowerBack: 'bel',
  hip: 'kalça', knee: 'diz', ankle: 'ayak bileği',
};
const jointTr = (j: Joint) => JOINT_TR[j];
