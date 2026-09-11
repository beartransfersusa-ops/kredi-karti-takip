// Migration kayıt defteri — docs/v90/03-data-model.md §2.
// Yayınlanan bir migration ASLA değiştirilmez; checksum'ı schema_migrations'ta
// saklanır ve açılışta doğrulanır (uyuşmazlık → DbIntegrityError).

import type { Migration } from '../types.ts';
import { SQL_001_INITIAL } from './001_initial.sql.ts';

const m001Initial: Migration = {
  version: 1,
  name: '001_initial',
  source: SQL_001_INITIAL,
  async up(tx) { await tx.execScript(SQL_001_INITIAL); },
};

/** Sıralı ve boşluksuz. Yeni migration SONA eklenir. */
export const MIGRATIONS: readonly Migration[] = [m001Initial];

export const LATEST_VERSION = MIGRATIONS.length === 0
  ? 0
  : Math.max(...MIGRATIONS.map((m) => m.version));

/** Yardımcı: kolon var mı? ALTER TABLE ADD COLUMN öncesi idempotency kontrolü (03 §2). */
export async function hasColumn(
  tx: { all<T>(sql: string, p?: readonly unknown[]): Promise<T[]> },
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await tx.all<{ name: string }>(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === column);
}
