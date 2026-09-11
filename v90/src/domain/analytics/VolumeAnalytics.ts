// Hacim analitiği — docs/v90/04-domain-engines.md §6, 02 §9.4.
// Ana görünüm DIRECT setlerdir; compound hareketlerin dolaylı katkısı ayrı ve
// "tahmin" etiketiyle sunulur (R106.2–R106.4).

import type { DateKey, Exercise, MuscleGroup, Side } from '../types.ts';

export const SECONDARY_CONTRIBUTION_FACTOR = 0.5;   // R106.3: "1 tam set" kesinliği yok

export interface WorkingSetRow {
  sessionExerciseId: string;
  setIndex: number;
  exerciseId: string;
  side: Side;
  calendarDateKey: DateKey;
}

export interface MuscleVolume {
  muscle: MuscleGroup;
  directSets: number;
  secondarySetsEstimate: number;
  isEstimate: true;
}

/**
 * Unilateral çift sayım koruması (R102.4): bir set, taraf başına ayrı loglansa
 * bile (sessionExerciseId, setIndex) çiftiyle TEK sayılır.
 */
export function weeklyByMuscle(
  rows: readonly WorkingSetRow[], catalog: ReadonlyMap<string, Exercise>,
): MuscleVolume[] {
  const direct = new Map<MuscleGroup, Set<string>>();
  const secondary = new Map<MuscleGroup, Set<string>>();
  for (const r of rows) {
    const ex = catalog.get(r.exerciseId);
    if (!ex) continue;
    const unit = `${r.sessionExerciseId}:${r.setIndex}`;
    add(direct, ex.primaryMuscle, unit);
    for (const m of ex.secondaryMuscles) add(secondary, m, unit);
  }
  const muscles = new Set<MuscleGroup>([...direct.keys(), ...secondary.keys()]);
  return [...muscles].sort().map((muscle) => ({
    muscle,
    directSets: direct.get(muscle)?.size ?? 0,
    secondarySetsEstimate: Math.round((secondary.get(muscle)?.size ?? 0) * SECONDARY_CONTRIBUTION_FACTOR * 10) / 10,
    isEstimate: true as const,
  }));
}

/** R106.1 "Lats/Back" gibi birleşik satırlar SUNUM katmanındadır. */
export const MUSCLE_DISPLAY_GROUPS: ReadonlyArray<{ labelTr: string; muscles: MuscleGroup[] }> = [
  { labelTr: 'Sırt', muscles: ['lats', 'upperBack'] },
];

function add(map: Map<MuscleGroup, Set<string>>, key: MuscleGroup, unit: string): void {
  const s = map.get(key) ?? new Set<string>();
  s.add(unit);
  map.set(key, s);
}
