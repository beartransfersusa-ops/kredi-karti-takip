// Haftalık uyum — docs/v90/04-domain-engines.md §9.1, 02 §6.6.
// Sayım birimi scheduled_workouts SATIRIDIR, oturum değil: kısmi antrenman ve
// onun devam planı aynı sequence_index'i paylaşan iki ayrı satırdır, bu yüzden
// aynı antrenman iki kez "tamamlandı" sayılmaz.

import type { DateKey, ScheduledWorkoutStatus } from '../types.ts';
import { weekStartKey } from '../../core/clock/dateKey.ts';

export interface ScheduledRow {
  id: string;
  plannedDateKey: DateKey;
  status: ScheduledWorkoutStatus;
  /** Kısmi antrenmanlarda: yapılan / planlanan working set. */
  doneWorkingSets?: number;
  plannedWorkingSets?: number;
}

export interface WeekAdherence {
  weekStartKey: DateKey;
  completed: number;
  partial: number;
  skipped: number;
  missed: number;
  rescheduledOut: number;
  planned: number;
  completionRate: number;
  partialCompletionRatio: number | null;
}

/** `missed` saklanmaz; planned && geçmiş && program aktif koşulundan türetilir. */
export function isMissed(row: ScheduledRow, todayKey: DateKey, programActive: boolean): boolean {
  return programActive && row.status === 'planned' && row.plannedDateKey < todayKey;
}

export function week(
  rows: readonly ScheduledRow[], weekKey: DateKey, todayKey: DateKey, programActive = true,
): WeekAdherence {
  const start = weekStartKey(weekKey);
  const inWeek = rows.filter((r) => weekStartKey(r.plannedDateKey) === start);

  let completed = 0, partial = 0, skipped = 0, missed = 0, rescheduledOut = 0, planned = 0;
  let done = 0, total = 0;
  for (const r of inWeek) {
    switch (r.status) {
      case 'completed': completed++; break;
      case 'partiallyCompleted':
        partial++;
        done += r.doneWorkingSets ?? 0;
        total += r.plannedWorkingSets ?? 0;
        break;
      case 'skipped': skipped++; break;
      case 'rescheduled': rescheduledOut++; break;       // hedef hafta kendi satırında sayar
      case 'planned':
      case 'inProgress':
        if (isMissed(r, todayKey, programActive)) missed++; else planned++;
        break;
    }
  }
  const denom = completed + partial + skipped + missed;
  return {
    weekStartKey: start, completed, partial, skipped, missed, rescheduledOut, planned,
    completionRate: denom === 0 ? 0 : Math.round((completed / denom) * 100) / 100,
    partialCompletionRatio: total === 0 ? null : Math.round((done / total) * 100) / 100,
  };
}
