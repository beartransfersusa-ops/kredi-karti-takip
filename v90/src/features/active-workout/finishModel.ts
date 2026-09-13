// Bitirme kuralı — docs/v90/06-ux-flows.md A.4, 02 §7.5 (R103.1–R103.3).
//
// Tam mı kısmi mi sorusunun cevabı SADECE DB'den gelir:
//   tam   → her `session_exercises` satırı 'done' ya da 'skipped'
//   kısmi → en az bir satır 'pending' ya da 'inProgress'
//
// Kısmi oturum OTOMATİK olarak `completed` OLMAZ (R103.1); kullanıcı iki
// karardan birini seçmek zorundadır. Hiç set yoksa kısmi kararı hiç
// gösterilmez: boş "kısmi antrenman" üretmenin anlamı yok.

export interface FinishExercise {
  id: string;
  exerciseId: string;
  status: 'pending' | 'inProgress' | 'done' | 'skipped';
  plannedWorkingSets: number;
  loggedWorkingSets: number;
}

export type FinishMode =
  | { kind: 'empty' }
  | { kind: 'full' }
  | { kind: 'partial'; doneCount: number; plannedCount: number; missingCount: number; remainingExerciseIds: string[] };

export function finishMode(exercises: readonly FinishExercise[], totalSetLogs: number): FinishMode {
  if (totalSetLogs === 0) return { kind: 'empty' };

  const unresolved = exercises.filter((e) => e.status === 'pending' || e.status === 'inProgress');
  if (unresolved.length === 0) return { kind: 'full' };

  const done = exercises.filter((e) => e.status === 'done').length;
  return {
    kind: 'partial',
    doneCount: done,
    plannedCount: exercises.length,
    missingCount: unresolved.length,
    // Devam planına taşınacak hareketler (A.4 adım 5).
    remainingExerciseIds: unresolved.map((e) => e.exerciseId),
  };
}

/**
 * Oturum kapanışının `ended_reason`'ı. Resume kartından gelindiğinde ayrı
 * bir neden yazılır ki geçmişte "nereden bitirildi" görülebilsin.
 */
export function endedReason(mode: FinishMode, origin: 'workoutScreen' | 'resumeCard'): string {
  if (origin === 'resumeCard') return 'resumeCardFinish';
  return mode.kind === 'full' ? 'allDone' : 'finishHereToday';
}

/** Tarih düzenleme aralığı: başlangıcın yerel günü − 1 gün … bugün (A.4 adım 2). */
export function allowedDateRange(startedLocalDateKey: string, todayKey: string): { min: string; max: string } {
  return { min: addDays(startedLocalDateKey, -1), max: todayKey };
}

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
