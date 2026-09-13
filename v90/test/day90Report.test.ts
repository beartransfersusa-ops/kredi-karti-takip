// AT-20 · Day 90 raporu doğru başlangıç/final değerlerini kullanıyor.
// docs/v90/05-acceptance-tests.md AT-20 fikstürü BİREBİR.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { day90Report, firstWeekAverage, lastOnOrBefore } from '../src/features/report/day90Report.ts';
import type { Day90Input } from '../src/features/report/day90Report.ts';
import { tr } from '../src/ui/i18n/index.ts';

const START = '2026-09-07';
const TODAY = '2026-12-05';

const m = (site: string, key: string, cm: number, baseline = false) =>
  ({ id: `${site}-${key}`, site, localDateKey: key, finalValueCm: cm, isBaseline: baseline });

function weights() {
  const logs: Array<{ localDateKey: string; weightKg: number }> = [];
  const first = [107.0, 107.4, 106.8, 107.2, 106.9, 107.1, 106.6];
  const last = [98.4, 98.9, 98.2, 98.6, 98.8, 98.5, 98.1];
  first.forEach((w, i) => logs.push({ localDateKey: `2026-09-${String(7 + i).padStart(2, '0')}`, weightKg: w }));
  // Ara: haftada ~3 kayıt, doğrusal azalan (14 Eyl → 28 Kas).
  const days = ['2026-09-16', '2026-09-19', '2026-09-23', '2026-09-30', '2026-10-07', '2026-10-14',
    '2026-10-21', '2026-10-28', '2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25'];
  days.forEach((d, i) => logs.push({ localDateKey: d, weightKg: Math.round((106.3 - i * 0.6) * 10) / 10 }));
  const nov = ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05'];
  nov.forEach((d, i) => logs.push({ localDateKey: d, weightKg: last[i]! }));
  return logs;
}

function fixture(over: Partial<Day90Input> = {}): Day90Input {
  return {
    program: {
      id: 'p1', status: 'active', startDateKey: START, calendarMode: 'strictCalendar',
      durationDays: 90, completedAtUtc: null,
    },
    pauses: [{ startDateKey: '2026-10-01', endDateKey: '2026-10-06' }],
    measurements: [
      m('waist', '2026-08-20', 97.0),          // pencere DIŞI çeldirici
      m('waist', START, 95.0, true),
      m('shoulder', START, 137.0, true),
      m('abdomen', START, 114.0, true),
      m('waist', '2026-10-19', 91.0),
      m('waist', '2026-12-04', 86.0),          // final
      m('shoulder', '2026-12-04', 139.0),
      m('abdomen', '2026-12-04', 104.0),
      m('waist', '2026-12-07', 85.0),          // Day 90 SONRASI çeldirici
    ],
    weightLogs: weights(),
    personalRecords: [{ prType: 'estimatedPerformancePr', estimated1rm: 132.5 }, { prType: 'loadPr', estimated1rm: null }],
    scheduled: [
      ...Array.from({ length: 34 }, (_, i) => ({ id: `c${i}`, plannedDateKey: '2026-10-10', status: 'completed' as const })),
      ...Array.from({ length: 3 }, (_, i) => ({ id: `p${i}`, plannedDateKey: '2026-10-10', status: 'partiallyCompleted' as const })),
      ...Array.from({ length: 2 }, (_, i) => ({ id: `s${i}`, plannedDateKey: '2026-10-10', status: 'skipped' as const })),
      { id: 'm0', plannedDateKey: '2026-11-20', status: 'planned' as const },   // türetilmiş missed
    ],
    todayKey: TODAY,
    ...over,
  };
}

test('adım 1 · strictCalendar: challengeDay=90, Day 90 tarihi 2026-12-05, 6 Aralık\'ta clamp', () => {
  const r = day90Report(fixture());
  assert.equal(r.day.day, 90);
  assert.equal(r.day90Key, '2026-12-05');
  assert.equal(r.isPreview, false);
  assert.equal(r.canComplete, true);
  const later = day90Report(fixture({ todayKey: '2026-12-06' }));
  assert.equal(later.day.day, 90, 'R88.1: 90\'da kalır');
});

test('adım 2 · activeDays: 5 dondurma günü düşülür, Day 90 tarihi 2026-12-10', () => {
  const r = day90Report(fixture({
    program: { ...fixture().program, calendarMode: 'activeDays' },
  }));
  assert.equal(r.day.day, 85, 'R89.5-B');
  assert.equal(r.day90Key, '2026-12-10');
  assert.equal(r.isPreview, true, 'Day 90 henüz gelmedi');
  assert.equal(r.canComplete, false);
});

test('adım 3 · baseline pencere dışını, final Day 90 sonrasını YOK SAYAR', () => {
  const r = day90Report(fixture());
  const by = Object.fromEntries(r.sites.map((s) => [s.site, s]));
  assert.deepEqual([by.waist!.baselineCm, by.waist!.finalCm, by.waist!.deltaCm], [95.0, 86.0, -9.0],
    '97.0 baseline değil; 85.0 (7 Aralık) final değil');
  assert.deepEqual([by.shoulder!.baselineCm, by.shoulder!.finalCm, by.shoulder!.deltaCm], [137.0, 139.0, 2.0]);
  assert.deepEqual([by.abdomen!.baselineCm, by.abdomen!.finalCm, by.abdomen!.deltaCm], [114.0, 104.0, -10.0]);
  // Hiç kaydı olmayan site: null, "0" DEĞİL.
  assert.deepEqual([by.hip!.baselineCm, by.hip!.finalCm, by.hip!.deltaCm], [null, null, null]);
});

test('adım 4 · kilo: 7 günlük ortalamalar, tekil son tartı DEĞİL; eğim kg/hafta', () => {
  const r = day90Report(fixture());
  assert.equal(r.weight.baselineKg, 107.0);
  assert.equal(r.weight.finalKg, 98.5, 'son tartı 98.1 DEĞİL');
  assert.equal(r.weight.deltaKg, -8.5);
  assert.ok(r.weight.slopeKgPerWeek !== null && r.weight.slopeKgPerWeek < 0, 'eğim negatif ve tanımlı');
});

test('adım 5 · biceps Varyant A → null (CTA), Varyant B → 38.0 → 40.0', () => {
  const a = day90Report(fixture());
  assert.equal(a.biceps, null, 'hiç kayıt yok → CTA, 0 cm ASLA');

  const b = day90Report(fixture({
    measurements: [...fixture().measurements,
      m('bicepsFlexed', '2026-09-08', 38.0), m('bicepsFlexed', '2026-12-04', 40.0)],
  }));
  assert.deepEqual([b.biceps?.baselineCm, b.biceps?.finalCm, b.biceps?.deltaCm], [38.0, 40.0, 2.0]);
});

test('adım 6 · bel/omuz oranı 1.44 → 1.62, Δ +0.18', () => {
  const r = day90Report(fixture());
  assert.deepEqual(r.ratio, { baseline: 1.44, final: 1.62, delta: 0.18 });
});

test('adım 7 · adherence 34/3/2/1 — kısmi completed\'a DAHİL DEĞİL (R103.4)', () => {
  const r = day90Report(fixture());
  assert.deepEqual(r.adherence, { completed: 34, partial: 3, skipped: 2, missed: 1 });
});

test('adım 8 · e1RM tahmin rozetli; rapor metinlerinde mutlak iddia yok (R123.1)', () => {
  const r = day90Report(fixture());
  assert.equal(r.prs.count, 2);
  assert.equal(r.prs.bestE1rm, 132.5);
  assert.equal(r.prs.isEstimate, true);

  const banned = [/kas kazandın/i, /yağ yaktın/i, /\bkesin\b/i];
  const entries = Object.entries(tr).filter(([k]) => k.startsWith('report.'));
  assert.ok(entries.length >= 20, 'report.* anahtarları üretilmiş olmalı');
  for (const [key, text] of entries) {
    // Sorumluluk reddi cümlesi "kesin" kelimesini OLUMSUZLAYARAK kullanır
    // ("kesin bir iddia taşımaz"); yasak, olumlu iddiaya karşıdır.
    if (key === 'report.disclaimer') continue;
    for (const b of banned) assert.ok(!b.test(text), `yasak ifade [${key}]: ${text}`);
  }
  assert.ok(tr['report.disclaimer'].includes('kesin bir iddia taşımaz'), 'sorumluluk reddi cümlesi olmalı');
});

test('tamamlanmış program: canComplete=false, rapor salt okunur', () => {
  const r = day90Report(fixture({
    program: { ...fixture().program, status: 'completed', completedAtUtc: '2026-12-06T07:00:00.000Z' },
  }));
  assert.equal(r.isCompleted, true);
  assert.equal(r.canComplete, false);
  assert.equal(r.isPreview, false);
});

test('yardımcılar · firstWeekAverage < 3 gün → null; lastOnOrBefore sınırı kapsar', () => {
  assert.equal(firstWeekAverage([{ localDateKey: START, weightKg: 100 }], START), null);
  const rows = [m('waist', '2026-12-05', 1), m('waist', '2026-12-06', 2)];
  assert.equal(lastOnOrBefore(rows, 'waist', '2026-12-05')?.finalValueCm, 1, 'Day 90 günü dahil, sonrası hariç');
});
