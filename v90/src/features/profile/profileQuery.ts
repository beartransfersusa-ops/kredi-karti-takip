// Profil okuma — docs/v90/03-data-model.md §1 (`training_profiles`, `equipment_profiles`).
//
// Bu değerler `settings` tablosunda DEĞİL, kendi tablolarındadır. Tek yerden
// okunur ki ekipman/ağrı/tercih bilgisi iki kaynağa bölünmesin.
import type { EquipmentTag, Joint, SkillLevel } from '../../domain/types.ts';
import type { Tx } from '../../core/db/types.ts';

export type GymType = 'fullCommercialGym' | 'homeGym' | 'limitedGym';

export interface TrainingProfile {
  profileId: string;
  experience: SkillLevel;
  gymType: GymType;
  typicalWorkoutMinutes: number | null;
  preferredWorkoutDays: number[];
  sleepTargetHours: number | null;
  painAreas: Joint[];
}

export interface EquipmentProfile {
  id: string;
  preset: GymType | 'custom';
  available: EquipmentTag[];
}

interface TrainingRow {
  profile_id: string; experience: string; gym_type: string;
  typical_workout_minutes: number | null; preferred_workout_days_json: string;
  sleep_target_hours: number | null; pain_areas_json: string;
}

export async function readTrainingProfile(tx: Tx): Promise<TrainingProfile | null> {
  const r = await tx.get<TrainingRow>('SELECT * FROM training_profiles LIMIT 1');
  if (!r) return null;
  return {
    profileId: r.profile_id,
    experience: r.experience as SkillLevel,
    gymType: r.gym_type as GymType,
    typicalWorkoutMinutes: r.typical_workout_minutes,
    preferredWorkoutDays: JSON.parse(r.preferred_workout_days_json) as number[],
    sleepTargetHours: r.sleep_target_hours,
    painAreas: JSON.parse(r.pain_areas_json) as Joint[],
  };
}

export async function readEquipmentProfile(tx: Tx): Promise<EquipmentProfile | null> {
  const r = await tx.get<{ id: string; preset: string; available_json: string }>(
    'SELECT id, preset, available_json FROM equipment_profiles LIMIT 1');
  if (!r) return null;
  return {
    id: r.id,
    preset: r.preset as EquipmentProfile['preset'],
    available: JSON.parse(r.available_json) as EquipmentTag[],
  };
}

/** Tercih edilen günler; profil yoksa boş = her gün uygun. */
export async function preferredWorkoutDays(tx: Tx): Promise<number[]> {
  return (await readTrainingProfile(tx))?.preferredWorkoutDays ?? [];
}
