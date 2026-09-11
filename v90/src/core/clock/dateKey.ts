// Zaman sözleşmesi — docs/v90/04-domain-engines.md §12, 02-architecture.md §5.
// Kural: sıralama/süre UTC'den, gün aidiyeti localDateKey'den. localDateKey
// yazıldığı anda hesaplanır ve ASLA yeniden hesaplanmaz (R112.2).

import type { DateKey, Timestamped } from '../../domain/types.ts';

const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'sv-SE' ISO benzeri YYYY-MM-DD üretir; ICU eksikse formatToParts'a düşer. */
export function localDateKey(utc: Date, timeZone: string): DateKey {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  };
  const direct = new Intl.DateTimeFormat('sv-SE', opts).format(utc);
  if (KEY_RE.test(direct)) return direct;
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(utc);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const key = `${get('year')}-${get('month')}-${get('day')}`;
  if (!KEY_RE.test(key)) throw new Error(`localDateKey üretilemedi: ${timeZone}`);
  return key;
}

export function utcOffsetMinutes(utc: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = dtf.formatToParts(utc);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const hour = g('hour') === 24 ? 0 : g('hour');
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), hour, g('minute'), g('second'));
  return Math.round((asUtc - Math.floor(utc.getTime() / 1000) * 1000) / 60000);
}

export function isDateKey(v: string): v is DateKey {
  return KEY_RE.test(v);
}

export function addDays(key: DateKey, days: number): DateKey {
  assertKey(key);
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** b − a, tam gün (takvim günü farkı; saat/tz etkisi yok). */
export function daysBetween(a: DateKey, b: DateKey): number {
  assertKey(a); assertKey(b);
  const at = Date.parse(`${a}T00:00:00Z`);
  const bt = Date.parse(`${b}T00:00:00Z`);
  return Math.round((bt - at) / 86_400_000);
}

/** 0 = Pazar … 6 = Cumartesi (training_profiles.preferred_workout_days_json ile aynı). */
export function dayOfWeek(key: DateKey): number {
  assertKey(key);
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** Haftanın başı Pazartesi (04 §9.1). */
export function weekStartKey(key: DateKey): DateKey {
  const dow = dayOfWeek(key);
  return addDays(key, -((dow + 6) % 7));
}

export const maxKey = (a: DateKey, b: DateKey): DateKey => (a >= b ? a : b);
export const minKey = (a: DateKey, b: DateKey): DateKey => (a <= b ? a : b);

function assertKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error(`geçersiz tarih anahtarı: ${key}`);
}

export interface Clock {
  nowUtc(): Date;
  timeZone(): string;
  todayKey(): DateKey;
}

export class SystemClock implements Clock {
  nowUtc(): Date { return new Date(); }
  timeZone(): string { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
  todayKey(): DateKey { return localDateKey(this.nowUtc(), this.timeZone()); }
}

/** Testler saati VE saat dilimini değiştirebilir (04 §12.2). */
export class FakeClock implements Clock {
  #iso: string;
  #tz: string;
  constructor(iso: string, tz = 'Europe/Istanbul') { this.#iso = iso; this.#tz = tz; }
  nowUtc(): Date { return new Date(this.#iso); }
  timeZone(): string { return this.#tz; }
  todayKey(): DateKey { return localDateKey(this.nowUtc(), this.#tz); }
  set(iso: string): void { this.#iso = iso; }
  setTimeZone(tz: string): void { this.#tz = tz; }
  advance(ms: number): void { this.#iso = new Date(Date.parse(this.#iso) + ms).toISOString(); }
  advanceSeconds(s: number): void { this.advance(s * 1000); }
}

/** Her yazma noktasında kullanılır; eksik alan bırakmayı imkânsızlaştırır. */
export function stamp(clock: Clock): Required<Timestamped> {
  const now = clock.nowUtc();
  const tz = clock.timeZone();
  return {
    occurredAtUtc: now.toISOString(),
    localDateKey: localDateKey(now, tz),
    timeZone: tz,
    utcOffsetMinutes: utcOffsetMinutes(now, tz),
  };
}
