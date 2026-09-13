// Küratörlü video manifest'i — docs/v90/06-ux-flows.md B.15, §114.
//
// R114.1: video URL'leri runtime'da aranmaz; yalnızca bu manifest'ten gelir.
// R114.3/R114.4: manifest'te kayıt yoksa ya da video oynatılamıyorsa hareket
// sayfası ÇÖKMEZ — teknik ipuçları (`exercises.cues_json`) ve varsa kaynak
// bağlantısı her zaman gösterilir.
// R114.5: video indirilip yeniden host edilmez; yalnızca resmi embed/link.
//
// Manifest bilinçli olarak BOŞ dağıtılıyor: doğrulanmamış bir videoId eklemek
// R114.1'in yasakladığı şeydir. Kürasyon manuel bir iştir; giriş eklenince
// `verify-seed` H1 alanları ve hareket kimliğini denetler.

export interface VideoEntry {
  exerciseId: string;
  videoProvider: 'youtube';
  videoId: string;
  channelName: string;
  sourceUrl: string;
  /** ISO tarih — videonun son elle doğrulandığı gün. */
  lastVerifiedAt: string;
  fallbackUrl?: string;
}

export interface VideoManifest {
  formatVersion: 1;
  videos: readonly VideoEntry[];
}

export type VideoState =
  | { kind: 'none' }                          // manifest'te kayıt yok
  | { kind: 'offline'; entry: VideoEntry }     // bağlantı yok; player hiç denenmez
  | { kind: 'available'; entry: VideoEntry }   // player denenebilir (B.15 adım 2)
  | { kind: 'unavailable'; entry: VideoEntry }; // onError / 8 s zaman aşımı → fallback

export const PLAYER_TIMEOUT_MS = 8_000;

export function findVideo(manifest: VideoManifest, exerciseId: string): VideoEntry | null {
  return manifest.videos.find((v) => v.exerciseId === exerciseId) ?? null;
}

export function initialState(manifest: VideoManifest, exerciseId: string, online: boolean): VideoState {
  const entry = findVideo(manifest, exerciseId);
  if (!entry) return { kind: 'none' };
  return online ? { kind: 'available', entry } : { kind: 'offline', entry };
}

/** Thumbnail resmi YouTube CDN'inden; yüklenemezse gri kutu (B.15). */
export const thumbnailUrl = (e: VideoEntry): string => `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`;

/** "Kaynağa git" hedefi: fallbackUrl ?? sourceUrl. */
export const sourceLink = (e: VideoEntry): string => e.fallbackUrl ?? e.sourceUrl;

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** Manifest doğrulaması; verify-seed ve testler kullanır. */
export function validateManifest(
  m: unknown, knownExerciseIds: ReadonlySet<string>,
): { ok: true; count: number } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const obj = m as Partial<VideoManifest> | null;
  if (!obj || obj.formatVersion !== 1 || !Array.isArray(obj.videos)) {
    return { ok: false, errors: ['formatVersion 1 ve videos[] gerekli'] };
  }
  const seen = new Set<string>();
  for (const v of obj.videos as Partial<VideoEntry>[]) {
    const id = v.exerciseId ?? '?';
    if (!v.exerciseId || !knownExerciseIds.has(v.exerciseId)) errors.push(`${id}: katalogda olmayan hareket`);
    if (seen.has(id)) errors.push(`${id}: birden fazla giriş`);
    seen.add(id);
    if (v.videoProvider !== 'youtube') errors.push(`${id}: videoProvider yalnızca youtube`);
    if (!v.videoId || !YT_ID.test(v.videoId)) errors.push(`${id}: videoId 11 karakter olmalı`);
    if (!v.channelName) errors.push(`${id}: channelName eksik (R114.2)`);
    if (!v.sourceUrl || !/^https:\/\/(www\.)?youtube\.com\//.test(v.sourceUrl)) errors.push(`${id}: sourceUrl resmi YouTube adresi olmalı (R114.5)`);
    if (!v.lastVerifiedAt || Number.isNaN(Date.parse(v.lastVerifiedAt))) errors.push(`${id}: lastVerifiedAt ISO tarih olmalı`);
    if (v.fallbackUrl !== undefined && !/^https:\/\//.test(v.fallbackUrl)) errors.push(`${id}: fallbackUrl https olmalı`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, count: obj.videos.length };
}
