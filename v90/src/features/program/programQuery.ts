// Program ekranlarının ortak okuması — A.9, A.10.
import { programs } from '../../core/db/repositories.ts';
import { preferredWorkoutDays } from '../profile/profileQuery.ts';
import type { ProgramRow } from '../../core/db/repositories.ts';
import type { Tx } from '../../core/db/types.ts';
import type { DateKey } from '../../domain/types.ts';
import { programEndKey } from './calendarGrid.ts';

export interface ProgramContext {
  program: ProgramRow | null;
  pauses: Array<{ startDateKey: DateKey; endDateKey: DateKey | null }>;
  preferredWeekdays: number[];
  programEndKey: DateKey | null;
  hasActiveSession: boolean;
}

export async function loadProgramContext(tx: Tx, todayKey: DateKey): Promise<ProgramContext> {
  const program = (await programs.findOpen(tx)) ?? null;
  const preferredWeekdays = await preferredWorkoutDays(tx);

  if (!program) {
    return { program: null, pauses: [], preferredWeekdays, programEndKey: null, hasActiveSession: false };
  }

  const rows = await tx.all<{ start_date_key: string; end_date_key: string | null }>(
    'SELECT start_date_key, end_date_key FROM program_pauses WHERE program_id = ? ORDER BY start_date_key',
    [program.id]);
  const pauses = rows.map((r) => ({ startDateKey: r.start_date_key, endDateKey: r.end_date_key }));

  const active = await tx.get<{ id: string }>(`SELECT id FROM workout_sessions WHERE status = 'active'`);

  return {
    program,
    pauses,
    preferredWeekdays,
    programEndKey: programEndKey(program.start_date_key, program.duration_days, program.calendar_mode, pauses, todayKey),
    hasActiveSession: !!active,
  };
}

/** Bir planın kaç kez taşındığı — `rescheduled_from_id` zinciri (R88.7, AT-05). */
export async function rescheduleCount(tx: Tx, scheduledWorkoutId: string): Promise<number> {
  let id: string | null = scheduledWorkoutId;
  let n = 0;
  // Zincir uzunluğu sınırlı; yine de sonsuz döngüye karşı tavan var.
  for (let guard = 0; guard < 100 && id; guard++) {
    const row: { rescheduled_from_id: string | null } | undefined = await tx.get(
      'SELECT rescheduled_from_id FROM scheduled_workouts WHERE id = ?', [id]);
    id = row?.rescheduled_from_id ?? null;
    if (id) n++;
  }
  return n;
}
