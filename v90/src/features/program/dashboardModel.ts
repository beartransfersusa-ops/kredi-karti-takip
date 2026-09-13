// Ana ekran birincil kart seçimi — docs/v90/06-ux-flows.md A.1.
//
// Ekranın TEK bir birincil kart alanı vardır ve iki kart aynı anda orada yer
// almaz (R88.1, R88.3, R90.4). Öncelik yüksekten düşüğe:
//
//   1. Devam eden antrenman   (aktif oturum var)        → A.5
//   2. Program dondurulmuş    (programs.status='paused')→ A.9
//   3. Kaçırılan antrenman    (detectMissed ≠ null)     → A.2
//   4. Sıradaki antrenman     (açık `planned` plan)
//
// Bu dosya SAFTIR: DB'ye, React'e ve saate dokunmaz; yalnızca okunmuş
// durumdan hangi kartın gösterileceğini söyler. Böylece kural testlerle
// kilitlenir (bkz. test/dashboardModel.test.ts).

import type { ChallengeDayInfo } from '../../domain/program/ChallengeCalendar.ts';
import type { MissedWorkout } from '../../domain/program/Scheduler.ts';
import type { DateKey } from '../../domain/types.ts';
import type { ScheduledWorkoutRow, WorkoutSessionRow } from '../../core/db/repositories.ts';

export interface DashboardInput {
  /** `status IN ('active','paused')` olan program; yoksa null. */
  program: { id: string; status: string; calendarMode: string } | null;
  challengeDay: ChallengeDayInfo | null;
  activeSession: WorkoutSessionRow | null;
  missed: MissedWorkout | null;
  openPlan: ScheduledWorkoutRow | null;
  /** Bugün (calendar_date_key = today) kapanmış oturum. */
  todaysFinishedSession: WorkoutSessionRow | null;
  todayKey: DateKey;
  pause: { reason: string | null; days: number } | null;
  /** `BaselineResolver.biceps()` — bilinmiyorsa null; 0 ASLA gösterilmez. */
  bicepsBaselineCm: number | null;
  openRecommendationCount: number;
  openPlateauCount: number;
  /** "Şimdi değil" ile bugün gizlenen kaçırılan kart (settings anahtarı). */
  missedCardDismissedDateKey: DateKey | null;
}

export type PrimaryCard =
  | { kind: 'empty' }
  | { kind: 'finished' }
  | { kind: 'resume'; session: WorkoutSessionRow }
  | { kind: 'paused'; reason: string | null; days: number }
  | { kind: 'missed'; missed: MissedWorkout }
  | { kind: 'next'; plan: ScheduledWorkoutRow; isToday: boolean }
  | { kind: 'doneToday'; session: WorkoutSessionRow; nextPlan: ScheduledWorkoutRow | null }
  | { kind: 'noPlan' };

export interface DashboardModel {
  card: PrimaryCard;
  /** Day sayacı; program yoksa gizlidir. */
  challengeDay: ChallengeDayInfo | null;
  /** Kol KPI kartı: baseline yoksa `disabled` + "Başlangıç kol ölçümünü ekle." */
  bicepsKpi: { state: 'known'; valueCm: number } | { state: 'missing' };
  openRecommendationCount: number;
  openPlateauCount: number;
  /**
   * Kaçırılan kart görünürken "Antrenmana Başla" gizlenir: karar verilmeden
   * yeni antrenman başlatılamaz (02 §6.4).
   */
  canStartWorkout: boolean;
}

export function dashboardModel(i: DashboardInput): DashboardModel {
  const bicepsKpi: DashboardModel['bicepsKpi'] =
    i.bicepsBaselineCm !== null && i.bicepsBaselineCm > 0
      ? { state: 'known', valueCm: i.bicepsBaselineCm }
      : { state: 'missing' };

  const base = {
    challengeDay: i.program ? i.challengeDay : null,
    bicepsKpi,
    openRecommendationCount: i.openRecommendationCount,
    openPlateauCount: i.openPlateauCount,
  };

  if (!i.program) return { ...base, card: { kind: 'empty' }, canStartWorkout: false, challengeDay: null };

  // Öncelik 1 — devam eden antrenman. Program bitmiş olsa bile önce bu.
  if (i.activeSession) {
    return { ...base, card: { kind: 'resume', session: i.activeSession }, canStartWorkout: false };
  }

  // Öncelik 2 — dondurulmuş. Kaçırılan uyarısı ÜRETİLMEZ (R89.3).
  if (i.program.status === 'paused') {
    return {
      ...base,
      card: { kind: 'paused', reason: i.pause?.reason ?? null, days: i.pause?.days ?? 0 },
      canStartWorkout: false,
    };
  }

  if (i.program.status === 'completed' || i.challengeDay?.phase === 'finished') {
    return { ...base, card: { kind: 'finished' }, canStartWorkout: false };
  }

  // Öncelik 3 — kaçırılan. "Şimdi değil" yalnızca BUGÜN için gizler.
  const dismissedToday = i.missedCardDismissedDateKey === i.todayKey;
  if (i.missed && !dismissedToday) {
    return { ...base, card: { kind: 'missed', missed: i.missed }, canStartWorkout: false };
  }

  // Bugün kapanmış oturum varsa "tamamlandı" özeti; sıradaki yalnızca ÖNGÖRÜ.
  if (i.todaysFinishedSession) {
    return {
      ...base,
      card: { kind: 'doneToday', session: i.todaysFinishedSession, nextPlan: i.openPlan },
      // Bugün bitmiş olması yarın için planı engellemez ama bugün yeni
      // antrenman başlatma birincil eylem değildir.
      canStartWorkout: false,
    };
  }

  // Öncelik 4 — sıradaki antrenman.
  if (i.openPlan) {
    return {
      ...base,
      card: { kind: 'next', plan: i.openPlan, isToday: i.openPlan.planned_date_key <= i.todayKey },
      // Kaçırılan kart gizlendiyse (dismissedToday) plan geçmişte olsa da
      // başlatmaya izin verilir; kullanıcı kararı zaten "şimdi değil"di.
      canStartWorkout: true,
    };
  }

  return { ...base, card: { kind: 'noPlan' }, canStartWorkout: false };
}
