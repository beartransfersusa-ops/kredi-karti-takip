// Double progression ve öneri üretimi — docs/v90/04-domain-engines.md §4.
//
// Motor hiçbir şeyi otomatik uygulamaz: çıktısı kullanıcı kararı bekleyen bir
// Recommendation'dır (R104.7, R121.1) ve her zaman gerekçelidir (R122).

import type {
  Exercise, Exposure, RawLoad, Recommendation, RecommendationDecision, Side, WorkingSetRef,
} from '../types.ts';
import { effectiveLoad, toRaw } from '../exercise/LoadBehavior.ts';
import type { IncrementSpec } from '../exercise/IncrementResolver.ts';
import { roundToAvailable } from '../exercise/IncrementResolver.ts';

export const CONSERVATIVE_AFTER_IGNORED = 3;
/**
 * Yük artışının birimi **bir minimum kademedir** (yüzde değil): double
 * progression'da aralığın tepesine ulaşınca en küçük gerçek adım eklenir.
 * Kademe mevcut yüke göre çok büyük kalıyorsa (küçük dumbbell'lar, kaba makine
 * stack'leri) yük yerine tekrar hedefi artırılır (R100.5).
 * R100.3'teki "+%2,5–5" bandı tipik sonucu tarif eder; hesabın birimi değildir.
 */
export const MAX_JUMP_PCT = 0.08;
export const MAX_JUMP_PCT_CONSERVATIVE = 0.05;
export const DELOAD_PCT = 0.10;

export type HoldReason = 'pain' | 'formBreakdown' | 'partialSession' | 'belowTarget' | 'notComparable';

export interface ProgressionInput {
  exercise: Exercise;
  /** En yeni SONDA. Yalnızca working setler, discarded olmayanlar. */
  exposures: Exposure[];
  incrementSpec: IncrementSpec;
  decisionHistory?: RecommendationDecision[];
  /** Son sette kullanılan ham yük (toRaw için bağlam). */
  currentRaw?: RawLoad;
}

export function recommend(input: ProgressionInput): Recommendation | null {
  const last = input.exposures.at(-1);
  if (!last || last.workingSets.length === 0) return null;   // R103.5: yapılmayan harekete öneri yok

  const sets = last.workingSets;
  const { repMin, repMax, targetRir, plannedWorkingSets } = last.target;

  if (sets.some((s) => s.painFlag)) return hold(input, last, 'pain');
  if (sets.filter((s) => s.formBreakdownFlag).length >= Math.ceil(sets.length / 2)) {
    return hold(input, last, 'formBreakdown');
  }

  const minRir = sets.every((s) => s.rir != null)
    ? Math.min(...sets.map((s) => s.rir as number))
    : null;
  const allAtTop = sets.every((s) => s.reps >= repMax);
  const allBelowMin = sets.every((s) => s.reps < repMin);
  const rirOk = minRir == null || minRir >= targetRir;
  const rirTooLow = minRir != null && minRir < targetRir - 1;
  const partial = sets.length < plannedWorkingSets;

  if (partial) return hold(input, last, 'partialSession');   // R103.5: eksik veriden öneri çıkmaz
  if (allAtTop && rirOk) return loadIncrease(input, last);
  if (allBelowMin || rirTooLow) {
    return secondConsecutiveMiss(input) ? loadDecrease(input, last) : hold(input, last, 'belowTarget');
  }
  return repIncrease(input, last, nextRepTarget(sets, repMin, repMax));
}

/** Unilateral `separate` modda öneri EN ZAYIF tarafa göre verilir (R102.3). */
export function weakestSide(bySide: Partial<Record<Side, Exposure>>): Side | null {
  const entries = (Object.entries(bySide) as Array<[Side, Exposure | undefined]>)
    .filter((e): e is [Side, Exposure] => !!e[1] && e[1].workingSets.length > 0);
  if (entries.length === 0) return null;
  const score = ([, e]: [Side, Exposure]) => {
    const loads = e.workingSets.map((s) => s.effectiveLoad).filter((v): v is number => v != null);
    const load = loads.length ? Math.max(...loads) : 0;
    const reps = e.workingSets.reduce((n, s) => n + s.reps, 0);
    return load * 1000 + reps;
  };
  return entries.reduce((a, b) => (score(b) < score(a) ? b : a))[0];
}

// ---------------------------------------------------------------- dallar
function loadIncrease(i: ProgressionInput, last: Exposure): Recommendation {
  const current = bestEffectiveLoad(last);
  if (current == null) {
    // bodyweight ölçeği yok → yük yerine tekrar
    return repIncrease(i, last, nextRepTarget(last.workingSets, last.target.repMin, last.target.repMax));
  }
  const r = roundToAvailable(current + i.incrementSpec.incrementKg, current, i.incrementSpec);
  const maxJump = conservative(i) ? MAX_JUMP_PCT_CONSERVATIVE : MAX_JUMP_PCT;
  const tooBig = jumpTooBig(current, r.value, maxJump, i.exercise);
  if (r.fallback === 'repProgression' || tooBig) {
    const reps = last.target.repMax + 1;        // yük artamıyorsa tek ilerleme yolu tekrardır
    const why = tooBig
      ? `Bir kademe artış (${fmt(r.value)} kg) şu anki yüke göre fazla büyük.`
      : `Bu hareketin en küçük artışı ${fmt(i.incrementSpec.incrementKg)} kg.`;
    return build(i, last, 'repIncrease', { reps, reason: 'incrementTooCoarse' },
      `${why} Ağırlığı sabit tutup tekrar hedefini ${reps}'e çıkar.`,
      { currentEffectiveLoad: current, incrementKg: i.incrementSpec.incrementKg, maxJumpPct: maxJump });
  }
  const raw = toRaw(r.value, i.exercise, i.currentRaw ?? {});
  const n = last.workingSets.length;
  return build(i, last, 'loadIncrease', { effectiveLoad: r.value, raw },
    `Son antrenmanda ${n}/${n} sette ${last.target.repMax} tekrar yaptın ve RIR hedefinin içinde kaldın.`,
    { currentEffectiveLoad: current, proposedEffectiveLoad: r.value, conservative: conservative(i) ? 1 : 0 });
}

function repIncrease(i: ProgressionInput, last: Exposure, reps: number): Recommendation {
  return build(i, last, 'repIncrease', { reps },
    `Setlerin ${last.target.repMin}–${last.target.repMax} aralığının içinde. Aynı ağırlıkta ${reps} tekrara çıkmayı dene.`,
    { targetReps: reps });
}

function hold(i: ProgressionInput, last: Exposure, reason: HoldReason): Recommendation {
  const done = last.workingSets.length;
  const texts: Record<HoldReason, string> = {
    pain: 'Bu harekette ağrı işaretledin. Ağırlığı sabit tut, tekniğe odaklan.',
    formBreakdown: 'Setlerin çoğunda form bozulduğunu işaretledin. Ağırlığı sabit tutup tekniği düzeltmeye odaklan.',
    partialSession: `Bu antrenmanda planlanan ${last.target.plannedWorkingSets} setin ${done} tanesini yaptın. Öneri için tam bir antrenman bekliyoruz.`,
    belowTarget: 'Son antrenmanda hedef tekrarın altında kaldın. Aynı ağırlıkla bir kez daha dene.',
    notComparable: 'Kilo kaydı olmadığı için bu antrenman öncekiyle karşılaştırılamadı.',
  };
  return build(i, last, 'holdLoad', { reason }, texts[reason], { doneSets: done });
}

function loadDecrease(i: ProgressionInput, last: Exposure): Recommendation {
  const current = bestEffectiveLoad(last);
  if (current == null) return hold(i, last, 'belowTarget');
  const r = roundToAvailable(current * (1 - DELOAD_PCT), current, i.incrementSpec);
  const raw = toRaw(r.value, i.exercise, i.currentRaw ?? {});
  return build(i, last, 'loadDecrease', { effectiveLoad: r.value, raw },
    `İki antrenman üst üste hedef tekrarın altında kaldın. Ağırlığı ${fmt(r.value)} kg'a çekip tekrar kur.`,
    { currentEffectiveLoad: current, proposedEffectiveLoad: r.value });
}

// ---------------------------------------------------------------- yardımcılar
function build(
  i: ProgressionInput, last: Exposure,
  kind: Recommendation['kind'], proposed: Recommendation['proposed'],
  rationaleTr: string, metrics: Record<string, number>,
): Recommendation {
  return {
    kind,
    exerciseId: i.exercise.id,
    side: last.side,
    proposed,
    rationaleTr,
    evidence: { setLogIds: last.workingSets.map((s) => s.setLogId), metrics },
    isEstimate: false,
  };
}

/** Piramit setlerde: en çok tekrarlanan yük, eşitlikte en yüksek (§4.4 E4). */
export function bestEffectiveLoad(e: Exposure): number | null {
  const loads = e.workingSets.map((s) => s.effectiveLoad).filter((v): v is number => v != null);
  if (loads.length === 0) return null;
  const freq = new Map<number, number>();
  for (const l of loads) freq.set(l, (freq.get(l) ?? 0) + 1);
  let best = loads[0]!;
  let bestN = 0;
  for (const [load, n] of freq) {
    if (n > bestN || (n === bestN && load > best)) { best = load; bestN = n; }
  }
  return best;
}

/**
 * Yüzde eşiği yalnızca gerçek kg ölçeğinde anlamlıdır: ordinal türlerde
 * (makine kademesi, band) ve ölçeksiz/negatif effective load'da uygulanmaz.
 */
function jumpTooBig(current: number, next: number, maxPct: number, ex: Exercise): boolean {
  if (ex.loadProgressionType === 'machineLevel' || ex.loadProgressionType === 'distanceOrBand') return false;
  if (current <= 0) return false;
  return (next - current) / current > maxPct;
}

function nextRepTarget(sets: WorkingSetRef[], repMin: number, repMax: number): number {
  const lowest = Math.min(...sets.map((s) => s.reps));
  return Math.min(repMax, Math.max(repMin, lowest + 1));
}

function secondConsecutiveMiss(i: ProgressionInput): boolean {
  const prev = i.exposures.at(-2);
  if (!prev || prev.workingSets.length === 0) return false;
  const { repMin, targetRir } = prev.target;
  const minRir = prev.workingSets.every((s) => s.rir != null)
    ? Math.min(...prev.workingSets.map((s) => s.rir as number))
    : null;
  const allBelowMin = prev.workingSets.every((s) => s.reps < repMin);
  const rirTooLow = minRir != null && minRir < targetRir - 1;
  return allBelowMin || rirTooLow;
}

/** R121.3: kullanıcı kararları sonraki öneriyi yumuşatır. */
export function conservative(i: ProgressionInput): boolean {
  const recent = (i.decisionHistory ?? []).slice(-CONSERVATIVE_AFTER_IGNORED);
  const allIgnored = recent.length === CONSERVATIVE_AFTER_IGNORED && recent.every((d) => d.action === 'ignored');
  const modifiedDown = recent.some((d) => d.action === 'modified'
    && d.userValue != null && d.proposedValue != null && d.userValue < d.proposedValue);
  return allIgnored || modifiedDown;
}

const fmt = (x: number) => (Number.isInteger(x) ? String(x) : String(x).replace('.', ','));

export { effectiveLoad };
