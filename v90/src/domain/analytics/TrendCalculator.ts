// Trend ve KPI hesapları — docs/v90/04-domain-engines.md §9.
// R123: gürültülü veriden kesin sonuç üretilmez; yeterli veri yoksa null döner.

import type { DateKey } from '../types.ts';
import { addDays, daysBetween } from '../../core/clock/dateKey.ts';

export const MIN_DAYS_IN_WINDOW = 3;
export const WEIGHT_STABLE_KG_PER_WEEK = 0.2;
export const MEASUREMENT_STABLE_CM = 0.5;
export const RATIO_MATCH_DAYS = 3;

export interface WeightLog { localDateKey: DateKey; weightKg: number }
export interface TrendPoint { value: number; daysUsed: number }
export type TrendLabel = 'up' | 'down' | 'stable';

/** Aynı güne birden çok tartı → o günün ORTALAMASI (§9.2). */
export function dailyMeans(logs: readonly WeightLog[]): Map<DateKey, number> {
  const by = new Map<DateKey, number[]>();
  for (const l of logs) {
    const arr = by.get(l.localDateKey) ?? [];
    arr.push(l.weightKg);
    by.set(l.localDateKey, arr);
  }
  return new Map([...by].map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length]));
}

export function weightMovingAverage(
  logs: readonly WeightLog[], endKey: DateKey, windowDays = 7,
): TrendPoint | null {
  const means = dailyMeans(logs);
  const used: number[] = [];
  for (let i = 0; i < windowDays; i++) {
    const v = means.get(addDays(endKey, -i));
    if (v != null) used.push(v);
  }
  if (used.length < MIN_DAYS_IN_WINDOW) return null;        // "Yeterli tartı yok"
  return { value: round1(used.reduce((a, b) => a + b, 0) / used.length), daysUsed: used.length };
}

export function weightTrend(
  logs: readonly WeightLog[], endKey: DateKey, windowDays = 28,
): { kgPerWeek: number; label: TrendLabel; daysUsed: number } | null {
  const means = dailyMeans(logs);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < windowDays; i++) {
    const key = addDays(endKey, -i);
    const v = means.get(key);
    if (v != null) pts.push([-i, v]);
  }
  if (pts.length < 8) return null;
  const n = pts.length;
  const sx = pts.reduce((a, p) => a + p[0], 0);
  const sy = pts.reduce((a, p) => a + p[1], 0);
  const sxy = pts.reduce((a, p) => a + p[0] * p[1], 0);
  const sxx = pts.reduce((a, p) => a + p[0] * p[0], 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const slopePerDay = (n * sxy - sx * sy) / denom;
  const kgPerWeek = round2(slopePerDay * 7);
  return {
    kgPerWeek, daysUsed: n,
    label: Math.abs(kgPerWeek) < WEIGHT_STABLE_KG_PER_WEEK ? 'stable' : kgPerWeek > 0 ? 'up' : 'down',
  };
}

export interface MeasurementPoint { localDateKey: DateKey; valueCm: number }

/**
 * Omuz/bel oranı = omuz ÷ bel, 2 ondalık. Yalnızca birbirine en yakın (± 3 gün)
 * ölçüm çiftinden hesaplanır; eşleşme yoksa gösterilmez (R13.2, AT-11).
 */
export function shoulderToWaist(
  shoulder: readonly MeasurementPoint[], waist: readonly MeasurementPoint[],
): { ratio: number; shoulderKey: DateKey; waistKey: DateKey } | null {
  let best: { ratio: number; shoulderKey: DateKey; waistKey: DateKey; gap: number; recency: DateKey } | null = null;
  for (const s of shoulder) {
    for (const w of waist) {
      const gap = Math.abs(daysBetween(s.localDateKey, w.localDateKey));
      if (gap > RATIO_MATCH_DAYS) continue;
      const recency = s.localDateKey > w.localDateKey ? s.localDateKey : w.localDateKey;
      const cand = { ratio: round2(s.valueCm / w.valueCm), shoulderKey: s.localDateKey, waistKey: w.localDateKey, gap, recency };
      if (!best || cand.recency > best.recency || (cand.recency === best.recency && cand.gap < best.gap)) best = cand;
    }
  }
  return best ? { ratio: best.ratio, shoulderKey: best.shoulderKey, waistKey: best.waistKey } : null;
}

/** Day 90 raporu final değeri: son 7 günün medyanı; yoksa son kayıt + yaşı (§9.4). */
export function finalValue(points: readonly MeasurementPoint[], endKey: DateKey):
  { valueCm: number; source: 'median7d' | 'lastKnown'; ageDays: number } | null {
  if (points.length === 0) return null;
  const within = points.filter((p) => daysBetween(p.localDateKey, endKey) >= 0 && daysBetween(p.localDateKey, endKey) <= 6);
  if (within.length > 0) {
    const v = within.map((p) => p.valueCm).sort((a, b) => a - b);
    const mid = Math.floor(v.length / 2);
    const median = v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
    return { valueCm: round1(median), source: 'median7d', ageDays: 0 };
  }
  const last = [...points].sort((a, b) => (a.localDateKey < b.localDateKey ? 1 : -1))[0]!;
  return { valueCm: last.valueCm, source: 'lastKnown', ageDays: daysBetween(last.localDateKey, endKey) };
}

const round1 = (x: number) => Math.round((x + Number.EPSILON) * 10) / 10;
const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
