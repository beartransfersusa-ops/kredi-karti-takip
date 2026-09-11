// Planlama, sıra ve dondurma — docs/v90/04-domain-engines.md §1, 02 §6, ADR-001.
//
// Değişmezler:
//   I1  Aynı anda en fazla bir açık plan (ux_sched_one_open).
//   I2  training_sequence_index YALNIZCA advance() ile ve her zaman bir
//       sequence_events kaydıyla birlikte değişir (R88.6).
//   I3  Kaçırılan antrenman sırayı ilerletmez; missed saklanmaz, türetilir.
//   I4  Karar bekleyen kısmi antrenman varken yeni plan oluşturulmaz.

import type { Tx } from '../../core/db/types.ts';
import type { Clock } from '../../core/clock/dateKey.ts';
import { addDays, dayOfWeek, maxKey } from '../../core/clock/dateKey.ts';
import type { IdGenerator } from '../../core/id.ts';
import { uuid } from '../../core/id.ts';
import {
  pauses, programs, scheduled, sequenceEvents, sessions, templates,
} from '../../core/db/repositories.ts';
import type { ProgramRow, ScheduledWorkoutRow } from '../../core/db/repositories.ts';
import { advanceSequence } from './TrainingSequence.ts';
import {
  ActiveSessionExistsError, InvalidRescheduleDateError, InvalidTransitionError,
  PendingPartialDecisionError, ProgramNotActiveError, ProgramNotPausedError,
} from './errors.ts';
import type { DateKey, PauseReason, SequenceAdvanceCause } from '../types.ts';

export type RescheduleReason = 'moveToToday' | 'moveToDate' | 'resume' | 'partialContinuation';
export type EnsureOutcome = 'created' | 'alreadyOpen' | 'pendingPartialDecision' | 'programNotActive' | 'exhausted' | 'notStarted';

export interface EnsurePlannedResult { outcome: EnsureOutcome; scheduledWorkoutId?: string }
export interface MissedWorkout {
  scheduledWorkoutId: string;
  workoutTemplateId: string;
  plannedDateKey: DateKey;
  daysLate: number;
  remainingExerciseIds: string[] | null;
  /** Saat dilimi değişimi bu planı bir anda geciktirmiş olabilir (02 §5.5). */
  timeZoneShifted: boolean;
}

export interface SchedulerDeps {
  clock: Clock;
  newId?: IdGenerator;
  /** Tercih edilen antrenman günleri (0=Pazar … 6=Cumartesi); boş = her gün. */
  preferredWorkoutDays?: () => Promise<number[]>;
}

export class Scheduler {
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #prefs: () => Promise<number[]>;

  constructor(deps: SchedulerDeps) {
    this.#clock = deps.clock;
    this.#newId = deps.newId ?? uuid;
    this.#prefs = deps.preferredWorkoutDays ?? (async () => []);
  }

  // ------------------------------------------------------------- T1
  async ensurePlanned(tx: Tx, programId: string, earliest?: DateKey): Promise<EnsurePlannedResult> {
    const p = await programs.get(tx, programId);
    if (p.status !== 'active') return { outcome: 'programNotActive' };

    const open = await scheduled.findOpen(tx, programId);
    if (open) return { outcome: 'alreadyOpen', scheduledWorkoutId: open.id };

    const pending = await scheduled.findPendingPartial(tx, programId);
    if (pending) return { outcome: 'pendingPartialDecision', scheduledWorkoutId: pending.id };

    const tpl = await templates.bySequenceOrder(tx, p.program_template_id, p.training_sequence_index);
    if (!tpl) return { outcome: 'exhausted' };          // lineer programda şablonlar bitti

    const today = this.#clock.todayKey();
    const base = maxKey(maxKey(today, p.start_date_key), earliest ?? today);
    const plannedDateKey = await this.#firstPreferredDayOnOrAfter(base);
    const now = this.#clock.nowUtc().toISOString();
    const id = this.#newId();
    await scheduled.insert(tx, {
      id, program_id: programId, sequence_index: p.training_sequence_index,
      workout_template_id: tpl.id, planned_date_key: plannedDateKey, status: 'planned',
      rescheduled_to_id: null, rescheduled_from_id: null, reschedule_reason: null,
      remaining_exercise_ids_json: null, partial_decision: null, resolved_at_utc: null,
      created_at_utc: now, updated_at_utc: now,
    });
    return { outcome: 'created', scheduledWorkoutId: id };
  }

  // ------------------------------------------------------------- T2
  async reschedule(tx: Tx, scheduledWorkoutId: string, newDateKey: DateKey, reason: RescheduleReason): Promise<string> {
    const sw = await scheduled.get(tx, scheduledWorkoutId);
    if (sw.status !== 'planned') throw new InvalidTransitionError(sw.status, 'rescheduled');
    if (newDateKey < this.#clock.todayKey()) throw new InvalidRescheduleDateError(newDateKey);

    const now = this.#clock.nowUtc().toISOString();
    // SIRA ÖNEMLİ: önce eskiyi kapat, sonra yeniyi aç (ux_sched_one_open).
    await scheduled.patch(tx, sw.id, { status: 'rescheduled', resolved_at_utc: now }, now);
    const id = this.#newId();
    await scheduled.insert(tx, {
      ...sw, id, planned_date_key: newDateKey, status: 'planned',
      rescheduled_from_id: sw.id, rescheduled_to_id: null, reschedule_reason: reason,
      resolved_at_utc: null, created_at_utc: now, updated_at_utc: now,
    });
    await scheduled.patch(tx, sw.id, { rescheduled_to_id: id }, now);
    return id;
  }

  // ------------------------------------------------------------- T3
  async markInProgress(tx: Tx, scheduledWorkoutId: string): Promise<string> {
    let sw = await scheduled.get(tx, scheduledWorkoutId);
    if (sw.status !== 'planned') throw new InvalidTransitionError(sw.status, 'inProgress');
    const p = await programs.get(tx, sw.program_id);
    if (p.status !== 'active') throw new ProgramNotActiveError();
    if (await sessions.findActive(tx)) throw new ActiveSessionExistsError();

    const today = this.#clock.todayKey();
    if (sw.planned_date_key !== today) {
      // Değişmez: açık planın planned_date_key'i oturumun calendar_date_key'iyle aynıdır.
      const movedId = await this.reschedule(tx, sw.id, today, 'moveToToday');
      sw = await scheduled.get(tx, movedId);
    }
    await scheduled.patch(tx, sw.id, { status: 'inProgress' }, this.#clock.nowUtc().toISOString());
    return sw.id;
  }

  // ------------------------------------------------------------- T4 / T5
  async finish(tx: Tx, input: {
    scheduledWorkoutId: string;
    outcome: 'completed' | 'partiallyCompleted';
    sessionCalendarDateKey: DateKey;
    remainingExerciseIds?: string[];
  }): Promise<{ advanced: boolean }> {
    const sw = await scheduled.get(tx, input.scheduledWorkoutId);
    if (sw.status !== 'inProgress') throw new InvalidTransitionError(sw.status, input.outcome);
    const now = this.#clock.nowUtc().toISOString();

    if (input.outcome === 'completed') {
      await scheduled.patch(tx, sw.id, { status: 'completed', resolved_at_utc: now }, now);
      await this.#advance(tx, sw, 'completed');
      await this.ensurePlanned(tx, sw.program_id, this.#earliestAfter(input.sessionCalendarDateKey));
      return { advanced: true };
    }
    // Kalan hareketler BİTİRME transaction'ında yazılır: karar ekranında
    // uygulama kapansa bile bilgi kaybolmaz (02 §6.3).
    await scheduled.patch(tx, sw.id, {
      status: 'partiallyCompleted', partial_decision: null,
      remaining_exercise_ids_json: JSON.stringify(input.remainingExerciseIds ?? []),
    }, now);
    return { advanced: false };
  }

  // ------------------------------------------------------------- T6 / T7
  async decidePartial(tx: Tx, input: {
    scheduledWorkoutId: string;
    decision: 'countAsDone' | 'continueLater';
    sessionCalendarDateKey: DateKey;
    plannedDateKey?: DateKey;
  }): Promise<{ advanced: boolean; continuationId?: string }> {
    const sw = await scheduled.get(tx, input.scheduledWorkoutId);
    if (sw.status !== 'partiallyCompleted' || sw.partial_decision !== null) {
      throw new InvalidTransitionError(sw.status, `partial:${input.decision}`);
    }
    const now = this.#clock.nowUtc().toISOString();

    if (input.decision === 'countAsDone') {
      await scheduled.patch(tx, sw.id, { partial_decision: 'countAsDone', resolved_at_utc: now }, now);
      await this.#advance(tx, sw, 'partialCountedDone');
      await this.ensurePlanned(tx, sw.program_id, this.#earliestAfter(input.sessionCalendarDateKey));
      return { advanced: true };
    }

    const remaining = JSON.parse(sw.remaining_exercise_ids_json ?? '[]') as string[];
    if (remaining.length === 0) throw new InvalidTransitionError(sw.status, 'partial:continueLater(empty)');
    const today = this.#clock.todayKey();
    const chosen = input.plannedDateKey && input.plannedDateKey > today
      ? input.plannedDateKey
      : await this.#firstPreferredDayOnOrAfter(addDays(today, 1));

    await scheduled.patch(tx, sw.id, { partial_decision: 'continueLater', resolved_at_utc: now }, now);
    const continuationId = this.#newId();
    await scheduled.insert(tx, {
      ...sw, id: continuationId, planned_date_key: chosen, status: 'planned',
      rescheduled_from_id: sw.id, rescheduled_to_id: null, reschedule_reason: 'partialContinuation',
      partial_decision: null, resolved_at_utc: null, created_at_utc: now, updated_at_utc: now,
    });
    await scheduled.patch(tx, sw.id, { rescheduled_to_id: continuationId }, now);
    return { advanced: false, continuationId };       // sıra DEĞİŞMEZ
  }

  // ------------------------------------------------------------- T8
  async skip(tx: Tx, scheduledWorkoutId: string): Promise<void> {
    const sw = await scheduled.get(tx, scheduledWorkoutId);
    if (sw.status !== 'planned') throw new InvalidTransitionError(sw.status, 'skipped');
    const now = this.#clock.nowUtc().toISOString();
    await scheduled.patch(tx, sw.id, { status: 'skipped', resolved_at_utc: now }, now);
    await this.#advance(tx, sw, 'skipped');
    await this.ensurePlanned(tx, sw.program_id);
  }

  // ------------------------------------------------------------- T9
  async reopenAfterCancel(tx: Tx, scheduledWorkoutId: string): Promise<void> {
    const sw = await scheduled.get(tx, scheduledWorkoutId);
    if (sw.status !== 'inProgress') throw new InvalidTransitionError(sw.status, 'planned');
    // Yerinde geri açma: yeni satır yok, tarih korunur, sıra ilerlemez.
    await scheduled.patch(tx, sw.id, { status: 'planned' }, this.#clock.nowUtc().toISOString());
  }

  // ------------------------------------------------------------- T10 (türetilmiş)
  async detectMissed(tx: Tx, programId: string): Promise<MissedWorkout | null> {
    const p = await programs.get(tx, programId);
    if (p.status !== 'active') return null;                       // dondurmada uyarı üretilmez (R89.3)
    const open = await scheduled.findOpen(tx, programId);
    if (!open || open.status !== 'planned') return null;
    const today = this.#clock.todayKey();
    if (open.planned_date_key >= today) return null;
    const daysLate = daysBetweenKeys(open.planned_date_key, today);
    return {
      scheduledWorkoutId: open.id,
      workoutTemplateId: open.workout_template_id,
      plannedDateKey: open.planned_date_key,
      daysLate,
      remainingExerciseIds: open.remaining_exercise_ids_json
        ? (JSON.parse(open.remaining_exercise_ids_json) as string[]) : null,
      timeZoneShifted: daysLate === 1 && p.start_time_zone !== this.#clock.timeZone(),
    };
  }

  // ------------------------------------------------------------- yardımcılar
  async #advance(tx: Tx, sw: ScheduledWorkoutRow, cause: SequenceAdvanceCause): Promise<void> {
    const p = await programs.get(tx, sw.program_id);
    const all = await templates.byProgramTemplate(tx, p.program_template_id);
    const isCyclic = await this.#isCyclic(tx, p);
    const r = advanceSequence(
      { trainingSequenceIndex: p.training_sequence_index, sequenceWraps: p.sequence_wraps },
      cause, all.length, isCyclic);
    const now = this.#clock.nowUtc().toISOString();
    await programs.setSequence(tx, p.id, r.trainingSequenceIndex, r.sequenceWraps, now);
    await sequenceEvents.insert(tx, {                              // I2: ilerleme her zaman denetim kaydıyla
      id: this.#newId(), programId: p.id, fromIndex: r.fromIndex,
      toIndex: r.trainingSequenceIndex, cause, scheduledWorkoutId: sw.id, occurredAtUtc: now,
    });
  }

  async #isCyclic(tx: Tx, p: ProgramRow): Promise<boolean> {
    const r = await tx.get<{ is_cyclic: number }>(
      'SELECT is_cyclic FROM program_templates WHERE id = ?', [p.program_template_id]);
    return (r?.is_cyclic ?? 1) === 1;
  }

  /** Tamamlanan antrenmanın gününe ikinci plan konmaz (A-15). */
  #earliestAfter(sessionCalendarDateKey: DateKey): DateKey {
    return maxKey(this.#clock.todayKey(), addDays(sessionCalendarDateKey, 1));
  }

  async #firstPreferredDayOnOrAfter(key: DateKey): Promise<DateKey> {
    const prefs = await this.#prefs();
    if (prefs.length === 0) return key;
    for (let i = 0; i < 7; i++) {
      const candidate = addDays(key, i);
      if (prefs.includes(dayOfWeek(candidate))) return candidate;
    }
    return key;
  }
}

// ---------------------------------------------------------------- PauseService
export class PauseService {
  readonly #clock: Clock;
  readonly #newId: IdGenerator;
  readonly #scheduler: Scheduler;

  constructor(deps: { clock: Clock; scheduler: Scheduler; newId?: IdGenerator }) {
    this.#clock = deps.clock;
    this.#scheduler = deps.scheduler;
    this.#newId = deps.newId ?? uuid;
  }

  async pause(tx: Tx, programId: string, reason?: PauseReason | null, note?: string | null): Promise<string> {
    const p = await programs.get(tx, programId);
    if (p.status !== 'active') throw new ProgramNotActiveError();
    if (await sessions.findActive(tx)) throw new ActiveSessionExistsError();
    if (await scheduled.findPendingPartial(tx, programId)) throw new PendingPartialDecisionError();

    const now = this.#clock.nowUtc().toISOString();
    const id = this.#newId();
    await pauses.insert(tx, {
      id, program_id: programId, reason: reason ?? null, note: note ?? null,
      started_at_utc: now, start_date_key: this.#clock.todayKey(),
      ended_at_utc: null, end_date_key: null, time_zone: this.#clock.timeZone(),
    });
    await programs.setStatus(tx, programId, 'paused', now);
    return id;
  }

  /** Sıra kaldığı yerden devam eder; açık plan bugüne taşınır (R89.4). */
  async resume(tx: Tx, programId: string): Promise<void> {
    const p = await programs.get(tx, programId);
    if (p.status !== 'paused') throw new ProgramNotPausedError();
    const now = this.#clock.nowUtc().toISOString();
    const open = await pauses.open(tx, programId);
    if (open) await pauses.close(tx, open.id, now, this.#clock.todayKey());
    await programs.setStatus(tx, programId, 'active', now);

    const plan = await scheduled.findOpen(tx, programId);
    const today = this.#clock.todayKey();
    if (plan && plan.status === 'planned' && plan.planned_date_key < today) {
      await this.#scheduler.reschedule(tx, plan.id, today, 'resume');
    } else if (!plan) {
      await this.#scheduler.ensurePlanned(tx, programId);
    }
  }
}

function daysBetweenKeys(a: DateKey, b: DateKey): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
