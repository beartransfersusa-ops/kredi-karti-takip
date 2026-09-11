// İdempotent komut kaydı — docs/v90/04-domain-engines.md §2.2.2, 02 §15.
// Komutun İLK ifadesi budur: aynı command_id ile gelen tekrar hiçbir şey
// yazmadan döner. Transaction geri alınırsa bu satır da geri alınır, yani
// retry temiz başlar.

import type { Tx } from './types.ts';

export interface CommandResult<T> {
  applied: boolean;
  reason?: 'duplicate';
  value?: T;
}

export const applied = <T>(value: T): CommandResult<T> => ({ applied: true, value });
export const duplicate = <T>(value?: T): CommandResult<T> => ({ applied: false, reason: 'duplicate', value });

/** true = komut bu çağrıda sahiplenildi; false = daha önce commit edilmiş. */
export async function claimCommand(
  tx: Tx, commandId: string, commandType: string, nowIso: string,
): Promise<boolean> {
  const r = await tx.exec(
    `INSERT INTO command_log (command_id, command_type, executed_at_utc) VALUES (?,?,?)
     ON CONFLICT(command_id) DO NOTHING`,
    [commandId, commandType, nowIso]);
  return r.changes > 0;
}

export async function rememberResult(tx: Tx, commandId: string, result: unknown): Promise<void> {
  await tx.exec('UPDATE command_log SET result_json = ? WHERE command_id = ?',
    [JSON.stringify(result), commandId]);
}

export async function previousResult<T>(tx: Tx, commandId: string): Promise<T | undefined> {
  const r = await tx.get<{ result_json: string | null }>(
    'SELECT result_json FROM command_log WHERE command_id = ?', [commandId]);
  return r?.result_json ? (JSON.parse(r.result_json) as T) : undefined;
}

/** İdempotency penceresi 30 gün (03 §1.1). */
export async function pruneCommandLog(tx: Tx, beforeIso: string): Promise<number> {
  const r = await tx.exec('DELETE FROM command_log WHERE executed_at_utc < ?', [beforeIso]);
  return r.changes;
}
