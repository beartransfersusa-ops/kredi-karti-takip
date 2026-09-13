// Ana ekran kart önceliği — docs/v90/06-ux-flows.md A.1.
//
// Kural: TEK birincil kart. Öncelik resume > paused > missed > next.
// Bu testler "iki kart aynı anda görünmesin" garantisini kilitler (R88.1, R90.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardModel } from '../src/features/program/dashboardModel.ts';
import type { DashboardInput } from '../src/features/program/dashboardModel.ts';
import type { MissedWorkout } from '../src/domain/program/Scheduler.ts';
import type { ScheduledWorkoutRow, WorkoutSessionRow } from '../src/core/db/repositories.ts';

const TODAY = '2026-09-13';

const session = (over: Partial<WorkoutSessionRow> = {}): WorkoutSessionRow => ({
  id: 's1', program_id: 'p1', scheduled_workout_id: 'sw1', workout_template_id: 'wt1',
  status: 'active', started_at_utc: '2026-09-13T09:00:00.000Z', completed_at_utc: null,
  cancelled_at_utc: null, calendar_date_key: TODAY, calendar_date_overridden: 0,
  time_zone: 'Europe/Istanbul', utc_offset_minutes: 180, bodyweight_kg_snapshot: 107,
  ended_reason: null, note: null, created_at_utc: '', updated_at_utc: '', ...over,
} as WorkoutSessionRow);

const plan = (over: Partial<ScheduledWorkoutRow> = {}): ScheduledWorkoutRow => ({
  id: 'sw1', program_id: 'p1', sequence_index: 0, workout_template_id: 'wt1',
  planned_date_key: TODAY, status: 'planned', rescheduled_to_id: null, rescheduled_from_id: null,
  reschedule_reason: null, remaining_exercise_ids_json: null, partial_decision: null,
  resolved_at_utc: null, created_at_utc: '', updated_at_utc: '', ...over,
} as ScheduledWorkoutRow);

const missed = (): MissedWorkout => ({
  scheduledWorkoutId: 'sw1', workoutTemplateId: 'wt1', plannedDateKey: '2026-09-10',
  daysLate: 3, remainingExerciseIds: null, timeZoneShifted: false,
});

const base = (over: Partial<DashboardInput> = {}): DashboardInput => ({
  program: { id: 'p1', status: 'active', calendarMode: 'strictCalendar' },
  challengeDay: { day: 12, phase: 'active', durationDays: 90, pausedDays: 0, calendarDay: 12 },
  activeSession: null, missed: null, openPlan: null, todaysFinishedSession: null,
  todayKey: TODAY, pause: null, bicepsBaselineCm: null,
  openRecommendationCount: 0, openPlateauCount: 0, missedCardDismissedDateKey: null, ...over,
});

test('program yoksa boş durum; Day sayacı gizli', () => {
  const m = dashboardModel(base({ program: null }));
  assert.equal(m.card.kind, 'empty');
  assert.equal(m.challengeDay, null);
  assert.equal(m.canStartWorkout, false);
});

test('öncelik 1 · aktif oturum her şeyin önünde', () => {
  const m = dashboardModel(base({
    activeSession: session(), missed: missed(), openPlan: plan(),
    program: { id: 'p1', status: 'paused', calendarMode: 'strictCalendar' },
  }));
  assert.equal(m.card.kind, 'resume');
  assert.equal(m.canStartWorkout, false, 'devam eden antrenman varken yeni başlatılamaz');
});

test('öncelik 2 · dondurulmuş programda kaçırılan kartı GÖSTERİLMEZ (R89.3)', () => {
  const m = dashboardModel(base({
    program: { id: 'p1', status: 'paused', calendarMode: 'strictCalendar' },
    missed: missed(), openPlan: plan(), pause: { reason: 'illness', days: 4 },
  }));
  assert.equal(m.card.kind, 'paused');
  if (m.card.kind === 'paused') {
    assert.equal(m.card.reason, 'illness');
    assert.equal(m.card.days, 4);
  }
});

test('öncelik 3 · kaçırılan kart varken "Antrenmana Başla" gizlenir (02 §6.4)', () => {
  const m = dashboardModel(base({ missed: missed(), openPlan: plan() }));
  assert.equal(m.card.kind, 'missed');
  assert.equal(m.canStartWorkout, false, 'karar verilmeden yeni antrenman başlatılamaz');
});

test('"Şimdi değil" yalnızca BUGÜN gizler; ertesi gün kart geri gelir (R88.3)', () => {
  const dismissedToday = dashboardModel(base({
    missed: missed(), openPlan: plan(), missedCardDismissedDateKey: TODAY,
  }));
  assert.equal(dismissedToday.card.kind, 'next', 'bugün gizli');
  assert.equal(dismissedToday.canStartWorkout, true);

  const nextDay = dashboardModel(base({
    missed: missed(), openPlan: plan(), missedCardDismissedDateKey: '2026-09-12',
  }));
  assert.equal(nextDay.card.kind, 'missed', 'dünkü gizleme bugünü etkilemez');
});

test('öncelik 4 · sıradaki antrenman kartı', () => {
  const m = dashboardModel(base({ openPlan: plan({ planned_date_key: '2026-09-15' }) }));
  assert.equal(m.card.kind, 'next');
  if (m.card.kind === 'next') assert.equal(m.card.isToday, false);
  assert.equal(m.canStartWorkout, true);
});

test('bugün biten oturum varsa sıradaki yalnızca ÖNGÖRÜ olarak gösterilir', () => {
  const m = dashboardModel(base({
    todaysFinishedSession: session({ status: 'completed' }),
    openPlan: plan({ planned_date_key: '2026-09-16' }),
  }));
  assert.equal(m.card.kind, 'doneToday');
  if (m.card.kind === 'doneToday') assert.equal(m.card.nextPlan?.planned_date_key, '2026-09-16');
});

test('program bitti → Day 90 kartı, antrenman kartları gizli', () => {
  const m = dashboardModel(base({
    challengeDay: { day: 90, phase: 'finished', durationDays: 90, pausedDays: 0, calendarDay: 91 },
    openPlan: plan(),
  }));
  assert.equal(m.card.kind, 'finished');
  assert.equal(m.canStartWorkout, false);
});

test('AT-12 · biceps baseline yoksa KPI CTA verir, 0 cm göstermez', () => {
  assert.deepEqual(dashboardModel(base({ bicepsBaselineCm: null })).bicepsKpi, { state: 'missing' });
  // Sıfır "ölçüldü ve 0 çıktı" demek değildir; bilinmiyor sayılır (R119.3).
  assert.deepEqual(dashboardModel(base({ bicepsBaselineCm: 0 })).bicepsKpi, { state: 'missing' });
  assert.deepEqual(dashboardModel(base({ bicepsBaselineCm: 38.5 })).bicepsKpi,
    { state: 'known', valueCm: 38.5 });
});

test('açık plan yokken kart "noPlan"; hiçbir durumda beyaz ekran yok', () => {
  const m = dashboardModel(base({}));
  assert.equal(m.card.kind, 'noPlan');
});
