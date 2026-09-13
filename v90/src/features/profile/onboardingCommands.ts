// Onboarding yazmaları — docs/v90/06-ux-flows.md B.1–B.4.
//
// Her adım TEK transaction'da yazılır; yarım kalan adım DB'ye yansımaz.
// Bilinmeyen değer NULL yazılır, 0 ASLA yazılmaz (R119.3).
import type { Clock } from '../../core/clock/dateKey.ts';
import type { Tx } from '../../core/db/types.ts';
import type { EquipmentTag, Joint, SkillLevel } from '../../domain/types.ts';
import type { GymType } from './profileQuery.ts';

export interface TrainingProfileInput {
  experience: SkillLevel;
  gymType: GymType;
  typicalWorkoutMinutes: number | null;
  preferredWorkoutDays: number[];
  sleepTargetHours: number | null;
  painAreas: Joint[];
}

/** `profiles` satırı yoksa oluşturur ve id'sini döndürür. */
export async function ensureProfile(tx: Tx, clock: Clock, newId: () => string): Promise<string> {
  const existing = await tx.get<{ id: string }>('SELECT id FROM profiles LIMIT 1');
  if (existing) return existing.id;
  const now = clock.nowUtc().toISOString();
  const id = newId();
  await tx.exec(
    `INSERT INTO profiles (id, created_at_utc, updated_at_utc, onboarding_completed)
     VALUES (?,?,?,0)`, [id, now, now]);
  return id;
}

export async function saveTrainingProfile(
  tx: Tx, clock: Clock, newId: () => string, input: TrainingProfileInput,
): Promise<void> {
  const profileId = await ensureProfile(tx, clock, newId);
  const now = clock.nowUtc().toISOString();
  await tx.exec(
    `INSERT INTO training_profiles
       (profile_id, experience, gym_type, typical_workout_minutes,
        preferred_workout_days_json, sleep_target_hours, pain_areas_json, updated_at_utc)
     VALUES (?,?,?,?,?,?,?,?)
     ON CONFLICT(profile_id) DO UPDATE SET
       experience = excluded.experience, gym_type = excluded.gym_type,
       typical_workout_minutes = excluded.typical_workout_minutes,
       preferred_workout_days_json = excluded.preferred_workout_days_json,
       sleep_target_hours = excluded.sleep_target_hours,
       pain_areas_json = excluded.pain_areas_json, updated_at_utc = excluded.updated_at_utc`,
    [profileId, input.experience, input.gymType, input.typicalWorkoutMinutes,
      JSON.stringify(input.preferredWorkoutDays), input.sleepTargetHours,
      JSON.stringify(input.painAreas), now]);
}

export interface NutritionTargetInput {
  kcal: number; proteinG: number; carbG: number; fatG: number; rationaleTr: string;
}

export interface InitialValuesInput {
  heightCm: number | null;
  weightKg: number | null;
  /** site → cm; `null` olan alan YAZILMAZ. */
  measurementsCm: Partial<Record<'waist' | 'abdomen' | 'shoulder' | 'hip' | 'chest' | 'forearm', number | null>>;
  /**
   * §42–§44 başlangıç hedefi (data/initial-profile.json'dan gelir). Kullanıcı
   * ölçümü değil, programın tahminidir; R41.3 gereği "başlangıç tahmini" olarak
   * gerekçesiyle yazılır ve sonradan değiştirilebilir (R42.4).
   */
  nutritionTarget?: NutritionTargetInput;
}

/**
 * `seedInitialProfile()` (02 §11.3) — yalnızca ilk çalıştırma ve kullanıcı
 * onayıyla. Boy `profiles`'a, kilo `weight_logs`'a, cm değerleri
 * `body_measurements`'a (`is_baseline = 1`) yazılır.
 */
export async function saveInitialValues(
  tx: Tx, clock: Clock, newId: () => string, input: InitialValuesInput,
): Promise<void> {
  const profileId = await ensureProfile(tx, clock, newId);
  const now = clock.nowUtc().toISOString();
  const todayKey = clock.todayKey();
  const tz = clock.timeZone();

  if (input.heightCm !== null) {
    await tx.exec('UPDATE profiles SET height_cm = ?, updated_at_utc = ? WHERE id = ?',
      [input.heightCm, now, profileId]);
  }

  if (input.weightKg !== null) {
    await tx.exec(
      `INSERT INTO weight_logs (id, measured_at_utc, local_date_key, time_zone, weight_kg, note)
       VALUES (?,?,?,?,?,'onboarding')`,
      [newId(), now, todayKey, tz, input.weightKg]);
  }

  for (const [site, value] of Object.entries(input.measurementsCm)) {
    // Boş bırakılan alan yazılmaz — "bilinmiyor" 0 değildir (R119.3).
    if (value === null || value === undefined) continue;
    const measurementId = newId();
    await tx.exec(
      `INSERT INTO body_measurements
         (id, measured_at_utc, local_date_key, time_zone, site, final_value_cm,
          aggregation, is_baseline, note)
       VALUES (?,?,?,?,?,?,'single',1,'onboarding')`,
      [measurementId, now, todayKey, tz, site, value]);
    await tx.exec(
      `INSERT INTO measurement_samples (id, measurement_id, sample_index, value_cm)
       VALUES (?,?,1,?)`, [newId(), measurementId, value]);
  }

  // Hedef zaten varsa (tekrar ziyaret) ÜZERİNE YAZILMAZ: nutrition_targets
  // tarihli geçmiştir (R42.4); ilk satır yalnızca bir kez yazılır.
  if (input.nutritionTarget) {
    const existing = await tx.get<{ id: string }>('SELECT id FROM nutrition_targets LIMIT 1');
    if (!existing) {
      const t = input.nutritionTarget;
      await tx.exec(
        `INSERT INTO nutrition_targets
           (id, effective_from_date_key, kcal, protein_g, carb_g, fat_g, rationale_tr, created_at_utc)
         VALUES (?,?,?,?,?,?,?,?)`,
        [newId(), todayKey, t.kcal, t.proteinG, t.carbG, t.fatG, t.rationaleTr, now]);
    }
  }
}

export interface BicepsInput {
  mode: 'separate' | 'single' | 'later';
  /** Her site için 1–3 ham örnek; final değer MeasurementQuality ile türetilir. */
  samples: Partial<Record<'bicepsFlexed' | 'bicepsLeftFlexed' | 'bicepsRightFlexed', number[]>>;
}

export async function saveBiceps(
  tx: Tx, clock: Clock, newId: () => string, input: BicepsInput,
  aggregate: (samples: number[]) => { finalCm: number; aggregation: 'single' | 'mean' | 'median' },
): Promise<void> {
  if (input.mode === 'later') return;                 // dashboard CTA'sı kalır (R96.4)
  const now = clock.nowUtc().toISOString();
  const todayKey = clock.todayKey();
  const tz = clock.timeZone();

  for (const [site, samples] of Object.entries(input.samples)) {
    if (!samples || samples.length === 0) continue;
    const { finalCm, aggregation } = aggregate(samples);
    const measurementId = newId();
    await tx.exec(
      `INSERT INTO body_measurements
         (id, measured_at_utc, local_date_key, time_zone, site, final_value_cm,
          aggregation, is_baseline, note)
       VALUES (?,?,?,?,?,?,?,1,'onboarding')`,
      [measurementId, now, todayKey, tz, site, finalCm, aggregation]);
    for (const [i, value] of samples.entries()) {
      await tx.exec(
        `INSERT INTO measurement_samples (id, measurement_id, sample_index, value_cm)
         VALUES (?,?,?,?)`, [newId(), measurementId, i + 1, value]);
    }
  }
}

/** B.4 son adım: ekipman profili + `onboarding_completed = 1`. */
export async function saveEquipmentAndFinish(
  tx: Tx, clock: Clock, newId: () => string,
  preset: GymType | 'custom', available: EquipmentTag[],
): Promise<void> {
  const profileId = await ensureProfile(tx, clock, newId);
  const now = clock.nowUtc().toISOString();
  const existing = await tx.get<{ id: string }>('SELECT id FROM equipment_profiles LIMIT 1');
  if (existing) {
    await tx.exec(
      'UPDATE equipment_profiles SET preset = ?, available_json = ?, updated_at_utc = ? WHERE id = ?',
      [preset, JSON.stringify(available), now, existing.id]);
  } else {
    await tx.exec(
      `INSERT INTO equipment_profiles (id, preset, available_json, updated_at_utc) VALUES (?,?,?,?)`,
      [newId(), preset, JSON.stringify(available), now]);
  }
  await tx.exec('UPDATE profiles SET onboarding_completed = 1, updated_at_utc = ? WHERE id = ?',
    [now, profileId]);
}

/** Onboarding bitince V90 programı açılır (Bölüm A'nın ön koşulu). */
export async function startProgram(
  tx: Tx, clock: Clock, newId: () => string, programTemplateId = 'v90',
): Promise<string> {
  const open = await tx.get<{ id: string }>(
    `SELECT id FROM programs WHERE status IN ('active','paused')`);
  if (open) return open.id;

  const template = await tx.get<{ id: string; name: string }>(
    'SELECT id, name FROM program_templates WHERE id = ?', [programTemplateId]);
  if (!template) throw new Error(`program şablonu yok: ${programTemplateId}`);

  const now = clock.nowUtc().toISOString();
  const id = newId();
  await tx.exec(
    `INSERT INTO programs
       (id, program_template_id, name, status, start_date_key, start_time_zone, calendar_mode,
        training_sequence_index, sequence_wraps, duration_days, created_at_utc, updated_at_utc)
     VALUES (?,?,?,'active',?,?,'strictCalendar',0,0,90,?,?)`,
    [id, template.id, template.name, clock.todayKey(), clock.timeZone(), now, now]);
  return id;
}
