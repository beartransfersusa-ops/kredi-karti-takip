// Artış adımı çözümleme ve yuvarlama — docs/v90/04-domain-engines.md §3.2.2–§3.2.4.
// Amaç: salonda bulunmayan 83,2 kg gibi değerlerin ASLA önerilmemesi (R100.3, R100.4).

import type { EquipmentTag, Exercise } from '../types.ts';
import { round2 } from './LoadBehavior.ts';

/** R100.1: dumbbell 2 · machine 5 · cable 2.5 · barbell 2.5; kalanlar türetildi (§3.6). */
export const EQUIPMENT_DEFAULT_INCREMENT_KG: Readonly<Record<EquipmentTag, number>> = {
  dumbbells: 2, barbells: 2.5, cableStation: 2.5, latPulldown: 2.5, chestSupportedRow: 2.5,
  plateLoadedMachine: 2.5, selectorizedMachine: 5, smithMachine: 2.5, hackSquat: 5, legPress: 5,
  legExtension: 5, legCurl: 5, pecDeck: 5, preacherBench: 2.5, adjustableBench: 2.5,
  pullupBar: 2.5, dipStation: 2.5, assistedPullupMachine: 5, resistanceBands: 1, bodyweightOnly: 2.5,
};

export interface UserExerciseSettings {
  minIncrementKg?: number | null;
  availableLoadsKg?: number[] | null;
}

export interface IncrementSpec {
  incrementKg: number;
  availableLoads?: number[];
  source: 'user' | 'exercise' | 'equipment';
}

export interface RoundResult {
  value: number;
  /** Yuvarlama mevcut yükte kaldı: yük yerine tekrar hedefi artırılmalı (R100.5). */
  fallback?: 'repProgression';
  clamped?: 'max' | 'min';
}

export function resolveIncrement(ex: Exercise, user?: UserExerciseSettings | null): IncrementSpec {
  const loads = user?.availableLoadsKg ?? ex.availableLoadsKg ?? undefined;
  const availableLoads = loads && loads.length > 0 ? [...loads].sort((a, b) => a - b) : undefined;
  if (user?.minIncrementKg != null) {
    if (user.minIncrementKg <= 0) throw new Error('minIncrementKg > 0 olmalı');
    return { incrementKg: user.minIncrementKg, availableLoads, source: 'user' };
  }
  if (ex.defaultIncrementKg != null) {
    return { incrementKg: ex.defaultIncrementKg, availableLoads, source: 'exercise' };
  }
  // Çoklu ekipmanda EN İNCE adım kazanır: asla imkânsız büyük artış önerilmez.
  const inc = Math.min(...ex.equipment.map((t) => EQUIPMENT_DEFAULT_INCREMENT_KG[t] ?? 2.5));
  return { incrementKg: Number.isFinite(inc) ? inc : 2.5, availableLoads, source: 'equipment' };
}

export function roundToAvailable(target: number, current: number, spec: IncrementSpec): RoundResult {
  if (spec.availableLoads?.length) {
    const sorted = spec.availableLoads;
    let best = sorted[0]!;
    for (const v of sorted) {
      const d = Math.abs(v - target);
      const db = Math.abs(best - target);
      if (d < db || (d === db && v > best)) best = v;      // eşitlikte YUKARI (R100.4)
    }
    if (best === current && target > current) {
      const next = sorted.find((v) => v > current);
      if (next === undefined) return { value: current, fallback: 'repProgression', clamped: 'max' };
      return { value: next };
    }
    if (best === current && target < current) {
      const prev = [...sorted].reverse().find((v) => v < current);
      if (prev === undefined) return { value: current, clamped: 'min' };
      return { value: prev };
    }
    return { value: best };
  }

  const inc = spec.incrementKg;
  const steps = Math.round((target - current) / inc);
  const value = round2(current + steps * inc);
  if (value === current && target > current) return { value: current, fallback: 'repProgression' };
  return { value };
}

/** Yüzde hedefini gerçek kademeye çevirir; ham yüzde ASLA önerilmez (R100.3). */
export function targetFromPercent(current: number, pct: number, spec: IncrementSpec): RoundResult {
  return roundToAvailable(current * (1 + pct), current, spec);
}
