// Yedek kapsamı ve satır doğrulaması — docs/v90/03-data-model.md §4, 02 §12.3.
//
// TableRegistry şemadan TÜRETİLİR (PRAGMA table_info): elle yazılmış bir liste
// zamanla DDL'den kayar ve "yedek eksik tablo içeriyor" hatası sessizce oluşur.
// R95.1'in garantisi budur: kapsam her zaman şemanın kendisidir.

import { z } from 'zod';
import type { Tx } from '../db/types.ts';

/**
 * Kapsam dışı (02 §12.3):
 *   schema_migrations — hedef DB migration çalıştırarak yeniden kurar
 *   command_log       — yalnızca yerel idempotency penceresi
 */
export const EXCLUDED_TABLES: ReadonlySet<string> = new Set(['schema_migrations', 'command_log']);

export interface ColumnInfo { name: string; type: string; notnull: boolean; pk: boolean }

export async function userTables(tx: Tx): Promise<string[]> {
  const rows = await tx.all<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`);
  return rows.map((r) => r.name).filter((n) => !EXCLUDED_TABLES.has(n));
}

export async function tableColumns(tx: Tx, table: string): Promise<ColumnInfo[]> {
  const rows = await tx.all<{ name: string; type: string; notnull: number; pk: number }>(
    `PRAGMA table_info(${table})`);
  return rows.map((r) => ({ name: r.name, type: r.type.toUpperCase(), notnull: r.notnull === 1, pk: r.pk > 0 }));
}

/** SQLite tip yakınlığı → Zod. Sayısal kolonda metin gelirse import reddedilir. */
function columnSchema(c: ColumnInfo): z.ZodTypeAny {
  const base = c.type.startsWith('INT') ? z.number().int()
    : c.type.startsWith('REAL') || c.type.startsWith('NUM') || c.type.startsWith('FLOA') || c.type.startsWith('DOUB')
      ? z.number()
      : z.string();
  return c.notnull ? base : base.nullable();
}

export async function rowSchemaFor(tx: Tx, table: string): Promise<z.ZodType<Record<string, unknown>>> {
  const cols = await tableColumns(tx, table);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const c of cols) shape[c.name] = columnSchema(c);
  // strict: yedekte şemada olmayan kolon varsa sessizce yutulmaz.
  return z.strictObject(shape) as unknown as z.ZodType<Record<string, unknown>>;
}

export async function buildRegistry(tx: Tx): Promise<Map<string, z.ZodType<Record<string, unknown>>>> {
  const out = new Map<string, z.ZodType<Record<string, unknown>>>();
  for (const t of await userTables(tx)) out.set(t, await rowSchemaFor(tx, t));
  return out;
}

// ---------------------------------------------------------------- zarf şemaları
export const ManifestSchema = z.object({
  formatVersion: z.literal(1),
  schemaVersion: z.number().int().positive(),
  appVersion: z.string(),
  createdAtUtc: z.string(),
  timeZone: z.string(),
  tables: z.record(z.string(), z.number().int().nonnegative()),
  photos: z.object({ count: z.number().int().nonnegative(), totalBytes: z.number().int().nonnegative() }),
  dataSha256: z.string().length(64),
  photoShas: z.record(z.string(), z.string().length(64)),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const DataFileSchema = z.object({
  schemaVersion: z.number().int().positive(),
  tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
});
export type DataFile = z.infer<typeof DataFileSchema>;

export const MANIFEST_PATH = 'manifest.json';
export const DATA_PATH = 'data.json';
export const PHOTO_PREFIX = 'photos/';
