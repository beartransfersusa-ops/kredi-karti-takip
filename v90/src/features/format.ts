// Türkçe biçimlendirme — docs/v90/06-ux-flows.md A.0 ("Zaman" kuralı).
//
// Süreler HER ZAMAN zaman damgalarından türetilir; burada yalnızca gösterim
// vardır. Bilinmeyen değer `null`'dır ve "—" olarak yazılır; 0 gösterilmez
// (R119.3, R123.1).
import { WEEKDAYS_SHORT_TR, WEEKDAYS_TR, MONTHS_TR } from '../ui/i18n/index.ts';
import type { DateKey } from '../domain/types.ts';

export const UNKNOWN = '—';

/** mm:ss — dinlenme sayacı (A.3). Negatif değer 0:00 olarak gösterilir. */
export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Geçen süre: 1 saatin altında "42 dk", üstünde "1 sa 12 dk". */
export function elapsed(seconds: number): string {
  const m = Math.max(0, Math.floor(seconds / 60));
  return m < 60 ? `${m} dk` : `${Math.floor(m / 60)} sa ${m % 60} dk`;
}

const parts = (key: DateKey): [number, number, number] =>
  key.split('-').map(Number) as [number, number, number];

/** DateKey'in haftanın hangi günü olduğu — UTC üzerinden, tz kaymasız. */
export function weekdayIndex(key: DateKey): number {
  const [y, m, d] = parts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const weekdayTr = (key: DateKey): string => WEEKDAYS_TR[weekdayIndex(key)]!;
export const weekdayShortTr = (key: DateKey): string => WEEKDAYS_SHORT_TR[weekdayIndex(key)]!;

/** "7 Eylül" — yıl yalnızca farklıysa eklenir. */
export function dateTr(key: DateKey, todayKey?: DateKey): string {
  const [y, m, d] = parts(key);
  const base = `${d} ${MONTHS_TR[m - 1]}`;
  return todayKey && parts(todayKey)[0] !== y ? `${base} ${y}` : base;
}

/** "18:42" — oturumun BAŞLADIĞI saat dilimine göre (A.5). */
export function hhmm(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

/** "Per" — oturumun başladığı yerel gün (A.5). */
export function weekdayShortOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone, weekday: 'short' })
    .format(new Date(iso)).replace(/\.$/, '');
}

/** Sayı: bilinmiyorsa "—", tam sayıysa ondalıksız. */
export function num(v: number | null | undefined, decimals = 1, suffix = ''): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return UNKNOWN;
  const s = Number.isInteger(v) ? String(v) : v.toFixed(decimals);
  return suffix ? `${s} ${suffix}` : s;
}

/** İki DateKey arası gün farkı (pozitif = ikinci ileride). */
export function daysBetweenKeys(from: DateKey, to: DateKey): number {
  const [ay, am, ad] = parts(from);
  const [by, bm, bd] = parts(to);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function addDaysKey(key: DateKey, delta: number): DateKey {
  const [y, m, d] = parts(key);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
