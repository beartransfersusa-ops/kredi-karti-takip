// Hacim korkulukları — docs/v90/04-domain-engines.md §6, 02 §9.3.
// Sınırsız hacim eklenmez: haftada kas başına en fazla +1–2 set, tavan aşılamaz,
// ve öneri yalnızca toparlanma İYİ BİLİNİYORken üretilir (R105.1–R105.5).

import type { DateKey, MuscleGroup, Recommendation } from '../types.ts';

export const RECOVERY_RULES = {
  windowDays: 7, minDaysPerSignal: 3,
  sorenessOkMaxMean: 3.5, energyOkMinMean: 2.5, sleepOkRatio: 0.85,
} as const;
export const GUARDRAIL_RULES = { defaultDelta: 1, maxDeltaPerWeek: 2 } as const;

export type RecoveryStatus = 'ok' | 'poor' | 'unknown';
export type PerformanceTrend = 'up' | 'stable' | 'down' | 'unknown';

export interface RecoveryInput {
  checkIns: ReadonlyArray<{ localDateKey: DateKey; soreness: number | null; energy: number | null }>;
  sleepLogs: ReadonlyArray<{ localDateKey: DateKey; durationMinutes: number | null }>;
  sleepTargetHours: number | null;
}

export interface RecoveryAssessment {
  status: RecoveryStatus;
  soreness: RecoveryStatus;
  energy: RecoveryStatus;
  sleep: RecoveryStatus;
}

/** Üç durumlu: eksik veri "iyi" de "kötü" de sayılmaz (R119.3, R123.1). */
export function assessRecovery(i: RecoveryInput): RecoveryAssessment {
  const signal = (values: number[], ok: (mean: number) => boolean): RecoveryStatus => {
    if (values.length < RECOVERY_RULES.minDaysPerSignal) return 'unknown';
    return ok(values.reduce((a, b) => a + b, 0) / values.length) ? 'ok' : 'poor';
  };
  const soreness = signal(i.checkIns.flatMap((c) => (c.soreness == null ? [] : [c.soreness])),
    (m) => m <= RECOVERY_RULES.sorenessOkMaxMean);
  const energy = signal(i.checkIns.flatMap((c) => (c.energy == null ? [] : [c.energy])),
    (m) => m >= RECOVERY_RULES.energyOkMinMean);
  const targetMinutes = i.sleepTargetHours == null ? null : i.sleepTargetHours * 60;
  const sleep: RecoveryStatus = targetMinutes == null ? 'unknown'
    : signal(i.sleepLogs.flatMap((s) => (s.durationMinutes == null ? [] : [s.durationMinutes])),
      (m) => m >= RECOVERY_RULES.sleepOkRatio * targetMinutes);

  const all = [soreness, energy, sleep];
  const status: RecoveryStatus = all.includes('poor') ? 'poor' : all.includes('unknown') ? 'unknown' : 'ok';
  return { status, soreness, energy, sleep };
}

export interface MuscleVolumeTarget {
  muscle: MuscleGroup;
  baselineWeeklyDirectSets: number;
  maxRecommendedWeeklySets: number;
  isPriority: boolean;
}

export interface PriorRecommendation {
  targetWeekStartKey: DateKey;
  proposedSets: number;
  decision: 'accepted' | 'modified' | 'ignored' | null;
}

export interface VolumeGuardrailInput {
  target: MuscleVolumeTarget;
  currentWeeklySets: number;
  recovery: RecoveryAssessment;
  trend: PerformanceTrend;
  targetWeekStartKey: DateKey;
  referenceWeekStartKey: DateKey;
  prior?: readonly PriorRecommendation[];
  /** Bu hafta bu kas için zaten öneri üretildi mi (haftada tek öneri, R105.4). */
  alreadyRecommendedThisWeek?: boolean;
}

export type GuardrailReason =
  | 'notPriority' | 'recoveryNotOk' | 'trendDown' | 'atMax' | 'alreadyRecommended' | 'belowBaseline';

export type VolumeGuardrailResult =
  | { outcome: 'none'; reason: GuardrailReason; detailTr: string }
  | { outcome: 'recommend'; delta: 1 | 2; proposedSets: number; recommendation: Recommendation };

export function evaluate(i: VolumeGuardrailInput): VolumeGuardrailResult {
  const t = i.target;
  const none = (reason: GuardrailReason, detailTr: string): VolumeGuardrailResult =>
    ({ outcome: 'none', reason, detailTr });

  if (!t.isPriority) return none('notPriority', 'Bu kas için otomatik hacim önerisi üretilmiyor.');
  if (i.alreadyRecommendedThisWeek) return none('alreadyRecommended', 'Bu hafta bu kas için zaten bir öneri var.');
  if (i.recovery.status !== 'ok') {
    return none('recoveryNotOk', i.recovery.status === 'poor'
      ? 'Toparlanma göstergelerin düşük; bu hafta set eklemiyoruz.'
      : 'Toparlanma verisi yeterli değil; öneri için check-in ve uyku kaydı gerekiyor.');
  }
  if (i.trend === 'down' || i.trend === 'unknown') {
    return none('trendDown', 'Gym performansın bu hafta yükselmiyor; önce mevcut hacmi oturtalım.');
  }
  if (i.currentWeeklySets < t.baselineWeeklyDirectSets) {
    return none('belowBaseline', `Bu hafta ${i.currentWeeklySets} direkt set yaptın; önce program hacmine (${t.baselineWeeklyDirectSets}) dönelim.`);
  }
  const headroom = t.maxRecommendedWeeklySets - i.currentWeeklySets;
  if (headroom <= 0) {
    return none('atMax', `Bu kas için üst sınıra (${t.maxRecommendedWeeklySets} set) ulaştın.`);
  }

  const prevWeek = i.prior?.find((p) => p.targetWeekStartKey === i.referenceWeekStartKey);
  const escalate = i.trend === 'up' && prevWeek?.decision === 'accepted'
    && i.currentWeeklySets >= prevWeek.proposedSets;
  const delta = Math.min(escalate ? 2 : GUARDRAIL_RULES.defaultDelta, headroom, GUARDRAIL_RULES.maxDeltaPerWeek) as 1 | 2;
  const proposedSets = i.currentWeeklySets + delta;

  return {
    outcome: 'recommend', delta, proposedSets,
    recommendation: {
      kind: 'volumeIncrease', muscle: t.muscle,
      proposed: { sets: proposedSets },
      rationaleTr: `Toparlanma göstergelerin iyi ve gym performansın ${i.trend === 'up' ? 'yükseliyor' : 'stabil'}. `
        + `Bu hafta için +${delta} set (${proposedSets}) öneriyoruz. `
        + `Otomatik öneri sınırı haftada en fazla +2 set; bu kas için üst sınır ${t.maxRecommendedWeeklySets} set.`,
      evidence: { metrics: { currentWeeklySets: i.currentWeeklySets, proposedSets, delta, max: t.maxRecommendedWeeklySets } },
      isEstimate: false,
    },
  };
}
