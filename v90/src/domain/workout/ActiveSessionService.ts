// Aktif antrenman oturumu — docs/v90/04-domain-engines.md §2, 02 §7, ADR-004.
//
// Değişmezler:
//   I1  Her kullanıcı eylemi TEK transaction'dır; bellekte hiçbir şey bekletilmez.
//   I2  Her tamamlanan set kendi transaction'ında kalıcı olur (R90.6).
//   I3  command_log satırı komutun geri kalanıyla aynı tx'te yazılır → yarım
//       yazma imkânsız, tekrar gelen aynı command_id no-op.
//   I4  Oturuma bağlı kayıtların günü = workout_sessions.calendar_date_key.

import type { Db, Tx } from '../../core/db/types.ts';
import type { Clock } from '../../core/clock/dateKey.ts';
import { addDays, localDateKey, utcOffsetMinutes } from '../../core/clock/dateKey.ts';
import type { IdGenerator } from '../../core/id.ts';
import { uuid } from '../../core/id.ts';
import { applied, claimCommand, duplicate } from '../../core/db/commandLog.ts';
import type { CommandResult } from '../../core/db/commandLog.ts';
import {
  personalRecords, programs, scheduled, sessionExercises, sessions, setLogs, templates, weightLogs,
} from '../../core/db/repositories.ts';
import type { SessionExerciseRow, SetLogRow, WorkoutSessionRow } from '../../core/db/repositories.ts';
import { Scheduler } from '../program/Scheduler.ts';
import {
  ActiveSessionExistsError, SessionNotActiveError, SetAlreadyLoggedError, ValidationError,
} from '../program/errors.ts';
import { RestTimerService } from './RestTimerService.ts';
import type { RestTimerView } from './RestTimerService.ts';
import { detectForSet } from './PrDetector.ts';
import type { CurrentPrs, PersonalRecordDraft } from './PrDetector.ts';
import { effectiveLoad } from '../exercise/LoadBehavior.ts';
import type { DateKey, Exercise, RawLoad, Side } from '../types.ts';

export const BODYWEIGHT_SNAPSHOT_MAX_AGE_DAYS = 14;

export interface StartCommand { commandId: string; scheduledWorkoutId: string }
export interface CompleteSetCommand {
  commandId: string; sessionExerciseId: string; setIndex: number;
  setType?: 'warmup' | 'working' | 'dropset' | 'backoff'; side?: Side;
  raw: RawLoad; reps: number; rir?: number | null;
  excludeFromPr?: boolean; painFlag?: boolean; formBreakdownFlag?: boolean; note?: string | null;
  /** Verilmezse hareketin şablon dinlenme süresi kullanılır; 0 = sayaç başlatma. */
  restSeconds?: number;
}
export interface FinishCommand {
  commandId: string;
  origin?: 'workoutScreen' | 'resumeCard';
  /** Kullanıcı "Bugün burada bitir" dedi; kalan hareketler atlanmış sayılmaz. */
  finishHere?: boolean;
}
export interface CancelCommand { commandId: string; origin?: 'workoutScreen' | 'resumeCard' }

export interface ActiveWorkoutSnapshot {
  session: WorkoutSessionRow;
  exercises: Array<SessionExerciseRow & {
    loggedWorkingSets: number;
    prefill: { load: RawLoad | null; reps: number | null; rir: number | null; source: 'draft' | 'previousSet' | 'template' };
  }>;
  setLogs: SetLogRow[];
  restTimer: RestTimerView | null;
}

export interface FinishResult {
  status: 'completed' | 'partial';
  remainingExerciseIds: string[];
  decisionRequired: boolean;
}

export interface ActiveSessionDeps {
  db: Db;
  clock: Clock;
  scheduler: Scheduler;
  restTimers: RestTimerService;
  catalog: () => Promise<ReadonlyMap<string, Exercise>>;
  newId?: IdGenerator;
}

export class ActiveSessionService {
  readonly #db: Db;
  readonly #clock: Clock;
  readonly #scheduler: Scheduler;
  readonly #rest: RestTimerService;
  readonly #catalog: () => Promise<ReadonlyMap<string, Exercise>>;
  readonly #newId: IdGenerator;

  constructor(d: ActiveSessionDeps) {
    this.#db = d.db; this.#clock = d.clock; this.#scheduler = d.scheduler;
    this.#rest = d.restTimers; this.#catalog = d.catalog; this.#newId = d.newId ?? uuid;
  }

  // ------------------------------------------------------------- start
  async start(cmd: StartCommand): Promise<CommandResult<{ sessionId: string }>> {
    return this.#db.withTransaction(async (tx) => {
      const now = this.#clock.nowUtc();
      const iso = now.toISOString();
      if (!(await claimCommand(tx, cmd.commandId, 'startSession', iso))) {
        const active = await sessions.findActive(tx);
        return duplicate(active ? { sessionId: active.id } : undefined);
      }
      if (await sessions.findActive(tx)) throw new ActiveSessionExistsError();

      const swId = await this.#scheduler.markInProgress(tx, cmd.scheduledWorkoutId);
      const sw = await scheduled.get(tx, swId);
      const tz = this.#clock.timeZone();
      const sessionId = this.#newId();

      const cutoff = addDays(localDateKey(now, tz), -BODYWEIGHT_SNAPSHOT_MAX_AGE_DAYS);
      const bw = await weightLogs.latestWithin(tx, cutoff);

      await sessions.insert(tx, {
        id: sessionId, program_id: sw.program_id, scheduled_workout_id: sw.id,
        workout_template_id: sw.workout_template_id, status: 'active',
        started_at_utc: iso, completed_at_utc: null, cancelled_at_utc: null,
        calendar_date_key: localDateKey(now, tz),          // R113.3: başlangıç günü
        calendar_date_overridden: 0, time_zone: tz, utc_offset_minutes: utcOffsetMinutes(now, tz),
        bodyweight_kg_snapshot: bw?.weight_kg ?? null, ended_reason: null, note: null,
        created_at_utc: iso, updated_at_utc: iso,
      });

      // Kısmi devam planıysa yalnızca kalan hareketler eklenir (02 §6.3).
      const remaining = sw.remaining_exercise_ids_json
        ? new Set(JSON.parse(sw.remaining_exercise_ids_json) as string[]) : null;
      const tpl = await templates.exercises(tx, sw.workout_template_id);
      let order = 0;
      for (const te of tpl) {
        if (remaining && !remaining.has(te.exercise_id)) continue;
        await sessionExercises.insert(tx, {
          id: this.#newId(), session_id: sessionId, order_index: order++, exercise_id: te.exercise_id,
          original_exercise_id: null, substitution_reason: null, tracking_mode: 'bothSame',
          status: 'pending', planned_working_sets: te.working_sets, planned_warmup_sets: te.warmup_sets,
          rep_min: te.rep_min, rep_max: te.rep_max, target_rir: te.target_rir, rest_seconds: te.rest_seconds,
          draft_load_json: null, draft_reps: null, draft_rir: null, note: null, updated_at_utc: iso,
        });
      }
      if (order === 0) throw new ValidationError('Bu antrenmanda hareket kalmamış.', 'şablon boş');
      return applied({ sessionId });
    });
  }

  // ------------------------------------------------------------- completeSet
  async completeSet(cmd: CompleteSetCommand): Promise<CommandResult<{ setLogId: string; prs: PersonalRecordDraft[]; restTimerId: string | null }>> {
    const out = await this.#db.withTransaction(async (tx) => {
      const now = this.#clock.nowUtc();
      const iso = now.toISOString();
      if (!(await claimCommand(tx, cmd.commandId, 'completeSet', iso))) {
        const existing = await setLogs.byCommandId(tx, cmd.commandId);
        return { result: duplicate(existing ? { setLogId: existing.id, prs: [], restTimerId: null } : undefined), cancelIds: [] as string[], timer: null };
      }
      const session = await this.#requireActive(tx);
      const se = await sessionExercises.get(tx, cmd.sessionExerciseId);
      if (se.session_id !== session.id) throw new ValidationError('Bu hareket bu antrenmana ait değil.', 'oturum uyuşmazlığı');
      if (!(cmd.reps >= 0)) throw new ValidationError('Tekrar sayısı geçersiz.', `reps=${cmd.reps}`);

      const catalog = await this.#catalog();
      const exercise = catalog.get(se.exercise_id);
      if (!exercise) throw new ValidationError('Hareket katalogda bulunamadı.', se.exercise_id);

      const setType = cmd.setType ?? 'working';
      const side: Side = cmd.side ?? (se.tracking_mode === 'separate' ? 'left' : 'both');
      const raw: RawLoad = { ...cmd.raw, bodyweightKgSnapshot: cmd.raw.bodyweightKgSnapshot ?? session.bodyweight_kg_snapshot };
      const setLogId = this.#newId();

      await setLogs.insert(tx, {
        id: setLogId, command_id: cmd.commandId, session_id: session.id,
        session_exercise_id: se.id, exercise_id: se.exercise_id,
        set_index: cmd.setIndex, set_type: setType, side,
        load_kg: raw.loadKg ?? null, assistance_kg: raw.assistanceKg ?? null,
        machine_level: raw.machineLevel ?? null, band_rank: raw.bandRank ?? null,
        distance_cm: raw.distanceCm ?? null, bodyweight_kg_snapshot: raw.bodyweightKgSnapshot ?? null,
        reps: cmd.reps, rir: cmd.rir ?? null, rpe: null,
        exclude_from_pr: cmd.excludeFromPr ? 1 : 0, pain_flag: cmd.painFlag ? 1 : 0,
        form_breakdown_flag: cmd.formBreakdownFlag ? 1 : 0, discarded: 0,
        completed_at_utc: iso,
        local_date_key: session.calendar_date_key,        // I4: yazma anı değil, oturum günü
        time_zone: this.#clock.timeZone(), note: cmd.note ?? null,
      });
      await sessionExercises.patch(tx, se.id, { status: 'inProgress', draft_load_json: null, draft_reps: null, draft_rir: null }, iso);

      const prs = await this.#detectPrs(tx, {
        setLogId, sessionId: session.id, exercise, side, raw, reps: cmd.reps,
        setType, excludeFromPr: !!cmd.excludeFromPr, localDateKey: session.calendar_date_key, iso,
      });

      const duration = cmd.restSeconds ?? se.rest_seconds;
      let timer: { id: string; startedAtUtc: string; duration: number } | null = null;
      let cancelIds: string[] = [];
      if (setType !== 'warmup' && duration > 0) {
        const started = await this.#rest.startInTx(tx, {
          sessionId: session.id, sessionExerciseId: se.id, setLogId, durationSeconds: duration,
        });
        cancelIds = started.cancelNotificationIds;
        timer = { id: started.id, startedAtUtc: iso, duration };
      }
      return { result: applied({ setLogId, prs, restTimerId: timer?.id ?? null }), cancelIds, timer };
    });

    // Yan etkiler commit SONRASI: bildirim planı DB tutarlılığını etkilemez.
    await this.#rest.cancelNotifications(out.cancelIds);
    if (out.timer) {
      await this.#db.withTransaction((tx) => this.#rest.attachNotification(tx, out.timer!.id, out.timer!.startedAtUtc, out.timer!.duration));
    }
    return out.result;
  }

  // ------------------------------------------------------------- düzenleme
  async editSet(cmd: { commandId: string; setLogId: string; reps?: number; rir?: number | null; raw?: RawLoad; excludeFromPr?: boolean }): Promise<CommandResult<void>> {
    return this.#db.withTransaction(async (tx) => {
      const iso = this.#clock.nowUtc().toISOString();
      if (!(await claimCommand(tx, cmd.commandId, 'editSet', iso))) return duplicate<void>();
      const before = await setLogs.get(tx, cmd.setLogId);
      const patch: Partial<SetLogRow> = {};
      if (cmd.reps !== undefined) patch.reps = cmd.reps;
      if (cmd.rir !== undefined) patch.rir = cmd.rir;
      if (cmd.excludeFromPr !== undefined) patch.exclude_from_pr = cmd.excludeFromPr ? 1 : 0;
      if (cmd.raw) {
        patch.load_kg = cmd.raw.loadKg ?? null;
        patch.assistance_kg = cmd.raw.assistanceKg ?? null;
        patch.machine_level = cmd.raw.machineLevel ?? null;
        patch.band_rank = cmd.raw.bandRank ?? null;
        patch.distance_cm = cmd.raw.distanceCm ?? null;
      }
      await setLogs.patch(tx, cmd.setLogId, patch);
      const after = await setLogs.get(tx, cmd.setLogId);
      await setLogs.insertRevision(tx, { id: this.#newId(), setLogId: cmd.setLogId, before, after, revisedAtUtc: iso });
      // Düzenlenen set PR üretmiş olabilir: zincir bozulmasın diye geçersiz kıl.
      await tx.exec('UPDATE personal_records SET voided = 1 WHERE set_log_id = ?', [cmd.setLogId]);
      return applied<void>(undefined);
    });
  }

  /** Doğal olarak idempotent (last-write-wins): command_log'a yazılmaz. */
  async draftInput(input: { sessionExerciseId: string; load?: RawLoad | null; reps?: number | null; rir?: number | null }): Promise<void> {
    await this.#db.withTransaction(async (tx) => {
      await sessionExercises.patch(tx, input.sessionExerciseId, {
        draft_load_json: input.load ? JSON.stringify(input.load) : null,
        draft_reps: input.reps ?? null, draft_rir: input.rir ?? null,
      }, this.#clock.nowUtc().toISOString());
    });
  }

  async skipExercise(cmd: { commandId: string; sessionExerciseId: string }): Promise<CommandResult<void>> {
    return this.#db.withTransaction(async (tx) => {
      const iso = this.#clock.nowUtc().toISOString();
      if (!(await claimCommand(tx, cmd.commandId, 'skipExercise', iso))) return duplicate<void>();
      await sessionExercises.patch(tx, cmd.sessionExerciseId, { status: 'skipped' }, iso);
      return applied<void>(undefined);
    });
  }

  /** Set loglanmışsa reddedilir; geçmiş bozulmasın diye yeni hareket eklenir (§8.4). */
  async substituteExercise(cmd: { commandId: string; sessionExerciseId: string; newExerciseId: string; reason?: string }): Promise<CommandResult<void>> {
    return this.#db.withTransaction(async (tx) => {
      const iso = this.#clock.nowUtc().toISOString();
      if (!(await claimCommand(tx, cmd.commandId, 'substituteExercise', iso))) return duplicate<void>();
      const se = await sessionExercises.get(tx, cmd.sessionExerciseId);
      const n = await tx.get<{ n: number }>('SELECT COUNT(*) n FROM set_logs WHERE session_exercise_id = ?', [se.id]);
      if ((n?.n ?? 0) > 0) throw new SetAlreadyLoggedError();
      await sessionExercises.patch(tx, se.id, {
        exercise_id: cmd.newExerciseId,
        original_exercise_id: se.original_exercise_id ?? se.exercise_id,   // R99.5: geçmiş kaybolmaz
        substitution_reason: cmd.reason ?? null,
      }, iso);
      return applied<void>(undefined);
    });
  }

  // ------------------------------------------------------------- finish / cancel
  async finish(cmd: FinishCommand): Promise<CommandResult<FinishResult>> {
    const out = await this.#db.withTransaction(async (tx) => {
      const iso = this.#clock.nowUtc().toISOString();
      if (!(await claimCommand(tx, cmd.commandId, 'finishSession', iso))) {
        return { result: duplicate<FinishResult>(), cancelIds: [] as string[] };
      }
      const session = await this.#requireActive(tx);
      const rows = await sessionExercises.forSession(tx, session.id);
      const counts = await this.#workingSetCounts(tx, session.id);

      const incomplete = rows.filter((r) => r.status !== 'skipped'
        && (counts.get(r.id) ?? 0) < r.planned_working_sets);
      const status: 'completed' | 'partial' = incomplete.length === 0 ? 'completed' : 'partial';
      const remainingExerciseIds = incomplete.map((r) => r.original_exercise_id ?? r.exercise_id);

      const cancelIds = await this.#rest.closeRunningInTx(tx);
      await sessions.patch(tx, session.id, {
        status: status === 'completed' ? 'completed' : 'partial',
        completed_at_utc: iso,
        ended_reason: cmd.origin === 'resumeCard' ? 'resumeCardFinish'
          : status === 'completed' ? 'allDone' : 'finishHereToday',
      }, iso);
      await sessionExercises.clearDrafts(tx, session.id, iso);
      for (const r of rows) {
        if (r.status !== 'skipped' && (counts.get(r.id) ?? 0) >= r.planned_working_sets) {
          await sessionExercises.patch(tx, r.id, { status: 'done' }, iso);
        }
      }

      if (session.scheduled_workout_id) {
        await this.#scheduler.finish(tx, {
          scheduledWorkoutId: session.scheduled_workout_id,
          outcome: status === 'completed' ? 'completed' : 'partiallyCompleted',
          sessionCalendarDateKey: session.calendar_date_key,
          remainingExerciseIds,
        });
      }
      return {
        result: applied<FinishResult>({ status, remainingExerciseIds, decisionRequired: status === 'partial' }),
        cancelIds,
      };
    });
    await this.#rest.cancelNotifications(out.cancelIds);
    return out.result;
  }

  async cancel(cmd: CancelCommand): Promise<CommandResult<void>> {
    const out = await this.#db.withTransaction(async (tx) => {
      const iso = this.#clock.nowUtc().toISOString();
      if (!(await claimCommand(tx, cmd.commandId, 'cancelSession', iso))) {
        return { result: duplicate<void>(), cancelIds: [] as string[] };
      }
      const session = await this.#requireActive(tx);
      const cancelIds = await this.#rest.closeRunningInTx(tx);
      await sessions.patch(tx, session.id, {
        status: 'cancelled', cancelled_at_utc: iso,
        ended_reason: cmd.origin === 'resumeCard' ? 'resumeCardCancel' : 'userCancel',
      }, iso);
      await setLogs.discardSession(tx, session.id);          // silinmez, işaretlenir
      await personalRecords.voidSession(tx, session.id);
      await sessionExercises.clearDrafts(tx, session.id, iso);
      if (session.scheduled_workout_id) {
        await this.#scheduler.reopenAfterCancel(tx, session.scheduled_workout_id);  // sıra ilerlemez
      }
      return { result: applied<void>(undefined), cancelIds };
    });
    await this.#rest.cancelNotifications(out.cancelIds);
    return out.result;
  }

  async decidePartial(cmd: { commandId: string; scheduledWorkoutId: string; decision: 'countAsDone' | 'continueLater'; plannedDateKey?: DateKey }): Promise<CommandResult<{ continuationId?: string }>> {
    return this.#db.withTransaction(async (tx) => {
      const iso = this.#clock.nowUtc().toISOString();
      if (!(await claimCommand(tx, cmd.commandId, 'decidePartial', iso))) return duplicate<{ continuationId?: string }>();
      const sw = await scheduled.get(tx, cmd.scheduledWorkoutId);
      const session = await tx.get<WorkoutSessionRow>(
        `SELECT * FROM workout_sessions WHERE scheduled_workout_id = ? AND status = 'partial'
         ORDER BY completed_at_utc DESC LIMIT 1`, [sw.id]);
      const r = await this.#scheduler.decidePartial(tx, {
        scheduledWorkoutId: sw.id, decision: cmd.decision,
        sessionCalendarDateKey: session?.calendar_date_key ?? this.#clock.todayKey(),
        ...(cmd.plannedDateKey ? { plannedDateKey: cmd.plannedDateKey } : {}),
      });
      return applied(r.continuationId ? { continuationId: r.continuationId } : {});
    });
  }

  /** R113.4: oturumun günü değişince ona bağlı kayıtlar da taşınır. */
  async overrideCalendarDate(cmd: { commandId: string; sessionId: string; dateKey: DateKey }): Promise<CommandResult<void>> {
    return this.#db.withTransaction(async (tx) => {
      const iso = this.#clock.nowUtc().toISOString();
      if (!(await claimCommand(tx, cmd.commandId, 'overrideCalendarDate', iso))) return duplicate<void>();
      const s = await sessions.get(tx, cmd.sessionId);
      const startKey = localDateKey(new Date(s.started_at_utc), s.time_zone);
      const today = this.#clock.todayKey();
      if (cmd.dateKey < addDays(startKey, -1) || cmd.dateKey > today) {
        throw new ValidationError('Bu tarih seçilemez.', `${cmd.dateKey} aralık dışı`);
      }
      await sessions.patch(tx, s.id, { calendar_date_key: cmd.dateKey, calendar_date_overridden: 1 }, iso);
      await setLogs.moveSessionDay(tx, s.id, cmd.dateKey);
      await personalRecords.moveSessionDay(tx, s.id, cmd.dateKey);
      return applied<void>(undefined);
    });
  }

  // ------------------------------------------------------------- okuma
  async findActive(): Promise<WorkoutSessionRow | null> {
    return this.#db.withTransaction(async (tx) => (await sessions.findActive(tx)) ?? null);
  }

  async hydrate(): Promise<ActiveWorkoutSnapshot | null> {
    return this.#db.withTransaction(async (tx) => {
      const session = await sessions.findActive(tx);
      if (!session) return null;
      const rows = await sessionExercises.forSession(tx, session.id);
      const logs = await setLogs.forSession(tx, session.id);
      const counts = await this.#workingSetCounts(tx, session.id);
      const restTimer = await this.#rest.current(tx);
      return {
        session,
        setLogs: logs,
        restTimer,
        exercises: rows.map((r) => {
          const mine = logs.filter((l) => l.session_exercise_id === r.id);
          const last = mine.at(-1);
          const prefill = r.draft_reps != null || r.draft_load_json != null
            ? { load: r.draft_load_json ? (JSON.parse(r.draft_load_json) as RawLoad) : null, reps: r.draft_reps, rir: r.draft_rir, source: 'draft' as const }
            : last
              ? { load: rawOf(last), reps: last.reps, rir: last.rir, source: 'previousSet' as const }
              : { load: null, reps: null, rir: r.target_rir, source: 'template' as const };
          return { ...r, loggedWorkingSets: counts.get(r.id) ?? 0, prefill };
        }),
      };
    });
  }

  // ------------------------------------------------------------- yardımcılar
  async #requireActive(tx: Tx): Promise<WorkoutSessionRow> {
    const s = await sessions.findActive(tx);
    if (!s) throw new SessionNotActiveError('aktif oturum yok');
    return s;
  }

  async #workingSetCounts(tx: Tx, sessionId: string): Promise<Map<string, number>> {
    const rows = await tx.all<{ session_exercise_id: string; n: number }>(
      `SELECT session_exercise_id, COUNT(DISTINCT set_index) n FROM set_logs
       WHERE session_id = ? AND set_type = 'working' AND discarded = 0
       GROUP BY session_exercise_id`, [sessionId]);
    return new Map(rows.map((r) => [r.session_exercise_id, r.n]));
  }

  async #detectPrs(tx: Tx, i: {
    setLogId: string; sessionId: string; exercise: Exercise; side: Side; raw: RawLoad;
    reps: number; setType: string; excludeFromPr: boolean; localDateKey: DateKey; iso: string;
  }): Promise<PersonalRecordDraft[]> {
    const current = await this.#currentPrs(tx, i.exercise.id, i.side, i.raw, i.exercise);
    const drafts = detectForSet({
      setLogId: i.setLogId, sessionId: i.sessionId, exerciseId: i.exercise.id, side: i.side,
      setType: i.setType as 'working', raw: i.raw, reps: i.reps,
      excludeFromPr: i.excludeFromPr, discarded: false,
    }, i.exercise, current);

    for (const d of drafts) {
      const id = this.#newId();
      await tx.exec(
        `INSERT INTO personal_records (id, exercise_id, side, pr_type, set_log_id, session_id,
          effective_load, reps, estimated_1rm, session_volume, achieved_at_utc, local_date_key, voided)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`,
        [id, d.exerciseId, d.side, d.prType, d.setLogId ?? null, d.sessionId,
          d.effectiveLoad ?? null, d.reps ?? null, d.estimated1rm ?? null, null, i.iso, i.localDateKey]);
      await tx.exec(
        `UPDATE personal_records SET superseded_by_id = ?
         WHERE exercise_id = ? AND side = ? AND pr_type = ? AND id != ? AND voided = 0 AND superseded_by_id IS NULL`,
        [id, d.exerciseId, d.side, d.prType, id]);
    }
    return drafts;
  }

  async #currentPrs(tx: Tx, exerciseId: string, side: Side, raw: RawLoad, exercise: Exercise): Promise<CurrentPrs> {
    const best = await tx.get<{ effective_load: number | null; estimated_1rm: number | null; pr_type: string }>(
      `SELECT effective_load, estimated_1rm, pr_type FROM personal_records
       WHERE exercise_id = ? AND side = ? AND pr_type = 'loadPr' AND voided = 0 AND superseded_by_id IS NULL`,
      [exerciseId, side]);
    const e1 = await tx.get<{ estimated_1rm: number }>(
      `SELECT estimated_1rm FROM personal_records
       WHERE exercise_id = ? AND side = ? AND pr_type = 'estimatedPerformancePr' AND voided = 0 AND superseded_by_id IS NULL`,
      [exerciseId, side]);

    const eff = effectiveLoad(raw, exercise);
    const repsAtLoad = new Map<number, number>();
    if (eff != null) {
      const r = await tx.get<{ best: number | null }>(
        `SELECT MAX(reps) best FROM v_set_effective_load
         WHERE exercise_id = ? AND side = ? AND set_type = 'working' AND exclude_from_pr = 0
           AND effective_load = ?`, [exerciseId, side, eff]);
      if (r?.best != null) repsAtLoad.set(eff, r.best);
    }
    const noScale = eff == null
      ? await tx.get<{ best: number | null }>(
        `SELECT MAX(reps) best FROM v_set_effective_load
         WHERE exercise_id = ? AND side = ? AND set_type = 'working' AND exclude_from_pr = 0
           AND effective_load IS NULL`, [exerciseId, side])
      : undefined;

    return {
      loadPr: best?.effective_load != null ? { effectiveLoad: best.effective_load, raw } : null,
      repsAtLoad, bestRepsNoScale: noScale?.best ?? null, estimated1rm: e1?.estimated_1rm ?? null,
    };
  }
}

function rawOf(s: SetLogRow): RawLoad {
  return {
    loadKg: s.load_kg, assistanceKg: s.assistance_kg, machineLevel: s.machine_level,
    bandRank: s.band_rank, distanceCm: s.distance_cm, bodyweightKgSnapshot: s.bodyweight_kg_snapshot,
  };
}
