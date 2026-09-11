// Entegrasyon test tezgâhı: migrate edilmiş gerçek SQLite + seed + servisler.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeClock } from '../src/core/clock/dateKey.ts';
import { MigrationRunner } from '../src/core/db/MigrationRunner.ts';
import { NodeSqliteProvider } from '../src/core/db/NodeSqliteProvider.ts';
import { NodeFileStore } from '../src/core/db/NodeFileStore.ts';
import { nodeSha256 } from '../src/core/db/hash.ts';
import type { Db } from '../src/core/db/types.ts';
import { Scheduler, PauseService } from '../src/domain/program/Scheduler.ts';
import { ActiveSessionService } from '../src/domain/workout/ActiveSessionService.ts';
import { RestTimerService } from '../src/domain/workout/RestTimerService.ts';
import type { NotificationScheduler } from '../src/domain/workout/RestTimerService.ts';
import type { Exercise } from '../src/domain/types.ts';
import { EXERCISES } from './fixtures.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

/** Planlanan/iptal edilen bildirimleri kaydeden sahte planlayıcı. */
export class FakeNotifications implements NotificationScheduler {
  scheduled: Array<{ id: string; atUtc: string }> = [];
  cancelled: string[] = [];
  #n = 0;
  async schedule(atUtc: string) { const id = `notif-${++this.#n}`; this.scheduled.push({ id, atUtc }); return id; }
  async cancel(id: string) { this.cancelled.push(id); }
}

export interface Harness {
  db: Db;
  clock: FakeClock;
  scheduler: Scheduler;
  pauseService: PauseService;
  session: ActiveSessionService;
  restTimers: RestTimerService;
  notifications: FakeNotifications;
  programId: string;
  close: () => Promise<void>;
  /** Deterministik id üretici — testlerde okunabilir kimlikler. */
  ids: () => string;
}

export async function makeHarness(opts: {
  nowIso?: string; tz?: string; startDateKey?: string;
  preferredWorkoutDays?: number[]; calendarMode?: 'strictCalendar' | 'activeDays';
} = {}): Promise<Harness> {
  const clock = new FakeClock(opts.nowIso ?? '2026-09-07T05:00:00.000Z', opts.tz ?? 'Europe/Istanbul');
  const runner = new MigrationRunner({
    provider: new NodeSqliteProvider(':memory:'), files: new NodeFileStore(), clock, hash: nodeSha256,
  });
  const { db } = await runner.run();

  let n = 0;
  const ids = () => `id-${String(++n).padStart(4, '0')}`;

  await db.withTransaction(async (tx) => {
    const now = clock.nowUtc().toISOString();
    // katalog
    for (const e of EXERCISES as Exercise[]) {
      await tx.exec(
        `INSERT INTO exercises (id,name,name_tr,primary_muscle,secondary_muscles_json,movement_pattern,
          equipment_json,lengthened_bias,skill_level,joint_stress_json,load_progression_type,is_unilateral,
          volume_multiplier,default_increment_kg,cues_json,created_at_utc,updated_at_utc)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [e.id, e.name, e.nameTr, e.primaryMuscle, JSON.stringify(e.secondaryMuscles), e.movementPattern,
          JSON.stringify(e.equipment), e.lengthenedBias, e.skillLevel, JSON.stringify(e.jointStressProfile),
          e.loadProgressionType, e.isUnilateral ? 1 : 0, e.volumeMultiplier, e.defaultIncrementKg ?? null,
          JSON.stringify(e.cues), now, now]);
    }
    // program şablonu
    const prog = readJson('data/programs/v90.json');
    await tx.exec('INSERT INTO program_templates (id,name,version,is_cyclic,created_at_utc) VALUES (?,?,?,?,?)',
      [prog.id, prog.name, prog.version, prog.isCyclic ? 1 : 0, now]);
    for (const t of prog.workoutTemplates) {
      await tx.exec(
        `INSERT INTO workout_templates (id,program_template_id,sequence_order,name,name_tr,estimated_minutes)
         VALUES (?,?,?,?,?,?)`, [t.id, prog.id, t.sequenceOrder, t.name, t.nameTr, t.estimatedMinutes]);
      for (const e of t.exercises) {
        await tx.exec(
          `INSERT INTO template_exercises (id,workout_template_id,order_index,exercise_id,working_sets,
            warmup_sets,rep_min,rep_max,target_rir,rest_seconds) VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [`${t.id}-${e.orderIndex}`, t.id, e.orderIndex, e.exerciseId, e.workingSets, e.warmupSets,
            e.repMin, e.repMax, e.targetRir, e.restSeconds]);
      }
    }
    // aktif program
    await tx.exec(
      `INSERT INTO programs (id,program_template_id,name,status,start_date_key,start_time_zone,
        calendar_mode,training_sequence_index,sequence_wraps,duration_days,created_at_utc,updated_at_utc)
       VALUES ('prog','v90','V90','active',?,?,?,0,0,90,?,?)`,
      [opts.startDateKey ?? '2026-09-07', opts.tz ?? 'Europe/Istanbul',
        opts.calendarMode ?? 'strictCalendar', now, now]);
  });

  const notifications = new FakeNotifications();
  const scheduler = new Scheduler({
    clock, newId: ids,
    preferredWorkoutDays: async () => opts.preferredWorkoutDays ?? [],
  });
  const restTimers = new RestTimerService({ clock, notifications, newId: ids });
  const pauseService = new PauseService({ clock, scheduler, newId: ids });
  const catalog: ReadonlyMap<string, Exercise> = new Map((EXERCISES as Exercise[]).map((e) => [e.id, e]));
  const session = new ActiveSessionService({
    db, clock, scheduler, restTimers, newId: ids, catalog: async () => catalog,
  });

  return {
    db, clock, scheduler, pauseService, session, restTimers, notifications,
    programId: 'prog', ids, close: () => db.close(),
  };
}

/** Kısayol: açık planı getirir. */
export async function openPlan(h: Harness) {
  return h.db.withTransaction(async (tx) =>
    tx.get<{ id: string; status: string; planned_date_key: string; sequence_index: number; workout_template_id: string }>(
      `SELECT * FROM scheduled_workouts WHERE program_id = 'prog' AND status IN ('planned','inProgress')`));
}

export async function programRow(h: Harness) {
  return h.db.withTransaction(async (tx) =>
    tx.get<{ status: string; training_sequence_index: number; sequence_wraps: number }>(
      `SELECT * FROM programs WHERE id = 'prog'`))!;
}

export async function allScheduled(h: Harness) {
  return h.db.withTransaction(async (tx) =>
    tx.all<{ id: string; status: string; planned_date_key: string; sequence_index: number;
      reschedule_reason: string | null; partial_decision: string | null;
      rescheduled_to_id: string | null; remaining_exercise_ids_json: string | null }>(
      `SELECT * FROM scheduled_workouts ORDER BY created_at_utc, rowid`));
}

export async function sequenceEventRows(h: Harness) {
  // node:sqlite null-prototype nesne döndürür; deepEqual için düz nesneye çevir.
  const rows = await h.db.withTransaction(async (tx) =>
    tx.all<{ from_index: number; to_index: number; cause: string }>(
      'SELECT from_index, to_index, cause FROM sequence_events ORDER BY occurred_at_utc, rowid'));
  return rows.map((r) => ({ from_index: r.from_index, to_index: r.to_index, cause: r.cause }));
}
