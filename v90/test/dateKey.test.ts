// 04-domain-engines.md §12.6 test vektörleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FakeClock, addDays, dayOfWeek, daysBetween, localDateKey, stamp, utcOffsetMinutes, weekStartKey,
} from '../src/core/clock/dateKey.ts';

test('TV-12.02 · İstanbul 23:30 logu o güne yazılır', () => {
  const c = new FakeClock('2026-09-20T20:30:00.000Z', 'Europe/Istanbul');
  const s = stamp(c);
  assert.equal(s.localDateKey, '2026-09-20');
  assert.equal(s.timeZone, 'Europe/Istanbul');
  assert.equal(s.utcOffsetMinutes, 180);
});

test('TV-12.03 · tz değişimi mevcut kaydın gününü değiştirmez', () => {
  const c = new FakeClock('2026-09-20T22:30:00.000Z', 'Europe/Istanbul');
  const yazilan = stamp(c).localDateKey;          // yerel 21 Eylül 01:30
  assert.equal(yazilan, '2026-09-21');
  c.setTimeZone('America/New_York');               // aynı UTC anı, yerel 20 Eylül 18:30
  assert.equal(c.todayKey(), '2026-09-20');
  assert.equal(yazilan, '2026-09-21');             // kayıt değişmedi (R112.2)
});

test('TV-12.04 · New York 20:00 logu NY tarihini alır', () => {
  const c = new FakeClock('2026-09-22T00:00:00.000Z', 'America/New_York');
  assert.equal(stamp(c).localDateKey, '2026-09-21');
});

test('TV-12.07 · DST geçişinde localDateKey doğru', () => {
  // Berlin yaz saati bitişi: 2026-10-25 03:00 -> 02:00 (25 saatlik gün)
  const before = new Date('2026-10-25T00:30:00.000Z');
  const after = new Date('2026-10-25T01:30:00.000Z');
  assert.equal(localDateKey(before, 'Europe/Berlin'), '2026-10-25');
  assert.equal(localDateKey(after, 'Europe/Berlin'), '2026-10-25');
  assert.equal(utcOffsetMinutes(before, 'Europe/Berlin'), 120);
  assert.equal(utcOffsetMinutes(after, 'Europe/Berlin'), 60);
});

test('takvim aritmetiği', () => {
  assert.equal(addDays('2026-09-07', 1), '2026-09-08');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-09-07', '2026-09-21'), 14);
  assert.equal(daysBetween('2026-09-21', '2026-09-07'), -14);
  assert.equal(dayOfWeek('2026-09-07'), 1);        // Pazartesi
  assert.equal(weekStartKey('2026-09-13'), '2026-09-07');  // Pazar -> önceki Pazartesi
  assert.equal(weekStartKey('2026-09-07'), '2026-09-07');
});

test('batı yarımküre negatif offset', () => {
  assert.equal(utcOffsetMinutes(new Date('2026-09-21T12:00:00.000Z'), 'America/New_York'), -240);
  assert.equal(utcOffsetMinutes(new Date('2026-01-21T12:00:00.000Z'), 'America/New_York'), -300);
});
