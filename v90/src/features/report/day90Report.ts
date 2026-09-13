// Day 90 raporu — docs/v90/06-ux-flows.md B.19, 05 AT-20, 02 §9.7 (R123).
//
// SAF: DB'ye dokunmaz. Kurallar AT-20 ile birebir:
//   • site baseline = BaselineResolver (pencere dışı kayıt baseline DEĞİL)
//   • site final    = Day 90 tarihine kadar olan SON kayıt (sonrası final DEĞİL)
//   • kilo baseline = ilk 7 günün ortalaması; final = Day 90'da biten 7 günlük
//     hareketli ortalama (tekil son tartı DEĞİL)
//   • kısmi antrenman `completed`'a SAYILMAZ (R103.4)
//   • biceps baseline yoksa null → CTA; hiçbir yerde 0 cm (R96.3, R119.3)
//   • e1RM ve ikincil set TAHMİNDİR; `isEstimate` taşır (R123.4)
import { challengeDay } from '../../domain/program/ChallengeCalendar.ts';
import type { ChallengeDayInfo, ProgramPause } from '../../domain/program/ChallengeCalendar.ts';
import { resolveBaseline } from '../../domain/measurements/BaselineResolver.ts';
import type { MeasurementRow } from '../../domain/measurements/BaselineResolver.ts';
import { weightMovingAverage, weightTrend } from '../../domain/analytics/TrendCalculator.ts';
import type { WeightLog } from '../../domain/analytics/TrendCalculator.ts';
import { isMissed } from '../../domain/analytics/AdherenceCalculator.ts';
import type { ScheduledRow } from '../../domain/analytics/AdherenceCalculator.ts';
import type { DateKey } from '../../domain/types.ts';
import { programEndKey } from '../program/calendarGrid.ts';
import { addDaysKey } from '../format.ts';

export const REPORT_SITES = ['waist', 'abdomen', 'shoulder', 'hip', 'chest', 'forearm'] as const;
export type ReportSite = typeof REPORT_SITES[number];
export const BICEPS_SITES = ['bicepsFlexed', 'bicepsRightFlexed', 'bicepsLeftFlexed'] as const;

export interface Day90Input {
  program: {
    id: string; status: string; startDateKey: DateKey; calendarMode: string;
    durationDays: number; completedAtUtc: string | null;
  };
  pauses: readonly ProgramPause[];
  measurements: readonly MeasurementRow[];
  weightLogs: readonly WeightLog[];
  personalRecords: ReadonlyArray<{ prType: string; estimated1rm: number | null }>;
  scheduled: readonly ScheduledRow[];
  todayKey: DateKey;
}

export interface SiteReport {
  site: string;
  baselineCm: number | null;
  finalCm: number | null;
  /** Her ikisi de varsa fark; yoksa null — "0" ASLA uydurulmaz. */
  deltaCm: number | null;
}

export interface Day90Report {
  day: ChallengeDayInfo;
  /** Raporun hesaplandığı gün: strict start+89, activeDays dondurma kadar ileri. */
  day90Key: DateKey;
  /** Day 90 henüz gelmediyse rapor "ön izleme"dir. */
  isPreview: boolean;
  isCompleted: boolean;
  canComplete: boolean;
  sites: SiteReport[];
  biceps: SiteReport | null;
  weight: {
    baselineKg: number | null; finalKg: number | null; deltaKg: number | null;
    slopeKgPerWeek: number | null;
  };
  ratio: { baseline: number | null; final: number | null; delta: number | null };
  adherence: { completed: number; partial: number; skipped: number; missed: number };
  prs: { count: number; bestE1rm: number | null; isEstimate: true };
}

export function day90Report(i: Day90Input): Day90Report {
  const p = i.program;
  const day = challengeDay({
    startDateKey: p.startDateKey, todayKey: i.todayKey,
    calendarMode: p.calendarMode as 'strictCalendar' | 'activeDays',
    durationDays: p.durationDays, pauses: i.pauses,
  });
  const day90Key = programEndKey(p.startDateKey, p.durationDays, p.calendarMode, i.pauses, i.todayKey);
  const isCompleted = p.status === 'completed';
  // Day 90'ın KENDİSİ dahil: `phase` ancak 90 geçince 'finished' olur ama rapor
  // ve "Programı tamamla" Day 90 günü sunulur (AT-20 fikstürü o gün koşar).
  const reached = day.day >= p.durationDays;
  const isPreview = !isCompleted && !reached;

  const sites = REPORT_SITES.map((site) => siteReport(i.measurements, site, p.startDateKey, day90Key));
  const biceps = bicepsReport(i.measurements, p.startDateKey, day90Key);

  const baselineKg = firstWeekAverage(i.weightLogs, p.startDateKey);
  const finalKg = weightMovingAverage(i.weightLogs, day90Key)?.value ?? null;
  const slope = weightTrend(i.weightLogs, day90Key);

  const bySite = new Map(sites.map((s) => [s.site, s]));
  const ratioBase = ratio(bySite.get('shoulder')?.baselineCm, bySite.get('waist')?.baselineCm);
  const ratioFinal = ratio(bySite.get('shoulder')?.finalCm, bySite.get('waist')?.finalCm);

  return {
    day, day90Key, isPreview, isCompleted,
    // 02 §6.5: kapatma KULLANICI onayıyla; yalnızca Day 90'a ulaşınca ve hâlâ açıkken.
    canComplete: !isCompleted && reached && p.status === 'active',
    sites, biceps,
    weight: {
      baselineKg, finalKg,
      deltaKg: baselineKg !== null && finalKg !== null ? round1(finalKg - baselineKg) : null,
      slopeKgPerWeek: slope?.kgPerWeek ?? null,
    },
    ratio: {
      baseline: ratioBase, final: ratioFinal,
      delta: ratioBase !== null && ratioFinal !== null ? round2(ratioFinal - ratioBase) : null,
    },
    adherence: adherenceTotals(i.scheduled, i.todayKey, p.status === 'active'),
    prs: {
      count: i.personalRecords.length,
      bestE1rm: i.personalRecords.reduce<number | null>((best, r) =>
        (r.estimated1rm !== null && (best === null || r.estimated1rm > best) ? r.estimated1rm : best), null),
      isEstimate: true,
    },
  };
}

function siteReport(rows: readonly MeasurementRow[], site: string, startKey: DateKey, day90Key: DateKey): SiteReport {
  const baseline = resolveBaseline(rows, site, startKey);
  const final = lastOnOrBefore(rows, site, day90Key);
  const baselineCm = baseline?.valueCm ?? null;
  // Baseline'ın kendisi tek kayıtsa final da odur; fark 0 — bu gerçek bir 0'dır, uydurma değil.
  const finalCm = final?.finalValueCm ?? null;
  return {
    site, baselineCm, finalCm,
    deltaCm: baselineCm !== null && finalCm !== null ? round1(finalCm - baselineCm) : null,
  };
}

/** Sol/sağ ayrı girildiyse mevcut olan ilk site; tek değer girildiyse o. */
function bicepsReport(rows: readonly MeasurementRow[], startKey: DateKey, day90Key: DateKey): SiteReport | null {
  for (const site of BICEPS_SITES) {
    if (resolveBaseline(rows, site, startKey)) return siteReport(rows, site, startKey, day90Key);
  }
  return null;                                     // CTA; 0 cm DEĞİL (R96.3)
}

/** Day 90 tarihine kadar olan SON kayıt; sonraki günler final değildir (AT-20 adım 3). */
export function lastOnOrBefore(rows: readonly MeasurementRow[], site: string, key: DateKey): MeasurementRow | null {
  let best: MeasurementRow | null = null;
  for (const r of rows) {
    if (r.site !== site || r.localDateKey > key) continue;
    if (!best || r.localDateKey > best.localDateKey) best = r;
  }
  return best;
}

/** Programın ilk 7 günü (start … start+6); < 3 gün varsa null (R123.1). */
export function firstWeekAverage(logs: readonly WeightLog[], startKey: DateKey): number | null {
  const endKey = addDaysKey(startKey, 6);
  const byDay = new Map<DateKey, number[]>();
  for (const l of logs) {
    if (l.localDateKey < startKey || l.localDateKey > endKey) continue;
    byDay.set(l.localDateKey, [...(byDay.get(l.localDateKey) ?? []), l.weightKg]);
  }
  if (byDay.size < 3) return null;
  const means = [...byDay.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
  return round1(means.reduce((a, b) => a + b, 0) / means.length);
}

export function adherenceTotals(rows: readonly ScheduledRow[], todayKey: DateKey, programActive: boolean) {
  const t = { completed: 0, partial: 0, skipped: 0, missed: 0 };
  for (const r of rows) {
    if (r.status === 'completed') t.completed++;
    else if (r.status === 'partiallyCompleted') t.partial++;      // R103.4: ayrı sayılır
    else if (r.status === 'skipped') t.skipped++;
    else if (isMissed(r, todayKey, programActive)) t.missed++;
  }
  return t;
}

const ratio = (shoulder: number | null | undefined, waist: number | null | undefined): number | null =>
  (shoulder && waist ? round2(shoulder / waist) : null);
const round1 = (x: number) => Math.round(x * 10) / 10;
const round2 = (x: number) => Math.round(x * 100) / 100;
