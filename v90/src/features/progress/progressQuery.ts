// İlerleme ekranının okuması — docs/v90/06-ux-flows.md B.10, B.11.
//
// Hiçbir sayı uydurulmaz: yeterli veri yoksa `null` döner ve ekran "yeterli
// veri yok" der. Tahmin olan her değer `isEstimate` taşır (R123.1, R123.4).
import { weeklyByMuscle } from '../../domain/analytics/VolumeAnalytics.ts';
import type { MuscleVolume, WorkingSetRow } from '../../domain/analytics/VolumeAnalytics.ts';
import { shoulderToWaist, weightMovingAverage, weightTrend } from '../../domain/analytics/TrendCalculator.ts';
import { week as adherenceWeek } from '../../domain/analytics/AdherenceCalculator.ts';
import type { ScheduledRow, WeekAdherence } from '../../domain/analytics/AdherenceCalculator.ts';
import { programs } from '../../core/db/repositories.ts';
import type { Tx } from '../../core/db/types.ts';
import type { Exercise, MuscleGroup } from '../../domain/types.ts';
import { addDaysKey } from '../format.ts';

export interface VolumeTarget {
  muscle: MuscleGroup;
  baseline: number;
  max: number;
  isPriority: boolean;
}

export interface ProgressData {
  todayKey: string;
  weightAverage: { value: number; daysUsed: number } | null;
  weightSlope: { kgPerWeek: number; label: 'up' | 'down' | 'stable'; daysUsed: number } | null;
  shoulderWaist: { ratio: number; shoulderKey: string; waistKey: string } | null;
  volumes: MuscleVolume[];
  targets: Map<MuscleGroup, VolumeTarget>;
  adherence: WeekAdherence | null;
  openPlateaus: Array<{ id: string; exerciseId: string; exerciseNameTr: string; side: string | null }>;
}

export async function loadProgress(
  tx: Tx, todayKey: string, catalog: ReadonlyMap<string, Exercise>,
): Promise<ProgressData> {
  const weights = await tx.all<{ local_date_key: string; weight_kg: number }>(
    'SELECT local_date_key, weight_kg FROM weight_logs ORDER BY local_date_key');
  const logs = weights.map((w) => ({ localDateKey: w.local_date_key, weightKg: w.weight_kg }));

  const shoulders = await measurementPoints(tx, 'shoulder');
  const waists = await measurementPoints(tx, 'waist');

  // Haftalık hacim: bu haftanın working set'leri. `v_weekly_direct_sets`
  // görünümü iptal edilen ve ısınma setlerini zaten dışlar.
  const weekStart = startOfWeek(todayKey);
  const setRows = await tx.all<{
    session_exercise_id: string; set_index: number; exercise_id: string;
    side: string; calendar_date_key: string;
  }>(
    `SELECT sl.session_exercise_id, sl.set_index, sl.exercise_id, sl.side, ws.calendar_date_key
     FROM set_logs sl JOIN workout_sessions ws ON ws.id = sl.session_id
     WHERE sl.discarded = 0 AND sl.set_type IN ('working','dropset','backoff')
       AND ws.status IN ('completed','partial')
       AND ws.calendar_date_key BETWEEN ? AND ?`,
    [weekStart, addDaysKey(weekStart, 6)]);

  const working: WorkingSetRow[] = setRows.map((r) => ({
    sessionExerciseId: r.session_exercise_id,
    setIndex: r.set_index,
    exerciseId: r.exercise_id,
    side: r.side as WorkingSetRow['side'],
    calendarDateKey: r.calendar_date_key,
  }));

  const targetRows = await tx.all<{
    muscle: string; baseline_weekly_direct_sets: number;
    max_recommended_weekly_sets: number; is_priority: number;
  }>('SELECT * FROM muscle_volume_targets');

  const program = await programs.findOpen(tx);
  const scheduledRows = program
    ? await tx.all<{ id: string; planned_date_key: string; status: string }>(
      'SELECT id, planned_date_key, status FROM scheduled_workouts WHERE program_id = ?', [program.id])
    : [];

  const plateauRows = await tx.all<{ id: string; exercise_id: string; side: string | null }>(
    `SELECT id, exercise_id, side FROM plateau_insights WHERE status = 'open' ORDER BY detected_at_utc DESC`);

  return {
    todayKey,
    weightAverage: weightMovingAverage(logs, todayKey),
    weightSlope: weightTrend(logs, todayKey),
    shoulderWaist: shoulderToWaist(shoulders, waists),
    volumes: weeklyByMuscle(working, catalog),
    targets: new Map(targetRows.map((r) => [r.muscle as MuscleGroup, {
      muscle: r.muscle as MuscleGroup,
      baseline: r.baseline_weekly_direct_sets,
      max: r.max_recommended_weekly_sets,
      isPriority: r.is_priority === 1,
    }])),
    adherence: program
      ? adherenceWeek(scheduledRows.map(toScheduledRow), todayKey, todayKey, program.status === 'active')
      : null,
    openPlateaus: plateauRows.map((r) => ({
      id: r.id,
      exerciseId: r.exercise_id,
      exerciseNameTr: catalog.get(r.exercise_id)?.nameTr ?? r.exercise_id,
      side: r.side,
    })),
  };
}

const toScheduledRow = (r: { id: string; planned_date_key: string; status: string }): ScheduledRow => ({
  id: r.id, plannedDateKey: r.planned_date_key, status: r.status as ScheduledRow['status'],
});

async function measurementPoints(tx: Tx, site: string) {
  const rows = await tx.all<{ local_date_key: string; final_value_cm: number }>(
    'SELECT local_date_key, final_value_cm FROM body_measurements WHERE site = ? ORDER BY local_date_key',
    [site]);
  return rows.map((r) => ({ localDateKey: r.local_date_key, valueCm: r.final_value_cm }));
}

/** Pazartesi başlangıçlı hafta. */
export function startOfWeek(key: string): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  return addDaysKey(key, -((dt.getUTCDay() + 6) % 7));
}
