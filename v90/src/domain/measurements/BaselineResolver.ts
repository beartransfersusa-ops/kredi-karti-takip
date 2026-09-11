// Baseline çözümleme — docs/v90/04-domain-engines.md §11, 02 §11.2.
// Sıra: (1) is_baseline=1, (2) start_date_key ± 7 gün penceresindeki İLK kayıt,
// (3) yoksa null → dashboard "Başlangıç kol ölçümünü ekle." CTA'sı (R96.3–R96.5).

import type { DateKey } from '../types.ts';
import { addDays } from '../../core/clock/dateKey.ts';

export const BASELINE_WINDOW_DAYS = 7;

export interface MeasurementRow {
  id: string;
  site: string;
  localDateKey: DateKey;
  finalValueCm: number;
  isBaseline: boolean;
}

export interface ResolvedBaseline {
  measurementId: string;
  valueCm: number;
  localDateKey: DateKey;
  source: 'explicit' | 'window';
  /** Program başlangıcından kaç gün sonra alındı (geç baseline etiketi için). */
  dayOffset: number;
}

export function resolveBaseline(
  rows: readonly MeasurementRow[],
  site: string,
  programStartKey: DateKey | null,
): ResolvedBaseline | null {
  const forSite = rows.filter((r) => r.site === site)
    .sort((a, b) => (a.localDateKey < b.localDateKey ? -1 : a.localDateKey > b.localDateKey ? 1 : 0));
  if (forSite.length === 0) return null;

  const explicit = forSite.find((r) => r.isBaseline);
  const pick = explicit ?? (programStartKey
    ? forSite.find((r) => r.localDateKey >= addDays(programStartKey, -BASELINE_WINDOW_DAYS)
        && r.localDateKey <= addDays(programStartKey, BASELINE_WINDOW_DAYS))
    : undefined);
  if (!pick) return null;

  return {
    measurementId: pick.id,
    valueCm: pick.finalValueCm,
    localDateKey: pick.localDateKey,
    source: explicit ? 'explicit' : 'window',
    dayOffset: programStartKey ? dayDiff(programStartKey, pick.localDateKey) : 0,
  };
}

/** KPI yalnızca baseline varsa aktiftir; yoksa CTA gösterilir, ASLA 0 cm (R96.3). */
export interface KpiState {
  active: boolean;
  ctaTr?: string;
  baselineCm?: number;
  latestCm?: number;
  deltaCm?: number;
  /** Baseline programın ilk haftasından sonra alındıysa gösterilir. */
  baselineLabelTr?: string;
}

export function buildBicepsKpi(baseline: ResolvedBaseline | null, latestCm: number | null): KpiState {
  if (!baseline) return { active: false, ctaTr: 'Başlangıç kol ölçümünü ekle.' };
  const state: KpiState = { active: true, baselineCm: baseline.valueCm };
  if (latestCm != null) {
    state.latestCm = latestCm;
    state.deltaCm = Math.round((latestCm - baseline.valueCm) * 10) / 10;
  }
  if (baseline.dayOffset > BASELINE_WINDOW_DAYS) {
    state.baselineLabelTr = `Başlangıç: Gün ${baseline.dayOffset + 1}`;
  }
  return state;
}

function dayDiff(a: DateKey, b: DateKey): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
