// Repository katmanı — docs/v90/02-architecture.md §3.
// Kural: her metot `tx` alır; TRANSACTION SINIRINI SERVİS BELİRLER.
// Satır tipleri DB kolonlarını (snake_case) birebir yansıtır; dönüşüm servis
// sınırında yapılır, böylece SQL ile tip arasında sessiz kayma olmaz.

import type { Tx } from './types.ts';
import type {
  DateKey, PauseReason, ScheduledWorkoutStatus, SequenceEventCause, SessionStatus, Side,
} from '../../domain/types.ts';

// ---------------------------------------------------------------- satır tipleri
export interface ProgramRow {
  id: string; program_template_id: string; name: string; status: string;
  start_date_key: DateKey; start_time_zone: string; calendar_mode: string;
  training_sequence_index: number; sequence_wraps: number; duration_days: number;
  completed_at_utc: string | null; created_at_utc: string; updated_at_utc: string;
}
export interface ProgramPauseRow {
  id: string; program_id: string; reason: PauseReason | null; note: string | null;
  started_at_utc: string; start_date_key: DateKey;
  ended_at_utc: string | null; end_date_key: DateKey | null; time_zone: string;
}
export interface ScheduledWorkoutRow {
  id: string; program_id: string; sequence_index: number; workout_template_id: string;
  planned_date_key: DateKey; status: ScheduledWorkoutStatus;
  rescheduled_to_id: string | null; rescheduled_from_id: string | null;
  reschedule_reason: string | null; remaining_exercise_ids_json: string | null;
  partial_decision: string | null; resolved_at_utc: string | null;
  created_at_utc: string; updated_at_utc: string;
}
export interface WorkoutSessionRow {
  id: string; program_id: string | null; scheduled_workout_id: string | null;
  workout_template_id: string | null; status: SessionStatus;
  started_at_utc: string; completed_at_utc: string | null; cancelled_at_utc: string | null;
  calendar_date_key: DateKey; calendar_date_overridden: number;
  time_zone: string; utc_offset_minutes: number; bodyweight_kg_snapshot: number | null;
  ended_reason: string | null; note: string | null; created_at_utc: string; updated_at_utc: string;
}
export interface SessionExerciseRow {
  id: string; session_id: string; order_index: number; exercise_id: string;
  original_exercise_id: string | null; substitution_reason: string | null;
  tracking_mode: 'bothSame' | 'separate'; status: 'pending' | 'inProgress' | 'done' | 'skipped';
  planned_working_sets: number; planned_warmup_sets: number;
  rep_min: number; rep_max: number; target_rir: number; rest_seconds: number;
  draft_load_json: string | null; draft_reps: number | null; draft_rir: number | null;
  note: string | null; updated_at_utc: string;
}
export interface SetLogRow {
  id: string; command_id: string; session_id: string; session_exercise_id: string;
  exercise_id: string; set_index: number; set_type: string; side: Side;
  load_kg: number | null; assistance_kg: number | null; machine_level: number | null;
  band_rank: number | null; distance_cm: number | null; bodyweight_kg_snapshot: number | null;
  reps: number; rir: number | null; rpe: number | null;
  exclude_from_pr: number; pain_flag: number; form_breakdown_flag: number; discarded: number;
  completed_at_utc: string; local_date_key: DateKey; time_zone: string; note: string | null;
}
export interface RestTimerRow {
  id: string; session_id: string; session_exercise_id: string | null; set_log_id: string | null;
  rest_started_at_utc: string; rest_duration_seconds: number;
  state: 'running' | 'completed' | 'skipped'; notification_id: string | null; updated_at_utc: string;
}
export interface TemplateExerciseRow {
  id: string; workout_template_id: string; order_index: number; exercise_id: string;
  working_sets: number; warmup_sets: number; rep_min: number; rep_max: number;
  target_rir: number; rest_seconds: number; is_customized: number;
}
export interface WorkoutTemplateRow {
  id: string; program_template_id: string; sequence_order: number;
  name: string; name_tr: string; estimated_minutes: number | null;
}

// ---------------------------------------------------------------- programs
export const programs = {
  async findOpen(tx: Tx): Promise<ProgramRow | undefined> {
    return tx.get<ProgramRow>(`SELECT * FROM programs WHERE status IN ('active','paused')`);
  },
  async get(tx: Tx, id: string): Promise<ProgramRow> {
    const r = await tx.get<ProgramRow>('SELECT * FROM programs WHERE id = ?', [id]);
    if (!r) throw new Error(`program bulunamadı: ${id}`);
    return r;
  },
  async setStatus(tx: Tx, id: string, status: string, now: string, completedAtUtc?: string | null) {
    await tx.exec(
      `UPDATE programs SET status = ?, completed_at_utc = COALESCE(?, completed_at_utc), updated_at_utc = ? WHERE id = ?`,
      [status, completedAtUtc ?? null, now, id]);
  },
  async setSequence(tx: Tx, id: string, index: number, wraps: number, now: string) {
    await tx.exec(
      'UPDATE programs SET training_sequence_index = ?, sequence_wraps = ?, updated_at_utc = ? WHERE id = ?',
      [index, wraps, now, id]);
  },
  async setCalendarMode(tx: Tx, id: string, mode: string, now: string) {
    await tx.exec('UPDATE programs SET calendar_mode = ?, updated_at_utc = ? WHERE id = ?', [mode, now, id]);
  },
};

// ---------------------------------------------------------------- pauses
export const pauses = {
  async open(tx: Tx, programId: string): Promise<ProgramPauseRow | undefined> {
    return tx.get<ProgramPauseRow>(
      'SELECT * FROM program_pauses WHERE program_id = ? AND end_date_key IS NULL', [programId]);
  },
  async all(tx: Tx, programId: string): Promise<ProgramPauseRow[]> {
    return tx.all<ProgramPauseRow>(
      'SELECT * FROM program_pauses WHERE program_id = ? ORDER BY start_date_key', [programId]);
  },
  async insert(tx: Tx, r: ProgramPauseRow) {
    await tx.exec(
      `INSERT INTO program_pauses (id, program_id, reason, note, started_at_utc, start_date_key, ended_at_utc, end_date_key, time_zone)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [r.id, r.program_id, r.reason, r.note, r.started_at_utc, r.start_date_key, r.ended_at_utc, r.end_date_key, r.time_zone]);
  },
  async close(tx: Tx, id: string, endedAtUtc: string, endDateKey: DateKey) {
    await tx.exec('UPDATE program_pauses SET ended_at_utc = ?, end_date_key = ? WHERE id = ?',
      [endedAtUtc, endDateKey, id]);
  },
};

// ---------------------------------------------------------------- sequence events
export const sequenceEvents = {
  async insert(tx: Tx, r: { id: string; programId: string; fromIndex: number; toIndex: number;
    cause: SequenceEventCause; scheduledWorkoutId: string | null; occurredAtUtc: string }) {
    await tx.exec(
      `INSERT INTO sequence_events (id, program_id, from_index, to_index, cause, scheduled_workout_id, occurred_at_utc)
       VALUES (?,?,?,?,?,?,?)`,
      [r.id, r.programId, r.fromIndex, r.toIndex, r.cause, r.scheduledWorkoutId, r.occurredAtUtc]);
  },
  async all(tx: Tx, programId: string) {
    return tx.all<{ from_index: number; to_index: number; cause: string; scheduled_workout_id: string | null }>(
      'SELECT * FROM sequence_events WHERE program_id = ? ORDER BY occurred_at_utc, rowid', [programId]);
  },
};

// ---------------------------------------------------------------- scheduled workouts
export const scheduled = {
  async get(tx: Tx, id: string): Promise<ScheduledWorkoutRow> {
    const r = await tx.get<ScheduledWorkoutRow>('SELECT * FROM scheduled_workouts WHERE id = ?', [id]);
    if (!r) throw new Error(`plan bulunamadı: ${id}`);
    return r;
  },
  /** Aynı anda en fazla bir tane (ux_sched_one_open). */
  async findOpen(tx: Tx, programId: string): Promise<ScheduledWorkoutRow | undefined> {
    return tx.get<ScheduledWorkoutRow>(
      `SELECT * FROM scheduled_workouts WHERE program_id = ? AND status IN ('planned','inProgress')`, [programId]);
  },
  async findPendingPartial(tx: Tx, programId: string): Promise<ScheduledWorkoutRow | undefined> {
    return tx.get<ScheduledWorkoutRow>(
      `SELECT * FROM scheduled_workouts
       WHERE program_id = ? AND status = 'partiallyCompleted' AND partial_decision IS NULL
       ORDER BY updated_at_utc LIMIT 1`, [programId]);
  },
  async inWeek(tx: Tx, programId: string, fromKey: DateKey, toKey: DateKey) {
    return tx.all<ScheduledWorkoutRow>(
      `SELECT * FROM scheduled_workouts WHERE program_id = ? AND planned_date_key BETWEEN ? AND ?
       ORDER BY planned_date_key`, [programId, fromKey, toKey]);
  },
  async insert(tx: Tx, r: ScheduledWorkoutRow) {
    await tx.exec(
      `INSERT INTO scheduled_workouts
        (id, program_id, sequence_index, workout_template_id, planned_date_key, status,
         rescheduled_to_id, rescheduled_from_id, reschedule_reason, remaining_exercise_ids_json,
         partial_decision, resolved_at_utc, created_at_utc, updated_at_utc)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.program_id, r.sequence_index, r.workout_template_id, r.planned_date_key, r.status,
        r.rescheduled_to_id, r.rescheduled_from_id, r.reschedule_reason, r.remaining_exercise_ids_json,
        r.partial_decision, r.resolved_at_utc, r.created_at_utc, r.updated_at_utc]);
  },
  async patch(tx: Tx, id: string, fields: Partial<Omit<ScheduledWorkoutRow, 'id'>>, now: string) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const sets = [...keys.map((k) => `${k} = ?`), 'updated_at_utc = ?'].join(', ');
    await tx.exec(`UPDATE scheduled_workouts SET ${sets} WHERE id = ?`,
      [...keys.map((k) => (fields as Record<string, unknown>)[k]), now, id]);
  },
};

// ---------------------------------------------------------------- templates
export const templates = {
  async byProgramTemplate(tx: Tx, programTemplateId: string) {
    return tx.all<WorkoutTemplateRow>(
      'SELECT * FROM workout_templates WHERE program_template_id = ? ORDER BY sequence_order',
      [programTemplateId]);
  },
  async bySequenceOrder(tx: Tx, programTemplateId: string, order: number) {
    return tx.get<WorkoutTemplateRow>(
      'SELECT * FROM workout_templates WHERE program_template_id = ? AND sequence_order = ?',
      [programTemplateId, order]);
  },
  async exercises(tx: Tx, workoutTemplateId: string) {
    return tx.all<TemplateExerciseRow>(
      'SELECT * FROM template_exercises WHERE workout_template_id = ? ORDER BY order_index',
      [workoutTemplateId]);
  },
};

// ---------------------------------------------------------------- sessions
export const sessions = {
  async findActive(tx: Tx): Promise<WorkoutSessionRow | undefined> {
    return tx.get<WorkoutSessionRow>(`SELECT * FROM workout_sessions WHERE status = 'active'`);
  },
  async get(tx: Tx, id: string): Promise<WorkoutSessionRow> {
    const r = await tx.get<WorkoutSessionRow>('SELECT * FROM workout_sessions WHERE id = ?', [id]);
    if (!r) throw new Error(`oturum bulunamadı: ${id}`);
    return r;
  },
  async insert(tx: Tx, r: WorkoutSessionRow) {
    await tx.exec(
      `INSERT INTO workout_sessions
        (id, program_id, scheduled_workout_id, workout_template_id, status, started_at_utc,
         completed_at_utc, cancelled_at_utc, calendar_date_key, calendar_date_overridden, time_zone,
         utc_offset_minutes, bodyweight_kg_snapshot, ended_reason, note, created_at_utc, updated_at_utc)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.program_id, r.scheduled_workout_id, r.workout_template_id, r.status, r.started_at_utc,
        r.completed_at_utc, r.cancelled_at_utc, r.calendar_date_key, r.calendar_date_overridden, r.time_zone,
        r.utc_offset_minutes, r.bodyweight_kg_snapshot, r.ended_reason, r.note, r.created_at_utc, r.updated_at_utc]);
  },
  async patch(tx: Tx, id: string, fields: Partial<Omit<WorkoutSessionRow, 'id'>>, now: string) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const sets = [...keys.map((k) => `${k} = ?`), 'updated_at_utc = ?'].join(', ');
    await tx.exec(`UPDATE workout_sessions SET ${sets} WHERE id = ?`,
      [...keys.map((k) => (fields as Record<string, unknown>)[k]), now, id]);
  },
};

export const sessionExercises = {
  async forSession(tx: Tx, sessionId: string) {
    return tx.all<SessionExerciseRow>(
      'SELECT * FROM session_exercises WHERE session_id = ? ORDER BY order_index', [sessionId]);
  },
  async get(tx: Tx, id: string): Promise<SessionExerciseRow> {
    const r = await tx.get<SessionExerciseRow>('SELECT * FROM session_exercises WHERE id = ?', [id]);
    if (!r) throw new Error(`oturum hareketi bulunamadı: ${id}`);
    return r;
  },
  async insert(tx: Tx, r: SessionExerciseRow) {
    await tx.exec(
      `INSERT INTO session_exercises
        (id, session_id, order_index, exercise_id, original_exercise_id, substitution_reason,
         tracking_mode, status, planned_working_sets, planned_warmup_sets, rep_min, rep_max,
         target_rir, rest_seconds, draft_load_json, draft_reps, draft_rir, note, updated_at_utc)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.session_id, r.order_index, r.exercise_id, r.original_exercise_id, r.substitution_reason,
        r.tracking_mode, r.status, r.planned_working_sets, r.planned_warmup_sets, r.rep_min, r.rep_max,
        r.target_rir, r.rest_seconds, r.draft_load_json, r.draft_reps, r.draft_rir, r.note, r.updated_at_utc]);
  },
  async patch(tx: Tx, id: string, fields: Partial<Omit<SessionExerciseRow, 'id'>>, now: string) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const sets = [...keys.map((k) => `${k} = ?`), 'updated_at_utc = ?'].join(', ');
    await tx.exec(`UPDATE session_exercises SET ${sets} WHERE id = ?`,
      [...keys.map((k) => (fields as Record<string, unknown>)[k]), now, id]);
  },
  async clearDrafts(tx: Tx, sessionId: string, now: string) {
    await tx.exec(
      `UPDATE session_exercises SET draft_load_json = NULL, draft_reps = NULL, draft_rir = NULL, updated_at_utc = ?
       WHERE session_id = ?`, [now, sessionId]);
  },
};

export const setLogs = {
  async forSession(tx: Tx, sessionId: string) {
    return tx.all<SetLogRow>(
      'SELECT * FROM set_logs WHERE session_id = ? ORDER BY session_exercise_id, set_index, side', [sessionId]);
  },
  async byCommandId(tx: Tx, commandId: string) {
    return tx.get<SetLogRow>('SELECT * FROM set_logs WHERE command_id = ?', [commandId]);
  },
  async get(tx: Tx, id: string): Promise<SetLogRow> {
    const r = await tx.get<SetLogRow>('SELECT * FROM set_logs WHERE id = ?', [id]);
    if (!r) throw new Error(`set kaydı bulunamadı: ${id}`);
    return r;
  },
  async insert(tx: Tx, r: SetLogRow) {
    await tx.exec(
      `INSERT INTO set_logs
        (id, command_id, session_id, session_exercise_id, exercise_id, set_index, set_type, side,
         load_kg, assistance_kg, machine_level, band_rank, distance_cm, bodyweight_kg_snapshot,
         reps, rir, rpe, exclude_from_pr, pain_flag, form_breakdown_flag, discarded,
         completed_at_utc, local_date_key, time_zone, note)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [r.id, r.command_id, r.session_id, r.session_exercise_id, r.exercise_id, r.set_index, r.set_type, r.side,
        r.load_kg, r.assistance_kg, r.machine_level, r.band_rank, r.distance_cm, r.bodyweight_kg_snapshot,
        r.reps, r.rir, r.rpe, r.exclude_from_pr, r.pain_flag, r.form_breakdown_flag, r.discarded,
        r.completed_at_utc, r.local_date_key, r.time_zone, r.note]);
  },
  async patch(tx: Tx, id: string, fields: Partial<Omit<SetLogRow, 'id'>>) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    await tx.exec(`UPDATE set_logs SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...keys.map((k) => (fields as Record<string, unknown>)[k]), id]);
  },
  async discardSession(tx: Tx, sessionId: string) {
    await tx.exec('UPDATE set_logs SET discarded = 1 WHERE session_id = ?', [sessionId]);
  },
  async moveSessionDay(tx: Tx, sessionId: string, dateKey: DateKey) {
    await tx.exec('UPDATE set_logs SET local_date_key = ? WHERE session_id = ?', [dateKey, sessionId]);
  },
  async insertRevision(tx: Tx, r: { id: string; setLogId: string; before: unknown; after: unknown; revisedAtUtc: string }) {
    await tx.exec(
      'INSERT INTO set_log_revisions (id, set_log_id, before_json, after_json, revised_at_utc) VALUES (?,?,?,?,?)',
      [r.id, r.setLogId, JSON.stringify(r.before), JSON.stringify(r.after), r.revisedAtUtc]);
  },
};

export const restTimers = {
  async running(tx: Tx) {
    return tx.get<RestTimerRow>(`SELECT * FROM rest_timers WHERE state = 'running'`);
  },
  async insert(tx: Tx, r: RestTimerRow) {
    await tx.exec(
      `INSERT INTO rest_timers (id, session_id, session_exercise_id, set_log_id, rest_started_at_utc,
        rest_duration_seconds, state, notification_id, updated_at_utc) VALUES (?,?,?,?,?,?,?,?,?)`,
      [r.id, r.session_id, r.session_exercise_id, r.set_log_id, r.rest_started_at_utc,
        r.rest_duration_seconds, r.state, r.notification_id, r.updated_at_utc]);
  },
  async patch(tx: Tx, id: string, fields: Partial<Omit<RestTimerRow, 'id'>>, now: string) {
    const keys = Object.keys(fields);
    if (keys.length === 0) return;
    const sets = [...keys.map((k) => `${k} = ?`), 'updated_at_utc = ?'].join(', ');
    await tx.exec(`UPDATE rest_timers SET ${sets} WHERE id = ?`,
      [...keys.map((k) => (fields as Record<string, unknown>)[k]), now, id]);
  },
};

export const personalRecords = {
  async voidSession(tx: Tx, sessionId: string) {
    // Önce zinciri onar, sonra geçersiz kıl: geçmiş silinmez (03 §1.6 voided).
    await tx.exec(
      `UPDATE personal_records SET superseded_by_id = NULL
       WHERE superseded_by_id IN (SELECT id FROM personal_records WHERE session_id = ?)`, [sessionId]);
    await tx.exec('UPDATE personal_records SET voided = 1 WHERE session_id = ?', [sessionId]);
  },
  async moveSessionDay(tx: Tx, sessionId: string, dateKey: DateKey) {
    await tx.exec('UPDATE personal_records SET local_date_key = ? WHERE session_id = ?', [dateKey, sessionId]);
  },
  async forSession(tx: Tx, sessionId: string) {
    return tx.all<{ id: string; pr_type: string; voided: number }>(
      'SELECT id, pr_type, voided FROM personal_records WHERE session_id = ?', [sessionId]);
  },
};

export const weightLogs = {
  /** Oturum başında anlık kopya: son 14 gün içindeki son tartı (02 §7.1). */
  async latestWithin(tx: Tx, fromDateKey: DateKey) {
    return tx.get<{ weight_kg: number }>(
      `SELECT weight_kg FROM weight_logs WHERE local_date_key >= ? ORDER BY measured_at_utc DESC LIMIT 1`,
      [fromDateKey]);
  },
};

export const settings = {
  async get<T>(tx: Tx, key: string): Promise<T | undefined> {
    const r = await tx.get<{ value_json: string }>('SELECT value_json FROM settings WHERE key = ?', [key]);
    return r ? (JSON.parse(r.value_json) as T) : undefined;
  },
  async set(tx: Tx, key: string, value: unknown, now: string) {
    await tx.exec(
      `INSERT INTO settings (key, value_json, updated_at_utc) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at_utc = excluded.updated_at_utc`,
      [key, JSON.stringify(value), now]);
  },
};
