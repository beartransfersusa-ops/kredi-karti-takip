// Öneri kararları — docs/v90/06-ux-flows.md A.7 (R121.1–R121.3).
//
// Karar KAYBOLMAZ: "Yok say" bile yazılır, çünkü sonraki öneriler geçmiş
// kararları girdi alır (sürekli yok say → daha muhafazakâr, 02 §9.6).
import type { Clock } from '../../core/clock/dateKey.ts';
import type { Tx } from '../../core/db/types.ts';
import { claimCommand } from '../../core/db/commandLog.ts';
import type { RecommendationRow, Decision, Proposed } from './recommendation.ts';
import { isVisible, toCard } from './recommendation.ts';
import type { RecommendationCard } from './recommendation.ts';

/** Bir hareketin AÇIK ya da bu oturumda karar verilmiş önerileri. */
export async function openForExercise(
  tx: Tx, exerciseId: string, nowUtc: Date,
): Promise<RecommendationCard[]> {
  const rows = await tx.all<RecommendationRow>(
    `SELECT * FROM recommendations
     WHERE exercise_id = ? AND kind IN
       ('loadIncrease','holdLoad','loadDecrease','repIncrease','deload','substitution')
     ORDER BY created_at_utc DESC LIMIT 5`, [exerciseId]);

  // En güncel açık öneri + varsa bu hareketin son kararı.
  const visible = rows.filter((r) => isVisible(r, nowUtc));
  const open = visible.find((r) => r.decision_action === null);
  const decided = visible.find((r) => r.decision_action !== null);
  return (open ? [open] : decided ? [decided] : []).map(toCard);
}

/** Hacim önerileri Progress ekranında gösterilir (A.7 (c), R105). */
export async function openVolumeRecommendations(tx: Tx, nowUtc: Date): Promise<RecommendationCard[]> {
  const rows = await tx.all<RecommendationRow>(
    `SELECT * FROM recommendations
     WHERE kind IN ('volumeIncrease','volumeHold') AND decision_action IS NULL
     ORDER BY created_at_utc DESC LIMIT 10`);
  return rows.filter((r) => isVisible(r, nowUtc)).map(toCard);
}

export interface DecideCommand {
  commandId: string;
  recommendationId: string;
  decision: Decision;
  /** 'modified' için kullanıcının girdiği değer; diğerlerinde okunmaz. */
  userValue?: number;
  /** Karar bir antrenman sırasında verildiyse o oturum. */
  appliedSessionId?: string | null;
}

export async function decide(tx: Tx, clock: Clock, cmd: DecideCommand): Promise<boolean> {
  const claimed = await claimCommand(tx, cmd.commandId, 'recommendation.decide', clock.nowUtc().toISOString());
  if (!claimed) return false;                       // aynı komut tekrar geldi: no-op

  const row = await tx.get<RecommendationRow>('SELECT * FROM recommendations WHERE id = ?',
    [cmd.recommendationId]);
  if (!row) return false;

  const now = clock.nowUtc().toISOString();
  const value = decisionValue(row, cmd);

  await tx.exec(
    `UPDATE recommendations
     SET decision_action = ?, decision_value_json = ?, decided_at_utc = ?, applied_session_id = ?
     WHERE id = ?`,
    [cmd.decision, JSON.stringify(value), now, cmd.appliedSessionId ?? null, cmd.recommendationId]);
  return true;
}

/**
 * Karar verilmeden ilk working set tamamlanırsa öneri `ignored` olarak kapanır
 * ve LOGLANAN değeri taşır — kullanıcının fiili tercihi kaydedilir (R121.3,
 * A.7 adım 6). Sessizce silinmez: geçmiş öneri kalitesini bu besler.
 */
export async function closeOpenOnSetLogged(
  tx: Tx, clock: Clock, input: { exerciseId: string; loggedValue: number | null; sessionId: string },
): Promise<number> {
  const open = await tx.all<{ id: string }>(
    `SELECT id FROM recommendations
     WHERE exercise_id = ? AND decision_action IS NULL AND kind IN
       ('loadIncrease','holdLoad','loadDecrease','repIncrease','deload')`,
    [input.exerciseId]);
  if (open.length === 0) return 0;

  const now = clock.nowUtc().toISOString();
  for (const r of open) {
    await tx.exec(
      `UPDATE recommendations
       SET decision_action = 'ignored', decision_value_json = ?, decided_at_utc = ?, applied_session_id = ?
       WHERE id = ?`,
      [JSON.stringify(input.loggedValue === null ? {} : { effectiveLoad: input.loggedValue }),
        now, input.sessionId, r.id]);
  }
  return open.length;
}

function decisionValue(row: RecommendationRow, cmd: DecideCommand): Proposed | Record<string, never> {
  const proposed = JSON.parse(row.proposed_json) as Proposed;
  if (cmd.decision === 'accepted') return proposed;
  if (cmd.decision === 'modified' && cmd.userValue !== undefined) {
    // Kullanıcı değeri önerilenin YERİNE geçer; hangi alan olduğu öneri
    // türünden belli (yük mü, tekrar mı, set mi).
    if (proposed.reps !== undefined) return { ...proposed, reps: cmd.userValue };
    if (proposed.sets !== undefined) return { ...proposed, sets: cmd.userValue };
    if (proposed.raw?.assistanceKg !== undefined && proposed.raw.assistanceKg !== null) {
      return { ...proposed, raw: { ...proposed.raw, assistanceKg: cmd.userValue } };
    }
    return { ...proposed, effectiveLoad: cmd.userValue };
  }
  return {};                                        // ignored: değer taşımaz
}
