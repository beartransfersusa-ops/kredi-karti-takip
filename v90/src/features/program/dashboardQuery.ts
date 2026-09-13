// Ana ekranın veri toplaması — docs/v90/06-ux-flows.md A.1 "Akış" adım 2.
//
// Tek transaction içinde okunur: ekranın gördüğü durum kendi içinde tutarlıdır
// (yarısı eski, yarısı yeni bir tablo kombinasyonu oluşamaz).
//
// Yazma yalnızca `Scheduler.ensurePlanned` kaynaklıdır ve program `active`
// değilse hiç çalışmaz (R89.3).
import { challengeDay } from '../../domain/program/ChallengeCalendar.ts';
import type { ChallengeDayInfo } from '../../domain/program/ChallengeCalendar.ts';
import { resolveBaseline } from '../../domain/measurements/BaselineResolver.ts';
import type { MeasurementRow } from '../../domain/measurements/BaselineResolver.ts';
import { pauses, programs, scheduled, sessions, settings, templates } from '../../core/db/repositories.ts';
import type { ScheduledWorkoutRow, WorkoutSessionRow, WorkoutTemplateRow } from '../../core/db/repositories.ts';
import type { Tx } from '../../core/db/types.ts';
import type { Clock } from '../../core/clock/dateKey.ts';
import type { Scheduler } from '../../domain/program/Scheduler.ts';
import { daysBetweenKeys } from '../format.ts';
import { dashboardModel } from './dashboardModel.ts';
import type { DashboardInput, DashboardModel } from './dashboardModel.ts';

export const MISSED_DISMISS_KEY = 'missedCard.dismissedDateKey';

export interface DashboardData extends DashboardModel {
  /** Birincil kartta gösterilecek şablon (varsa). */
  template: WorkoutTemplateRow | null;
  /** Sıra etiketi için: kaçıncı antrenman (1 tabanlı). */
  sequenceLabel: number | null;
  todayKey: string;
  programId: string | null;
}

export async function loadDashboard(tx: Tx, clock: Clock, scheduler: Scheduler): Promise<DashboardData> {
  const todayKey = clock.todayKey();
  const program = await programs.findOpen(tx);

  if (!program) {
    const model = dashboardModel(emptyInput(todayKey));
    return { ...model, template: null, sequenceLabel: null, todayKey, programId: null };
  }

  // Program `active` ise açık plan garantiye alınır; `paused` ise DOKUNULMAZ.
  if (program.status === 'active') {
    await scheduler.ensurePlanned(tx, program.id, todayKey);
  }

  const [activeSession, openPlan, missed, openPause] = await Promise.all([
    sessions.findActive(tx),
    scheduled.findOpen(tx, program.id),
    program.status === 'active' ? scheduler.detectMissed(tx, program.id) : Promise.resolve(null),
    pauses.open(tx, program.id),
  ]);

  const pauseRows = await tx.all<{ start_date_key: string; end_date_key: string | null }>(
    'SELECT start_date_key, end_date_key FROM program_pauses WHERE program_id = ?', [program.id]);

  const day: ChallengeDayInfo = challengeDay({
    startDateKey: program.start_date_key,
    todayKey,
    calendarMode: program.calendar_mode as 'strictCalendar' | 'activeDays',
    durationDays: program.duration_days,
    pauses: pauseRows.map((r) => ({ startDateKey: r.start_date_key, endDateKey: r.end_date_key })),
  });

  const todaysFinished = await tx.get<WorkoutSessionRow>(
    `SELECT * FROM workout_sessions
     WHERE calendar_date_key = ? AND status IN ('completed','partial')
     ORDER BY completed_at_utc DESC LIMIT 1`, [todayKey]);

  const bicepsBaselineCm = await readBicepsBaseline(tx, program.start_date_key);

  const [recoCount, plateauCount, dismissed] = await Promise.all([
    countOf(tx, `SELECT COUNT(*) n FROM recommendations WHERE decision_action IS NULL`),
    countOf(tx, `SELECT COUNT(*) n FROM plateau_insights WHERE status = 'open'`),
    settings.get<string>(tx, MISSED_DISMISS_KEY),
  ]);

  const input: DashboardInput = {
    program: { id: program.id, status: program.status, calendarMode: program.calendar_mode },
    challengeDay: day,
    activeSession: activeSession ?? null,
    missed: missed ?? null,
    openPlan: openPlan ?? null,
    todaysFinishedSession: todaysFinished ?? null,
    todayKey,
    pause: openPause
      ? { reason: openPause.reason, days: daysBetweenKeys(openPause.start_date_key, todayKey) }
      : null,
    bicepsBaselineCm,
    openRecommendationCount: recoCount,
    openPlateauCount: plateauCount,
    missedCardDismissedDateKey: dismissed ?? null,
  };

  const model = dashboardModel(input);
  const planForCard = planOfCard(model.card, openPlan ?? null);
  const templateId = planForCard?.workout_template_id
    ?? activeSession?.workout_template_id
    ?? todaysFinished?.workout_template_id
    ?? null;

  const template = templateId
    ? (await tx.get<WorkoutTemplateRow>('SELECT * FROM workout_templates WHERE id = ?', [templateId])) ?? null
    : null;

  return {
    ...model,
    template,
    sequenceLabel: planForCard ? planForCard.sequence_index + 1 : null,
    todayKey,
    programId: program.id,
  };
}

function planOfCard(card: DashboardModel['card'], openPlan: ScheduledWorkoutRow | null): ScheduledWorkoutRow | null {
  if (card.kind === 'next') return card.plan;
  if (card.kind === 'doneToday') return card.nextPlan;
  if (card.kind === 'missed') return openPlan;
  return null;
}

async function countOf(tx: Tx, sql: string): Promise<number> {
  return (await tx.get<{ n: number }>(sql))?.n ?? 0;
}

/** Bükülü üst kol baseline'ı; yoksa null — 0 ASLA yazılmaz/gösterilmez (R96.3). */
async function readBicepsBaseline(tx: Tx, programStartKey: string): Promise<number | null> {
  const rows = await tx.all<{ id: string; site: string; local_date_key: string; final_value_cm: number; is_baseline: number }>(
    `SELECT id, site, local_date_key, final_value_cm, is_baseline FROM body_measurements
     WHERE site IN ('bicepsFlexed','bicepsLeftFlexed','bicepsRightFlexed')
     ORDER BY local_date_key`);
  if (rows.length === 0) return null;

  const mapped: MeasurementRow[] = rows.map((r) => ({
    id: r.id, site: r.site, localDateKey: r.local_date_key,
    finalValueCm: r.final_value_cm, isBaseline: r.is_baseline === 1,
  }));
  // Tek değer girildiyse `bicepsFlexed`, ayrı girildiyse sol/sağ vardır;
  // KPI için mevcut olan ilk site kullanılır (02 §11.2 eşlemesi).
  for (const site of ['bicepsFlexed', 'bicepsRightFlexed', 'bicepsLeftFlexed']) {
    const b = resolveBaseline(mapped, site, programStartKey);
    if (b) return b.valueCm;
  }
  return null;
}

function emptyInput(todayKey: string): DashboardInput {
  return {
    program: null, challengeDay: null, activeSession: null, missed: null, openPlan: null,
    todaysFinishedSession: null, todayKey, pause: null, bicepsBaselineCm: null,
    openRecommendationCount: 0, openPlateauCount: 0, missedCardDismissedDateKey: null,
  };
}

export { templates };
