// Kişisel rekor tespiti — docs/v90/04-domain-engines.md §7.
// Set commit transaction'ının İÇİNDE çalışır: kutlama ile kayıt ayrışmaz.

import type { Exercise, PrType, RawLoad, Side } from '../types.ts';
import { BODYWEIGHT_DEPENDENT, comparable, effectiveLoad, round2 } from '../exercise/LoadBehavior.ts';

export const EPLEY_MAX_REPS = 12;
export const E1RM_TYPES: ReadonlySet<string> = new Set([
  'externalLoadHigherIsHarder', 'bodyweightPlusExternalLoad', 'assistanceLowerIsHarder',
]);

export interface PrCandidateSet {
  setLogId: string;
  sessionId: string;
  exerciseId: string;
  side: Side;
  setType: 'warmup' | 'working' | 'dropset' | 'backoff';
  raw: RawLoad;
  reps: number;
  excludeFromPr: boolean;
  discarded: boolean;
}

export interface PersonalRecordDraft {
  prType: PrType;
  exerciseId: string | null;
  side: Side;
  setLogId?: string;
  sessionId: string;
  effectiveLoad?: number | null;
  reps?: number | null;
  estimated1rm?: number | null;
  sessionVolume?: number | null;
  isEstimate: boolean;
}

/** Geçerli (voided olmayan, superseded olmayan) en iyi kayıtlar. */
export interface CurrentPrs {
  loadPr?: { effectiveLoad: number; raw?: RawLoad } | null;
  repsAtLoad?: Map<number, number> | null;   // effectiveLoad -> en iyi reps
  bestRepsNoScale?: number | null;
  estimated1rm?: number | null;
  sessionVolume?: number | null;
}

export const isPrCandidate = (s: PrCandidateSet): boolean =>
  s.setType === 'working' && !s.excludeFromPr && !s.discarded;   // R107.2, R107.3

export function detectForSet(s: PrCandidateSet, ex: Exercise, current: CurrentPrs): PersonalRecordDraft[] {
  if (!isPrCandidate(s)) return [];
  const eff = effectiveLoad(s.raw, ex);
  const out: PersonalRecordDraft[] = [];
  const base = { exerciseId: s.exerciseId, side: s.side, setLogId: s.setLogId, sessionId: s.sessionId };

  // (1) load PR — yalnızca aynı ölçekte karşılaştırılabiliyorsa
  if (eff != null) {
    const best = current.loadPr;
    const scaleOk = !best?.raw || comparable(s.raw, best.raw, ex);
    if (best == null || (scaleOk && eff > best.effectiveLoad)) {
      out.push({ ...base, prType: 'loadPr', effectiveLoad: eff, reps: s.reps, isEstimate: false });
    }
  }

  // (2) rep PR at same load
  if (eff != null) {
    const prev = current.repsAtLoad?.get(eff);
    if (prev != null && s.reps > prev) {
      out.push({ ...base, prType: 'repPrAtLoad', effectiveLoad: eff, reps: s.reps, isEstimate: false });
    }
  } else {
    const prev = current.bestRepsNoScale;
    if (prev != null && s.reps > prev) {
      out.push({ ...base, prType: 'repPrAtLoad', effectiveLoad: null, reps: s.reps, isEstimate: false });
    }
  }

  // (3) tahmini performans (Epley) — her zaman "tahmin" etiketiyle (R123.4)
  const e1rm = estimate1rm(s.raw, s.reps, ex);
  if (e1rm != null && (current.estimated1rm == null || e1rm > current.estimated1rm)) {
    out.push({ ...base, prType: 'estimatedPerformancePr', estimated1rm: e1rm, reps: s.reps, isEstimate: true });
  }
  return out;
}

export function estimate1rm(raw: RawLoad, reps: number, ex: Exercise): number | null {
  if (!E1RM_TYPES.has(ex.loadProgressionType)) return null;         // ordinal türlerde anlamsız
  if (reps > EPLEY_MAX_REPS || reps <= 0) return null;              // yüksek tekrarda güvenilmez
  if (BODYWEIGHT_DEPENDENT.has(ex.loadProgressionType) && raw.bodyweightKgSnapshot == null) return null;
  const eff = effectiveLoad(raw, ex);
  if (eff == null || eff <= 0) return null;
  return round2(eff * (1 + reps / 30));
}

/** Oturum sonunda; effectiveLoad'ı olmayan hareketler hacme katılmaz (§7.2). */
export function detectSessionVolumePr(
  sessionId: string,
  sets: Array<{ set: PrCandidateSet; exercise: Exercise }>,
  currentBest: number | null,
): { pr: PersonalRecordDraft | null; volume: number; excludedExerciseIds: string[] } {
  let volume = 0;
  const excluded = new Set<string>();
  for (const { set, exercise } of sets) {
    if (!isPrCandidate(set)) continue;
    const eff = effectiveLoad(set.raw, exercise);
    if (eff == null || eff <= 0) { excluded.add(set.exerciseId); continue; }
    volume += eff * set.reps;
  }
  volume = round2(volume);
  const pr = currentBest != null && volume <= currentBest ? null : {
    prType: 'sessionVolumePr' as const, exerciseId: null, side: 'both' as Side,
    sessionId, sessionVolume: volume, isEstimate: false,
  };
  return { pr, volume, excludedExerciseIds: [...excluded] };
}
