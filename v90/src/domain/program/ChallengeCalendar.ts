// Challenge takvimi — docs/v90/04-domain-engines.md §1, 02 §6.1, ADR-001.
// challengeDay SAKLANMAZ; her zaman türetilir. Antrenman sırasından tamamen
// bağımsızdır: takvim gerçek günlerle ilerler, sıra yalnızca kullanıcı
// eylemleriyle (R88.1, R88.2).

import type { CalendarMode, DateKey, PauseReason } from '../types.ts';
import { daysBetween, maxKey, minKey } from '../../core/clock/dateKey.ts';

export type ChallengePhase = 'notStarted' | 'active' | 'finished';

export interface ProgramPause {
  startDateKey: DateKey;
  /** null = hâlâ dondurulmuş. */
  endDateKey: DateKey | null;
  reason?: PauseReason | null;
}

export interface ChallengeCalendarInput {
  startDateKey: DateKey;
  todayKey: DateKey;
  calendarMode: CalendarMode;
  durationDays?: number;
  pauses?: readonly ProgramPause[];
}

export interface ChallengeDayInfo {
  day: number;
  phase: ChallengePhase;
  durationDays: number;
  pausedDays: number;
  /** Ham takvim farkı (mod ne olursa olsun). */
  calendarDay: number;
}

/**
 * Dondurma aralığı [start, end): başlangıç günü dahil, devam günü hariç.
 * Açık dondurmada geçici bitiş = bugün → challengeDay dondurma boyunca
 * monoton kalır, geri gitmez.
 */
export function pausedDays(pauses: readonly ProgramPause[], from: DateKey, to: DateKey): number {
  let total = 0;
  for (const p of pauses) {
    const start = maxKey(p.startDateKey, from);
    const end = minKey(p.endDateKey ?? to, to);
    const days = daysBetween(start, end);
    if (days > 0) total += days;
  }
  return total;
}

export function challengeDay(i: ChallengeCalendarInput): ChallengeDayInfo {
  const durationDays = i.durationDays ?? 90;
  const raw = daysBetween(i.startDateKey, i.todayKey) + 1;

  if (raw < 1) {
    return { day: 1, phase: 'notStarted', durationDays, pausedDays: 0, calendarDay: raw };
  }
  const paused = i.calendarMode === 'activeDays'
    ? pausedDays(i.pauses ?? [], i.startDateKey, i.todayKey)
    : 0;
  const effective = raw - paused;
  const day = Math.min(Math.max(effective, 1), durationDays);
  return {
    day,
    phase: effective > durationDays ? 'finished' : 'active',
    durationDays, pausedDays: paused, calendarDay: raw,
  };
}
