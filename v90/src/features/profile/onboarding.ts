// Onboarding adım makinesi — docs/v90/06-ux-flows.md B.1–B.4.
//
// Yarım kalmış onboarding DB'den devam eder: hiçbir adım iki kez sorulmaz
// (B.1 "Yarım kalmış" durumu). Bu yüzden "kaldığım adım" bellekte değil,
// yazılmış satırlardan TÜRETİLİR.
import type { Tx } from '../../core/db/types.ts';
import { readEquipmentProfile, readTrainingProfile } from './profileQuery.ts';

export type OnboardingStep =
  | 'training'        // B.1 — deneyim, salon, süre, günler, uyku, ağrı
  | 'initialValues'   // B.2 — başlangıç antropometrisi
  | 'biceps'          // B.3 — bükülü üst kol
  | 'equipment'       // B.4 — ekipman profili
  | 'done';

export const STEP_ORDER: readonly OnboardingStep[] = ['training', 'initialValues', 'biceps', 'equipment', 'done'];

export interface OnboardingState {
  profileId: string | null;
  step: OnboardingStep;
  completed: boolean;
  /** B.2 bir daha gösterilmez: seedInitialProfile bir kez çalışır. */
  initialValuesSeeded: boolean;
  bicepsRecorded: boolean;
  gymType: 'fullCommercialGym' | 'homeGym' | 'limitedGym' | null;
}

export async function readOnboardingState(tx: Tx): Promise<OnboardingState> {
  const profile = await tx.get<{ id: string; onboarding_completed: number }>(
    'SELECT id, onboarding_completed FROM profiles LIMIT 1');
  const training = await readTrainingProfile(tx);
  const equipment = await readEquipmentProfile(tx);

  const seeded = (await tx.get<{ n: number }>(
    `SELECT COUNT(*) n FROM body_measurements WHERE note = 'onboarding'`))?.n ?? 0;
  const biceps = (await tx.get<{ n: number }>(
    `SELECT COUNT(*) n FROM body_measurements
     WHERE site IN ('bicepsFlexed','bicepsLeftFlexed','bicepsRightFlexed')`))?.n ?? 0;

  const state: OnboardingState = {
    profileId: profile?.id ?? null,
    completed: profile?.onboarding_completed === 1,
    initialValuesSeeded: seeded > 0,
    bicepsRecorded: biceps > 0,
    gymType: training?.gymType ?? null,
    step: 'training',
  };

  if (state.completed) state.step = 'done';
  else if (!training) state.step = 'training';
  else if (!state.initialValuesSeeded) state.step = 'initialValues';
  else if (!state.bicepsRecorded && !equipment) state.step = 'biceps';
  else if (!equipment) state.step = 'equipment';
  else state.step = 'done';

  return state;
}

export function nextStep(step: OnboardingStep): OnboardingStep {
  const i = STEP_ORDER.indexOf(step);
  return STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)]!;
}

export function stepNumber(step: OnboardingStep): { index: number; total: number } {
  return { index: Math.max(1, STEP_ORDER.indexOf(step) + 1), total: STEP_ORDER.length - 1 };
}

/** 0 girilemez: ölçülmemiş değer NULL'dır (R119.3, R119.4). */
export type CmValidation = { ok: true; value: number | null } | { ok: false; messageKey: 'validation.zeroNotAllowed' | 'validation.outOfRange.cm' };

export function validateCm(raw: number | null): CmValidation {
  if (raw === null) return { ok: true, value: null };
  if (raw === 0) return { ok: false, messageKey: 'validation.zeroNotAllowed' };
  if (!Number.isFinite(raw) || raw < 1 || raw >= 300) return { ok: false, messageKey: 'validation.outOfRange.cm' };
  return { ok: true, value: raw };
}

export type KgValidation = { ok: true; value: number | null } | { ok: false; messageKey: 'validation.zeroNotAllowed' | 'validation.outOfRange.kg' };

export function validateKg(raw: number | null): KgValidation {
  if (raw === null) return { ok: true, value: null };
  if (raw === 0) return { ok: false, messageKey: 'validation.zeroNotAllowed' };
  if (!Number.isFinite(raw) || raw < 1 || raw > 400) return { ok: false, messageKey: 'validation.outOfRange.kg' };
  return { ok: true, value: raw };
}
