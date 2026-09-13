// Day 90 raporunun okuması ve "Programı tamamla" komutu — B.19, 02 §6.5.
import type { Clock } from '../../core/clock/dateKey.ts';
import type { Tx } from '../../core/db/types.ts';
import { programs } from '../../core/db/repositories.ts';
import type { ScheduledRow } from '../../domain/analytics/AdherenceCalculator.ts';
import { day90Report } from './day90Report.ts';
import type { Day90Report } from './day90Report.ts';

export async function loadDay90Report(tx: Tx, todayKey: string): Promise<(Day90Report & { programId: string }) | null> {
  const p = await programs.findOpen(tx)
    ?? await tx.get<Awaited<ReturnType<typeof programs.findOpen>>>(
      `SELECT * FROM programs WHERE status = 'completed' ORDER BY completed_at_utc DESC LIMIT 1`);
  if (!p) return null;

  const pauses = (await tx.all<{ start_date_key: string; end_date_key: string | null }>(
    'SELECT start_date_key, end_date_key FROM program_pauses WHERE program_id = ?', [p.id]))
    .map((r) => ({ startDateKey: r.start_date_key, endDateKey: r.end_date_key }));

  const measurements = (await tx.all<{ id: string; site: string; local_date_key: string; final_value_cm: number; is_baseline: number }>(
    'SELECT id, site, local_date_key, final_value_cm, is_baseline FROM body_measurements ORDER BY local_date_key'))
    .map((r) => ({ id: r.id, site: r.site, localDateKey: r.local_date_key, finalValueCm: r.final_value_cm, isBaseline: r.is_baseline === 1 }));

  const weightLogs = (await tx.all<{ local_date_key: string; weight_kg: number }>(
    'SELECT local_date_key, weight_kg FROM weight_logs ORDER BY local_date_key'))
    .map((r) => ({ localDateKey: r.local_date_key, weightKg: r.weight_kg }));

  const personalRecords = (await tx.all<{ pr_type: string; estimated_1rm: number | null }>(
    'SELECT pr_type, estimated_1rm FROM personal_records WHERE superseded_by_id IS NULL'))
    .map((r) => ({ prType: r.pr_type, estimated1rm: r.estimated_1rm }));

  const scheduled: ScheduledRow[] = (await tx.all<{ id: string; planned_date_key: string; status: string }>(
    'SELECT id, planned_date_key, status FROM scheduled_workouts WHERE program_id = ?', [p.id]))
    .map((r) => ({ id: r.id, plannedDateKey: r.planned_date_key, status: r.status as ScheduledRow['status'] }));

  return {
    programId: p.id,
    ...day90Report({
      program: {
        id: p.id, status: p.status, startDateKey: p.start_date_key, calendarMode: p.calendar_mode,
        durationDays: p.duration_days, completedAtUtc: p.completed_at_utc,
      },
      pauses, measurements, weightLogs, personalRecords, scheduled, todayKey,
    }),
  };
}

/**
 * Kullanıcı onaylı kapatma (02 §6.5). Day 90 geçmediyse ya da program açık
 * değilse reddedilir: rapor ekranı butonu zaten gizler, burası ikinci savunma.
 */
export async function completeProgram(tx: Tx, clock: Clock, programId: string, todayKey: string): Promise<void> {
  const report = await loadDay90Report(tx, todayKey);
  if (!report || report.programId !== programId || !report.canComplete) {
    throw new Error('program şu an tamamlanamaz (Day 90 gelmedi ya da program açık değil)');
  }
  const now = clock.nowUtc().toISOString();
  await programs.setStatus(tx, programId, 'completed', now, now);
}
