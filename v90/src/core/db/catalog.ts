// Hareket kataloğu okuma — docs/v90/02-architecture.md §3.
//
// Katalog nadiren değişir ve her set girişinde gerekir; bu yüzden bir kez
// okunup bellekte tutulur. `reload()` yalnızca ekipman/özel hareket
// değişikliğinden sonra çağrılır.
import type { Exercise, ExerciseRelation } from '../../domain/types.ts';
import type { Db, Tx } from './types.ts';

interface ExerciseRow {
  id: string; name: string; name_tr: string; primary_muscle: string;
  secondary_muscles_json: string; movement_pattern: string; equipment_json: string;
  lengthened_bias: number; skill_level: string; joint_stress_json: string;
  load_progression_type: string; is_unilateral: number; volume_multiplier: number;
  default_increment_kg: number | null; available_loads_json: string | null; cues_json: string;
}

const toExercise = (r: ExerciseRow): Exercise => ({
  id: r.id,
  name: r.name,
  nameTr: r.name_tr,
  primaryMuscle: r.primary_muscle as Exercise['primaryMuscle'],
  secondaryMuscles: JSON.parse(r.secondary_muscles_json) as Exercise['secondaryMuscles'],
  movementPattern: r.movement_pattern as Exercise['movementPattern'],
  equipment: JSON.parse(r.equipment_json) as Exercise['equipment'],
  lengthenedBias: r.lengthened_bias as Exercise['lengthenedBias'],
  skillLevel: r.skill_level as Exercise['skillLevel'],
  jointStressProfile: JSON.parse(r.joint_stress_json) as Exercise['jointStressProfile'],
  loadProgressionType: r.load_progression_type as Exercise['loadProgressionType'],
  isUnilateral: r.is_unilateral === 1,
  volumeMultiplier: 1,
  defaultIncrementKg: r.default_increment_kg,
  availableLoadsKg: r.available_loads_json ? (JSON.parse(r.available_loads_json) as number[]) : null,
  cues: JSON.parse(r.cues_json) as string[],
});

export async function readCatalog(tx: Tx): Promise<Map<string, Exercise>> {
  // Silinmiş hareketler de okunur: geçmiş set'ler onlara referans verir ve
  // ekranda adının görünmesi gerekir. Seçim listeleri ayrıca filtreler.
  const rows = await tx.all<ExerciseRow>('SELECT * FROM exercises ORDER BY name_tr');
  return new Map(rows.map((r) => [r.id, toExercise(r)]));
}

export async function readRelations(tx: Tx): Promise<ExerciseRelation[]> {
  const rows = await tx.all<{ exercise_id: string; related_exercise_id: string; relation: string; priority: number }>(
    'SELECT exercise_id, related_exercise_id, relation, priority FROM exercise_relations');
  return rows.map((r) => ({
    exerciseId: r.exercise_id,
    relatedExerciseId: r.related_exercise_id,
    relation: r.relation as ExerciseRelation['relation'],
    priority: r.priority,
  }));
}

/** Seçilebilir hareketler: silinmemiş olanlar (02 §8.2 `ExerciseCatalog`). */
export const selectable = (catalog: ReadonlyMap<string, Exercise>, deletedIds: ReadonlySet<string>): Exercise[] =>
  [...catalog.values()].filter((e) => !deletedIds.has(e.id));

export async function readDeletedIds(tx: Tx): Promise<Set<string>> {
  const rows = await tx.all<{ id: string }>('SELECT id FROM exercises WHERE is_deleted = 1');
  return new Set(rows.map((r) => r.id));
}

export class CatalogCache {
  #byId: Map<string, Exercise> | null = null;
  #relations: ExerciseRelation[] = [];
  #deleted: Set<string> = new Set();
  readonly #db: Db;

  constructor(db: Db) { this.#db = db; }

  async all(): Promise<ReadonlyMap<string, Exercise>> {
    if (!this.#byId) await this.reload();
    return this.#byId!;
  }
  async relations(): Promise<readonly ExerciseRelation[]> {
    if (!this.#byId) await this.reload();
    return this.#relations;
  }
  async selectable(): Promise<Exercise[]> {
    return selectable(await this.all(), this.#deleted);
  }
  async reload(): Promise<void> {
    await this.#db.withTransaction(async (tx) => {
      this.#byId = await readCatalog(tx);
      this.#relations = await readRelations(tx);
      this.#deleted = await readDeletedIds(tx);
    });
  }
}
