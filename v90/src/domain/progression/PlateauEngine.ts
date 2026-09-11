// Plateau tespiti — docs/v90/04-domain-engines.md §5.
// Motor INSIGHT üretir, programı değiştirmez (R104.3, R104.7).
// Tek kötü antrenman asla tetiklemez: 3 ardışık exposure gerekir (R104.1, R104.2).

import type { Exercise, Exposure, Side } from '../types.ts';
import { comparable } from '../exercise/LoadBehavior.ts';
import { bestEffectiveLoad } from './ProgressionEngine.ts';

export const PLATEAU_WINDOW = 3;
export const COOLDOWN_EXPOSURES = 3;

/** R104.4 sırası — değiştirilemez. */
export const CHECKLIST_ORDER = [
  'recovery', 'sleep', 'adherence', 'rirAccuracy', 'technique', 'rest', 'suitability',
] as const;
export type ChecklistKey = (typeof CHECKLIST_ORDER)[number];
export type ChecklistStatus = 'ok' | 'attention' | 'unknown';
export type SuggestionKind = 'sameLoad' | 'repTargetAdjust' | 'substitution' | 'deload';

export interface ChecklistItem {
  key: ChecklistKey;
  status: ChecklistStatus;
  valueTr: string;
}

export interface PlateauContext {
  /** Son 7 gün check-in ortalamaları; veri yoksa null. */
  recovery?: { soreness: number | null; energy: number | null; days: number } | null;
  sleep?: { averageHours: number | null; targetHours: number | null; nights: number } | null;
  nutrition?: { proteinAdherencePct: number | null; kcalOffDays: number | null; loggedDays: number } | null;
  rest?: { averageSeconds: number | null; targetSeconds: number | null } | null;
  /** Aynı kası çalıştıran, ekipmanı uygun alternatif var mı? */
  hasAlternative?: boolean;
  exposuresSinceLastInsight?: number;
}

export interface PlateauInsight {
  exerciseId: string;
  side: Side;
  exposureSessionIds: string[];
  checklist: ChecklistItem[];
  suggestions: SuggestionKind[];
}

export interface PlateauInput {
  exercise: Exercise;
  exposures: Exposure[];          // en yeni sonda
  /** Exposure başına ham yük (ölçek karşılaştırması için). */
  rawByExposure?: Array<{ bodyweightKgSnapshot?: number | null }>;
  context?: PlateauContext;
}

export function evaluate(input: PlateauInput): PlateauInsight | null {
  const ex = input.exposures.slice(-PLATEAU_WINDOW);
  if (ex.length < PLATEAU_WINDOW) return null;                       // R104.1
  if ((input.context?.exposuresSinceLastInsight ?? Infinity) < COOLDOWN_EXPOSURES) return null;

  // Ölçek tutarlılığı: bodyweight'e bağlı türlerde karışık veri kıyaslanmaz.
  const raws = input.rawByExposure?.slice(-PLATEAU_WINDOW);
  if (raws && raws.length === ex.length) {
    for (let i = 1; i < raws.length; i++) {
      if (!comparable(raws[i - 1]!, raws[i]!, input.exercise)) return null;
    }
  }

  const loads = ex.map(bestEffectiveLoad);
  const first = loads[0];
  const loadStalled = loads.every((l) => l != null) && Math.max(...(loads as number[])) <= (first as number);

  const repsAtFirstLoad = ex.map((e) => maxRepsAtLoad(e, first ?? null));
  const repsStalled = Math.max(...repsAtFirstLoad) <= repsAtFirstLoad[0]!;

  const rirInBand = ex.every((e) => {
    const r = minRir(e);
    return r == null || (r >= e.target.targetRir - 1 && r <= e.target.targetRir + 1);
  });

  const clean = ex.every((e) => e.workingSets.every((s) => !s.painFlag && !s.formBreakdownFlag));

  if (!(loadStalled && repsStalled && rirInBand && clean)) return null;   // R104.2

  const checklist = buildChecklist(input);
  return {
    exerciseId: input.exercise.id,
    side: ex[0]!.side,
    exposureSessionIds: ex.map((e) => e.sessionId),
    checklist,
    suggestions: buildSuggestions(checklist),
  };
}

export function buildChecklist(input: PlateauInput): ChecklistItem[] {
  const c = input.context ?? {};
  const items: ChecklistItem[] = [];

  const rec = c.recovery;
  items.push(rec == null || rec.days < 3 || rec.soreness == null || rec.energy == null
    ? { key: 'recovery', status: 'unknown', valueTr: 'Yeterli check-in verisi yok.' }
    : rec.soreness >= 4 || rec.energy <= 2
      ? { key: 'recovery', status: 'attention', valueTr: `Kas ağrısı ${fmt(rec.soreness)}/5, enerji ${fmt(rec.energy)}/5.` }
      : { key: 'recovery', status: 'ok', valueTr: `Kas ağrısı ${fmt(rec.soreness)}/5, enerji ${fmt(rec.energy)}/5.` });

  const sl = c.sleep;
  items.push(sl == null || sl.nights < 4 || sl.averageHours == null || sl.targetHours == null
    ? { key: 'sleep', status: 'unknown', valueTr: 'Yeterli uyku kaydı yok.' }
    : sl.averageHours < sl.targetHours - 1
      ? { key: 'sleep', status: 'attention', valueTr: `Son 7 gün ortalama uyku ${fmt(sl.averageHours)} sa (hedef ${fmt(sl.targetHours)}).` }
      : { key: 'sleep', status: 'ok', valueTr: `Son 7 gün ortalama uyku ${fmt(sl.averageHours)} sa.` });

  const n = c.nutrition;
  items.push(n == null || n.loggedDays < 4 || n.proteinAdherencePct == null
    ? { key: 'adherence', status: 'unknown', valueTr: 'Yeterli beslenme kaydı yok.' }
    : n.proteinAdherencePct < 90 || (n.kcalOffDays ?? 0) >= 3
      ? { key: 'adherence', status: 'attention', valueTr: `Protein hedefine uyum %${Math.round(n.proteinAdherencePct)}.` }
      : { key: 'adherence', status: 'ok', valueTr: `Protein hedefine uyum %${Math.round(n.proteinAdherencePct)}.` });

  const ex = input.exposures.slice(-PLATEAU_WINDOW);
  const rirs = ex.map(minRir).filter((r): r is number => r != null);
  items.push(rirs.length === 0
    ? { key: 'rirAccuracy', status: 'unknown', valueTr: 'RIR girilmemiş.' }
    : rirs.every((r, i) => r >= ex[i]!.target.targetRir)
      ? { key: 'rirAccuracy', status: 'attention', valueTr: 'RIR hedefte görünüyor ama tekrar artmıyor; setler sanılandan kolay olabilir.' }
      : { key: 'rirAccuracy', status: 'ok', valueTr: 'RIR raporların performansla tutarlı.' });

  items.push({ key: 'technique', status: 'ok', valueTr: 'Son 3 antrenmanda teknik/ağrı işareti yok.' });

  const r = c.rest;
  items.push(r == null || r.averageSeconds == null || r.targetSeconds == null
    ? { key: 'rest', status: 'unknown', valueTr: 'Dinlenme kaydı yok.' }
    : r.averageSeconds < r.targetSeconds * 0.7
      ? { key: 'rest', status: 'attention', valueTr: `Ortalama dinlenme ${Math.round(r.averageSeconds)} sn (hedef ${r.targetSeconds} sn).` }
      : { key: 'rest', status: 'ok', valueTr: `Ortalama dinlenme ${Math.round(r.averageSeconds)} sn.` });

  items.push(c.hasAlternative && input.exercise.skillLevel === 'advanced'
    ? { key: 'suitability', status: 'attention', valueTr: 'Bu hareket ileri seviye; aynı kası çalıştıran bir alternatif denenebilir.' }
    : { key: 'suitability', status: 'ok', valueTr: 'Hareket seçimi hedefe uygun görünüyor.' });

  return CHECKLIST_ORDER.map((k) => items.find((i) => i.key === k)!);
}

/**
 * Öneri seçimi. Kritik ayrım: "bilinmiyor" ile "iyi" aynı şey DEĞİLDİR.
 * Toparlanma verisi eksikken deload önermek, olmayan bir teşhise dayanmak
 * olurdu (R123.1); bu durumda muhafazakâr seçenek yükü korumaktır.
 */
export function buildSuggestions(checklist: ChecklistItem[]): SuggestionKind[] {
  const by = (k: ChecklistKey) => checklist.find((i) => i.key === k)?.status;
  const dataKeys: ChecklistKey[] = ['recovery', 'sleep', 'adherence', 'rest'];
  const out: SuggestionKind[] = [];

  if (dataKeys.some((k) => by(k) === 'attention')) out.push('sameLoad');
  else if (dataKeys.some((k) => by(k) === 'unknown')) out.push('sameLoad');

  if (by('rirAccuracy') === 'attention') out.push('repTargetAdjust');
  if (by('suitability') === 'attention') out.push('substitution');

  // Yalnızca tüm toparlanma göstergeleri BİLİNİYOR ve iyiyken deload önerilir.
  if (out.length === 0) out.push('deload');
  return out;
}

function maxRepsAtLoad(e: Exposure, load: number | null): number {
  const at = e.workingSets.filter((s) => load == null || s.effectiveLoad === load);
  return at.length ? Math.max(...at.map((s) => s.reps)) : 0;
}

function minRir(e: Exposure): number | null {
  return e.workingSets.every((s) => s.rir != null)
    ? Math.min(...e.workingSets.map((s) => s.rir as number))
    : null;
}

const fmt = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
