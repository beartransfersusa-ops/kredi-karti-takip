// Ay görünümü ızgarası — docs/v90/06-ux-flows.md A.10.
//
// Hangi günün seçilebilir olduğunu belirleyen kural burada, SAF biçimde
// durur: geçmiş kapalı (bugün hariç), dondurma aralıkları kapalı, 90 günlük
// takvimin dışı uyarılı ama seçilebilir.
import { addDaysKey, daysBetweenKeys, weekdayIndex } from '../format.ts';
import type { DateKey } from '../../domain/types.ts';

export interface DayCell {
  key: DateKey;
  dayOfMonth: number;
  weekday: number;
  inMonth: boolean;
  isToday: boolean;
  /** Kullanıcının tercih ettiği antrenman günü. */
  preferred: boolean;
  /** Program dondurulmuş aralıkta. */
  paused: boolean;
  /** 90 günlük takvimin dışında. */
  afterEnd: boolean;
  selectable: boolean;
}

export interface CalendarInput {
  monthAnchorKey: DateKey;
  todayKey: DateKey;
  minKey?: DateKey;
  maxKey?: DateKey;
  preferredWeekdays: readonly number[];
  pauses: ReadonlyArray<{ startDateKey: DateKey; endDateKey: DateKey | null }>;
  programEndKey?: DateKey | null;
}

/** Pazartesi başlangıçlı 6×7 ızgara — satır sayısı aydan aya değişmez. */
export function monthGrid(i: CalendarInput): DayCell[] {
  const [y, m] = i.monthAnchorKey.split('-').map(Number) as [number, number];
  const firstKey = `${y}-${String(m).padStart(2, '0')}-01`;
  // Pazartesi = 0 olacak şekilde kaydır (JS'te Pazar = 0).
  const lead = (weekdayIndex(firstKey) + 6) % 7;
  const start = addDaysKey(firstKey, -lead);

  return Array.from({ length: 42 }, (_, n) => {
    const key = addDaysKey(start, n);
    const month = Number(key.slice(5, 7));
    const paused = i.pauses.some((p) =>
      key >= p.startDateKey && (p.endDateKey === null || key <= p.endDateKey));
    const afterEnd = i.programEndKey ? key > i.programEndKey : false;
    const tooEarly = i.minKey ? key < i.minKey : key < i.todayKey;
    const tooLate = i.maxKey ? key > i.maxKey : false;

    return {
      key,
      dayOfMonth: Number(key.slice(8, 10)),
      weekday: weekdayIndex(key),
      inMonth: month === m,
      isToday: key === i.todayKey,
      preferred: i.preferredWeekdays.includes(weekdayIndex(key)),
      paused,
      afterEnd,
      selectable: !tooEarly && !tooLate && !paused,
    };
  });
}

/**
 * Varsayılan seçim: `from` gününden itibaren ilk tercih edilen gün.
 * Tercih yoksa `from`'un kendisi. Dondurma aralıkları atlanır.
 */
export function firstPreferredOnOrAfter(
  from: DateKey,
  preferredWeekdays: readonly number[],
  pauses: ReadonlyArray<{ startDateKey: DateKey; endDateKey: DateKey | null }> = [],
  horizonDays = 28,
): DateKey {
  const blocked = (k: DateKey) =>
    pauses.some((p) => k >= p.startDateKey && (p.endDateKey === null || k <= p.endDateKey));

  for (let n = 0; n <= horizonDays; n++) {
    const key = addDaysKey(from, n);
    if (blocked(key)) continue;
    if (preferredWeekdays.length === 0 || preferredWeekdays.includes(weekdayIndex(key))) return key;
  }
  return from;
}

/** Program bitiş günü: `activeDays` modunda dondurma günleri eklenir. */
export function programEndKey(
  startKey: DateKey, durationDays: number, calendarMode: string,
  pauses: ReadonlyArray<{ startDateKey: DateKey; endDateKey: DateKey | null }>,
  todayKey: DateKey,
): DateKey {
  const base = addDaysKey(startKey, durationDays - 1);
  if (calendarMode !== 'activeDays') return base;
  const pausedDays = pauses.reduce((sum, p) => {
    const end = p.endDateKey ?? todayKey;
    return sum + Math.max(0, daysBetweenKeys(p.startDateKey, end) + 1);
  }, 0);
  return addDaysKey(base, pausedDays);
}
