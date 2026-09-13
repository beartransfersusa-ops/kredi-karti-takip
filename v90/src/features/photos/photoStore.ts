// İlerleme fotoğrafı deposu — docs/v90/06-ux-flows.md B.14 (R116).
//
// Dört kural bu dosyanın tamamını belirler:
//   R116.1  Dosyalar uygulamaya özel dizinde (`documentDirectory/photos/`).
//   R116.2  Galeriye YAZILMAZ; galeriden seçilen orijinal dosyaya dokunulmaz.
//   R116.3  Cloud sync YOKTUR — ne kod, ne ayar, ne "yakında" metni.
//   R116.4  Silme dosyayı da temizler; yarıda kesilirse OrphanSweeper tamamlar.
import type { Clock } from '../../core/clock/dateKey.ts';
import type { Tx } from '../../core/db/types.ts';
import type { BlobStore } from '../../core/backup/BlobStore.ts';
import type { BytesHasher } from '../../core/db/hash.ts';

export type Pose = 'front' | 'back' | 'sideLeft' | 'sideRight' | 'frontFlexed' | 'backFlexed' | 'other';

export const POSES: readonly Pose[] = [
  'front', 'back', 'sideLeft', 'sideRight', 'frontFlexed', 'backFlexed', 'other',
];

export interface PhotoRow {
  id: string;
  taken_at_utc: string;
  local_date_key: string;
  time_zone: string;
  pose: Pose;
  file_name: string;
  bytes: number;
  sha256: string;
  width: number | null;
  height: number | null;
  pending_delete: number;
  note: string | null;
}

export interface PhotoEnv {
  blobs: BlobStore;
  photosDir: string;
  hashBytes: BytesHasher;
  newId: () => string;
}

export interface SavePhotoInput {
  /** Seçilen/çekilen dosyanın baytları. Orijinal dosya DEĞİŞTİRİLMEZ. */
  bytes: Uint8Array;
  extension: string;
  pose: Pose;
  localDateKey: string;
  note?: string | null;
  width?: number | null;
  height?: number | null;
}

/** Yalnızca `pending_delete = 0` satırlar; tarihe göre yeniden eskiye. */
export async function listPhotos(tx: Tx): Promise<PhotoRow[]> {
  return tx.all<PhotoRow>(
    `SELECT * FROM progress_photos WHERE pending_delete = 0
     ORDER BY local_date_key DESC, taken_at_utc DESC`);
}

/**
 * Dosya ÖNCE yazılır, satır SONRA eklenir.
 *
 * Ters sırada olsaydı, araya giren bir kesinti dosyasız bir satır bırakırdı ve
 * kullanıcı grid'de "Dosya bulunamadı" görürdü. Bu sırada ise en kötü ihtimalle
 * sahipsiz bir dosya kalır; `sweepOrphans` onu toplar.
 */
export async function savePhoto(
  tx: Tx, clock: Clock, env: PhotoEnv, input: SavePhotoInput,
): Promise<PhotoRow> {
  const id = env.newId();
  const fileName = `${id}.${input.extension.replace(/^\./, '')}`;
  const sha256 = await env.hashBytes(input.bytes);

  await env.blobs.ensureDir(env.photosDir);
  await env.blobs.write(`${env.photosDir}/${fileName}`, input.bytes);

  const row: PhotoRow = {
    id,
    taken_at_utc: clock.nowUtc().toISOString(),
    local_date_key: input.localDateKey,
    time_zone: clock.timeZone(),
    pose: input.pose,
    file_name: fileName,
    bytes: input.bytes.byteLength,
    sha256,
    width: input.width ?? null,
    height: input.height ?? null,
    pending_delete: 0,
    note: input.note ?? null,
  };

  await tx.exec(
    `INSERT INTO progress_photos
       (id, taken_at_utc, local_date_key, time_zone, pose, file_name, bytes, sha256,
        width, height, pending_delete, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`,
    [row.id, row.taken_at_utc, row.local_date_key, row.time_zone, row.pose, row.file_name,
      row.bytes, row.sha256, row.width, row.height, row.note]);

  return row;
}

/**
 * Silme üç adımlıdır (B.14 adım 5) ve sırası önemlidir:
 *   (a) tx: `pending_delete = 1`  → fotoğraf grid'den hemen kaybolur
 *   (b) dosya silinir
 *   (c) tx: satır silinir
 * (b) ile (c) arasında kesinti olursa satır `pending_delete = 1` kalır ve
 * `sweepOrphans` açılışta tamamlar. Kullanıcı açısından fotoğraf zaten silinmiş
 * görünür; "sildim ama geri geldi" durumu oluşmaz (R116.4).
 */
export async function markForDeletion(tx: Tx, photoId: string): Promise<void> {
  await tx.exec('UPDATE progress_photos SET pending_delete = 1 WHERE id = ?', [photoId]);
}

export async function finishDeletion(
  tx: Tx, env: PhotoEnv, photo: { id: string; file_name: string },
): Promise<void> {
  await env.blobs.remove(`${env.photosDir}/${photo.file_name}`);
  await tx.exec('DELETE FROM progress_photos WHERE id = ?', [photo.id]);
}

export interface SweepResult {
  /** Yarıda kalmış silmeler tamamlandı. */
  completedDeletions: number;
  /** DB'de satırı olmayan dosyalar silindi. */
  removedOrphanFiles: number;
  /** Dosyası olmayan satırlar — kullanıcıya "Dosya bulunamadı" gösterilir. */
  missingFiles: string[];
}

/**
 * Açılışta çalışır (02 §13.2). Üç yönde de temizler; hiçbir durumda kullanıcı
 * verisi sessizce silinmez: dosyası eksik satır SİLİNMEZ, raporlanır — kaydı
 * kaldırmaya kullanıcı karar verir.
 */
export async function sweepOrphans(tx: Tx, env: PhotoEnv): Promise<SweepResult> {
  const result: SweepResult = { completedDeletions: 0, removedOrphanFiles: 0, missingFiles: [] };

  const pending = await tx.all<{ id: string; file_name: string }>(
    'SELECT id, file_name FROM progress_photos WHERE pending_delete = 1');
  for (const p of pending) {
    await finishDeletion(tx, env, p);
    result.completedDeletions++;
  }

  const rows = await tx.all<{ id: string; file_name: string }>(
    'SELECT id, file_name FROM progress_photos WHERE pending_delete = 0');
  const known = new Set(rows.map((r) => r.file_name));

  const files = await env.blobs.list(env.photosDir);
  for (const f of files) {
    if (!known.has(f)) {
      await env.blobs.remove(`${env.photosDir}/${f}`);
      result.removedOrphanFiles++;
    }
  }

  for (const r of rows) {
    if (!files.includes(r.file_name)) result.missingFiles.push(r.id);
  }
  return result;
}

/** Grid gruplaması: aynı güne ait fotoğraflar tek başlık altında. */
export function groupByDate(photos: readonly PhotoRow[]): Array<{ dateKey: string; photos: PhotoRow[] }> {
  const map = new Map<string, PhotoRow[]>();
  for (const p of photos) {
    const list = map.get(p.local_date_key) ?? [];
    list.push(p);
    map.set(p.local_date_key, list);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([dateKey, list]) => ({ dateKey, photos: list }));
}
