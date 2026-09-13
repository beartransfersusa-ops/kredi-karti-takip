// Seed kurulumu — docs/v90/03-data-model.md §1, 02-architecture.md §12.1.
//
// Katalog ve program şablonu KULLANICI VERİSİ DEĞİLDİR: belgeden üretilmiş
// JSON dosyalarından gelir (scripts/extract-seed.py). Bu yüzden migration
// içinde değil, migration'dan sonra ayrı bir adımda kurulur ve her açılışta
// idempotent olarak tazelenir:
//
//   • yeni sürüm yeni hareket eklediyse INSERT edilir,
//   • metin/ipucu düzeltmesi UPDATE edilir,
//   • kullanıcının kendi eklediği hareket (`is_custom=1`) ASLA dokunulmaz,
//   • silinen seed hareketi `is_deleted=1` yapılır — satır durur, çünkü
//     geçmiş `set_logs` ona referans verir.
//
// Tek transaction: yarım kurulmuş katalog oluşmaz.

import type { Tx } from './types.ts';

export interface SeedExercise {
  id: string; name: string; nameTr: string; primaryMuscle: string;
  secondaryMuscles: string[]; movementPattern: string; equipment: string[];
  lengthenedBias: number; skillLevel: string;
  jointStressProfile: Record<string, number>; loadProgressionType: string;
  isUnilateral: boolean; volumeMultiplier: number; defaultIncrementKg: number;
  cues: string[];
}
export interface SeedRelation {
  exerciseId: string; relatedExerciseId: string; relation: string; priority: number;
}
export interface SeedTemplateExercise {
  orderIndex: number; exerciseId: string; workingSets: number; warmupSets: number;
  repMin: number; repMax: number; targetRir: number; restSeconds: number;
}
export interface SeedWorkoutTemplate {
  id: string; sequenceOrder: number; name: string; nameTr: string;
  estimatedMinutes: number; exercises: SeedTemplateExercise[];
}
export interface SeedProgram {
  id: string; name: string; version: number; isCyclic: boolean;
  durationDays: number; workoutTemplates: SeedWorkoutTemplate[];
}
export interface SeedTarget {
  muscle: string; baselineWeeklyDirectSets: number;
  maxRecommendedWeeklySets: number; isPriority: boolean;
}

export interface SeedBundle {
  seedVersion: number;
  exercises: readonly SeedExercise[];
  relations: readonly SeedRelation[];
  program: SeedProgram;
  targets: readonly SeedTarget[];
}

export interface SeedResult {
  insertedExercises: number; updatedExercises: number; softDeletedExercises: number;
  relations: number; workoutTemplates: number; targets: number;
  skipped: boolean;
}

const SEED_VERSION_KEY = 'seed.version';

/** Kurulu seed sürümü bundle'dan eskiyse yeniler; aynıysa hiç dokunmaz. */
export async function installSeed(tx: Tx, bundle: SeedBundle, nowUtc: string): Promise<SeedResult> {
  const empty: SeedResult = {
    insertedExercises: 0, updatedExercises: 0, softDeletedExercises: 0,
    relations: 0, workoutTemplates: 0, targets: 0, skipped: true,
  };

  const current = await tx.get<{ value_json: string }>(
    'SELECT value_json FROM settings WHERE key = ?', [SEED_VERSION_KEY]);
  const installed = current ? (JSON.parse(current.value_json) as number) : 0;
  if (installed === bundle.seedVersion) return empty;

  const r: SeedResult = { ...empty, skipped: false };

  // ------------------------------------------------------------ hareketler
  const existing = new Map<string, { is_custom: number }>();
  for (const row of await tx.all<{ id: string; is_custom: number }>(
    'SELECT id, is_custom FROM exercises')) existing.set(row.id, row);

  const seedIds = new Set<string>();
  for (const e of bundle.exercises) {
    seedIds.add(e.id);
    const prev = existing.get(e.id);
    const args = [
      e.name, e.nameTr, e.primaryMuscle, JSON.stringify(e.secondaryMuscles),
      e.movementPattern, JSON.stringify(e.equipment), e.lengthenedBias, e.skillLevel,
      JSON.stringify(e.jointStressProfile), e.loadProgressionType, e.isUnilateral ? 1 : 0,
      e.volumeMultiplier, e.defaultIncrementKg, JSON.stringify(e.cues), bundle.seedVersion, nowUtc,
    ];
    if (!prev) {
      await tx.exec(
        `INSERT INTO exercises
           (name, name_tr, primary_muscle, secondary_muscles_json, movement_pattern, equipment_json,
            lengthened_bias, skill_level, joint_stress_json, load_progression_type, is_unilateral,
            volume_multiplier, default_increment_kg, cues_json, seed_version, updated_at_utc,
            id, is_custom, is_deleted, created_at_utc)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?)`,
        [...args, e.id, nowUtc]);
      r.insertedExercises++;
    } else if (prev.is_custom === 0) {
      // Kullanıcının özel hareketi değilse belge kazanır.
      await tx.exec(
        `UPDATE exercises SET
           name=?, name_tr=?, primary_muscle=?, secondary_muscles_json=?, movement_pattern=?,
           equipment_json=?, lengthened_bias=?, skill_level=?, joint_stress_json=?,
           load_progression_type=?, is_unilateral=?, volume_multiplier=?, default_increment_kg=?,
           cues_json=?, seed_version=?, updated_at_utc=?, is_deleted=0
         WHERE id = ?`, [...args, e.id]);
      r.updatedExercises++;
    }
  }

  // Seed'den düşen hareketler silinmez; işaretlenir (geçmiş referansları durur).
  for (const [id, row] of existing) {
    if (row.is_custom === 0 && !seedIds.has(id)) {
      await tx.exec('UPDATE exercises SET is_deleted = 1, updated_at_utc = ? WHERE id = ?', [nowUtc, id]);
      r.softDeletedExercises++;
    }
  }

  // ------------------------------------------------------------- ilişkiler
  // İlişkiler türetilmiş veridir; tamamen yeniden kurulur.
  await tx.exec('DELETE FROM exercise_relations');
  for (const [i, rel] of bundle.relations.entries()) {
    await tx.exec(
      `INSERT INTO exercise_relations (id, exercise_id, related_exercise_id, relation, priority)
       VALUES (?,?,?,?,?)`,
      [`rel-${String(i).padStart(3, '0')}`, rel.exerciseId, rel.relatedExerciseId, rel.relation, rel.priority]);
    r.relations++;
  }

  // -------------------------------------------------------------- program
  const p = bundle.program;
  await tx.exec(
    `INSERT INTO program_templates (id, name, version, is_cyclic, created_at_utc)
     VALUES (?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, version = excluded.version,
       is_cyclic = excluded.is_cyclic`,
    [p.id, p.name, p.version, p.isCyclic ? 1 : 0, nowUtc]);

  for (const t of p.workoutTemplates) {
    await tx.exec(
      `INSERT INTO workout_templates
         (id, program_template_id, sequence_order, name, name_tr, estimated_minutes)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET sequence_order = excluded.sequence_order,
         name = excluded.name, name_tr = excluded.name_tr,
         estimated_minutes = excluded.estimated_minutes`,
      [t.id, p.id, t.sequenceOrder, t.name, t.nameTr, t.estimatedMinutes]);
    r.workoutTemplates++;

    for (const e of t.exercises) {
      // `is_customized=1` satırlar kullanıcının şablon düzenlemesidir; korunur.
      await tx.exec(
        `INSERT INTO template_exercises
           (id, workout_template_id, order_index, exercise_id, working_sets, warmup_sets,
            rep_min, rep_max, target_rir, rest_seconds, is_customized)
         VALUES (?,?,?,?,?,?,?,?,?,?,0)
         ON CONFLICT(id) DO UPDATE SET
           order_index = excluded.order_index, exercise_id = excluded.exercise_id,
           working_sets = excluded.working_sets, warmup_sets = excluded.warmup_sets,
           rep_min = excluded.rep_min, rep_max = excluded.rep_max,
           target_rir = excluded.target_rir, rest_seconds = excluded.rest_seconds
         WHERE template_exercises.is_customized = 0`,
        [`${t.id}-${e.orderIndex}`, t.id, e.orderIndex, e.exerciseId, e.workingSets,
          e.warmupSets, e.repMin, e.repMax, e.targetRir, e.restSeconds]);
    }
  }

  // --------------------------------------------------------- hacim hedefi
  for (const target of bundle.targets) {
    await tx.exec(
      `INSERT INTO muscle_volume_targets
         (muscle, baseline_weekly_direct_sets, max_recommended_weekly_sets, is_priority, updated_at_utc)
       VALUES (?,?,?,?,?)
       ON CONFLICT(muscle) DO UPDATE SET
         baseline_weekly_direct_sets = excluded.baseline_weekly_direct_sets,
         max_recommended_weekly_sets = excluded.max_recommended_weekly_sets,
         is_priority = excluded.is_priority, updated_at_utc = excluded.updated_at_utc`,
      [target.muscle, target.baselineWeeklyDirectSets, target.maxRecommendedWeeklySets,
        target.isPriority ? 1 : 0, nowUtc]);
    r.targets++;
  }

  await tx.exec(
    `INSERT INTO settings (key, value_json, updated_at_utc) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at_utc = excluded.updated_at_utc`,
    [SEED_VERSION_KEY, JSON.stringify(bundle.seedVersion), nowUtc]);

  return r;
}
