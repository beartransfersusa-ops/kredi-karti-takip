import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Exercise, ExerciseRelation } from '../src/domain/types.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const seed = read('data/exercises.json') as { exercises: Exercise[]; relations: ExerciseRelation[] };
export const EXERCISES: Exercise[] = seed.exercises;
export const RELATIONS: ExerciseRelation[] = seed.relations;
export const BY_ID = new Map(EXERCISES.map((e) => [e.id, e]));

export function ex(id: string): Exercise {
  const e = BY_ID.get(id);
  if (!e) throw new Error(`seed'de yok: ${id}`);
  return e;
}

/** Seed'de olmayan tür kombinasyonları için sentetik hareket. */
export function fakeExercise(over: Partial<Exercise> & { id: string }): Exercise {
  return {
    name: over.id, nameTr: over.id, primaryMuscle: 'chest', secondaryMuscles: [],
    movementPattern: 'horizontalPush', equipment: ['cableStation'], lengthenedBias: 1,
    skillLevel: 'beginner', jointStressProfile: {}, loadProgressionType: 'externalLoadHigherIsHarder',
    isUnilateral: false, volumeMultiplier: 1, defaultIncrementKg: 2.5, cues: ['a', 'b', 'c'],
    ...over,
  } as Exercise;
}
