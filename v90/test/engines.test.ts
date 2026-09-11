// §1, §6, §9, §10, §11 test vektörleri (docs/v90/04-domain-engines.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { challengeDay, pausedDays } from '../src/domain/program/ChallengeCalendar.ts';
import { advanceSequence, manualAdjust } from '../src/domain/program/TrainingSequence.ts';
import { assessRecovery, evaluate as guardrails } from '../src/domain/progression/VolumeGuardrails.ts';
import type { MuscleVolumeTarget, RecoveryAssessment } from '../src/domain/progression/VolumeGuardrails.ts';
import { weeklyByMuscle } from '../src/domain/analytics/VolumeAnalytics.ts';
import { week as adherenceWeek } from '../src/domain/analytics/AdherenceCalculator.ts';
import { finalValue, shoulderToWaist, weightMovingAverage, weightTrend } from '../src/domain/analytics/TrendCalculator.ts';
import { compute, displayPer100g, portion } from '../src/domain/nutrition/RecipeBuilder.ts';
import type { Per100g } from '../src/domain/nutrition/RecipeBuilder.ts';
import { deriveBicepsView, evaluate as quality } from '../src/domain/measurements/MeasurementQuality.ts';
import { buildBicepsKpi, resolveBaseline } from '../src/domain/measurements/BaselineResolver.ts';
import { BY_ID } from './fixtures.ts';

// ---------------------------------------------------------------- §1 takvim
test('TV-CAL · challengeDay takvimden türetilir, sıradan bağımsız', () => {
  const base = { startDateKey: '2026-09-07', calendarMode: 'strictCalendar' as const };
  assert.equal(challengeDay({ ...base, todayKey: '2026-09-07' }).day, 1);
  assert.equal(challengeDay({ ...base, todayKey: '2026-09-23' }).day, 17);
  assert.equal(challengeDay({ ...base, todayKey: '2026-12-05' }).day, 90);
  assert.equal(challengeDay({ ...base, todayKey: '2026-12-06' }).phase, 'finished');
  const ns = challengeDay({ ...base, todayKey: '2026-09-01' });
  assert.equal(ns.phase, 'notStarted');
  assert.equal(ns.day, 1, 'başlamadan Day 1 gibi gösterilmez; phase ayırır');
});

test('TV-PAUSE · strict vs activeDays, 5 günlük dondurma', () => {
  const pauses = [{ startDateKey: '2026-09-10', endDateKey: '2026-09-15' }];   // 5 tam gün
  const args = { startDateKey: '2026-09-07', todayKey: '2026-09-23', pauses };
  assert.equal(challengeDay({ ...args, calendarMode: 'strictCalendar' }).day, 17);
  const active = challengeDay({ ...args, calendarMode: 'activeDays' });
  assert.equal(active.pausedDays, 5);
  assert.equal(active.day, 12);
});

test('açık dondurmada challengeDay geri gitmez', () => {
  const pauses = [{ startDateKey: '2026-09-10', endDateKey: null }];
  const d1 = challengeDay({ startDateKey: '2026-09-07', todayKey: '2026-09-12', calendarMode: 'activeDays', pauses });
  const d2 = challengeDay({ startDateKey: '2026-09-07', todayKey: '2026-09-20', calendarMode: 'activeDays', pauses });
  assert.equal(d1.day, 4);
  assert.equal(d2.day, 4, 'dondurma boyunca sabit kalır, azalmaz');
  assert.equal(pausedDays(pauses, '2026-09-07', '2026-09-20'), 10);
});

test('TV-SEQ (R88.6) · sıra yalnızca üç nedenle ilerler', () => {
  const s = { trainingSequenceIndex: 3, sequenceWraps: 0 };
  assert.equal(advanceSequence(s, 'completed', 5, true).trainingSequenceIndex, 4);
  assert.equal(advanceSequence(s, 'skipped', 5, true).trainingSequenceIndex, 4);
  assert.equal(advanceSequence(s, 'partialCountedDone', 5, true).trainingSequenceIndex, 4);
  assert.throws(() => advanceSequence(s, 'manualAdjust' as never, 5, true), /geçersiz neden/);
});

test('döngüsel rotasyon başa döner, wraps artar; lineer tükenir', () => {
  const atEnd = { trainingSequenceIndex: 4, sequenceWraps: 0 };
  const cyc = advanceSequence(atEnd, 'completed', 5, true);
  assert.equal(cyc.trainingSequenceIndex, 0);
  assert.equal(cyc.sequenceWraps, 1);
  assert.equal(cyc.wrapped, true);
  const lin = advanceSequence(atEnd, 'completed', 5, false);
  assert.equal(lin.isExhausted, true);
  assert.equal(lin.trainingSequenceIndex, 5);
});

test('manuel düzeltme ayrı kapıdan geçer ve denetim nedeni taşır', () => {
  const r = manualAdjust({ trainingSequenceIndex: 3, sequenceWraps: 0 }, 1, 5);
  assert.equal(r.cause, 'manualAdjust');
  assert.equal(r.trainingSequenceIndex, 1);
  assert.throws(() => manualAdjust({ trainingSequenceIndex: 0, sequenceWraps: 0 }, 9, 5), /aralık dışı/);
});

// ---------------------------------------------------------------- §6 hacim
const OK: RecoveryAssessment = { status: 'ok', soreness: 'ok', energy: 'ok', sleep: 'ok' };
const biceps: MuscleVolumeTarget = { muscle: 'biceps', baselineWeeklyDirectSets: 13, maxRecommendedWeeklySets: 20, isPriority: true };
const gArgs = (over: Partial<Parameters<typeof guardrails>[0]> = {}) => ({
  target: biceps, currentWeeklySets: 13, recovery: OK, trend: 'up' as const,
  targetWeekStartKey: '2026-09-07', referenceWeekStartKey: '2026-08-31', ...over,
});

test('G1 · toparlanma iyi + trend yukarı → +1 set', () => {
  const r = guardrails(gArgs());
  assert.equal(r.outcome, 'recommend');
  if (r.outcome !== 'recommend') return;
  assert.equal(r.delta, 1);
  assert.equal(r.proposedSets, 14);
  assert.equal(r.recommendation.kind, 'volumeIncrease');
  assert.match(r.recommendation.rationaleTr, /en fazla \+2 set/);
});

test('G5 · tavana yaklaşınca delta kırpılır, tavanda öneri yok', () => {
  const near = guardrails(gArgs({ currentWeeklySets: 19 }));
  assert.equal(near.outcome === 'recommend' && near.proposedSets, 20);
  const at = guardrails(gArgs({ currentWeeklySets: 20 }));
  assert.equal(at.outcome, 'none');
  assert.equal(at.outcome === 'none' && at.reason, 'atMax');
});

test('G11 / G13 · +2 yalnızca önceki öneri kabul edilip yapıldıysa', () => {
  const prior = [{ targetWeekStartKey: '2026-08-31', proposedSets: 13, decision: 'accepted' as const }];
  const esc = guardrails(gArgs({ prior, currentWeeklySets: 13 }));
  assert.equal(esc.outcome === 'recommend' && esc.delta, 2);
  const notDone = guardrails(gArgs({ prior, currentWeeklySets: 12 }));
  assert.equal(notDone.outcome, 'none');            // baseline 13'ün altında
  const ignored = [{ targetWeekStartKey: '2026-08-31', proposedSets: 13, decision: 'ignored' as const }];
  const ign = guardrails(gArgs({ prior: ignored }));
  assert.equal(ign.outcome === 'recommend' && ign.delta, 1, 'yok sayılan öneri +2\'ye yükseltmez');
});

test('R105.3 · kapılar: toparlanma, trend, öncelik, haftada tek öneri', () => {
  const poor: RecoveryAssessment = { status: 'poor', soreness: 'poor', energy: 'ok', sleep: 'ok' };
  assert.equal(guardrails(gArgs({ recovery: poor })).outcome, 'none');
  const unknown: RecoveryAssessment = { status: 'unknown', soreness: 'unknown', energy: 'ok', sleep: 'ok' };
  const u = guardrails(gArgs({ recovery: unknown }));
  assert.equal(u.outcome === 'none' && u.reason, 'recoveryNotOk');
  assert.match(u.outcome === 'none' ? u.detailTr : '', /verisi yeterli değil/);
  assert.equal(guardrails(gArgs({ trend: 'down' })).outcome, 'none');
  assert.equal(guardrails(gArgs({ trend: 'unknown' })).outcome, 'none');
  const nonPrio = { ...biceps, isPriority: false };
  assert.equal(guardrails(gArgs({ target: nonPrio })).outcome, 'none');
  assert.equal(guardrails(gArgs({ alreadyRecommendedThisWeek: true })).outcome, 'none');
});

test('assessRecovery üç durumludur; eksik veri "iyi" sayılmaz', () => {
  const days = (n: number, s: number, e: number) => Array.from({ length: n }, (_, i) => ({ localDateKey: `2026-09-0${i + 1}`, soreness: s, energy: e }));
  const sleep = (n: number, min: number) => Array.from({ length: n }, (_, i) => ({ localDateKey: `2026-09-0${i + 1}`, durationMinutes: min }));
  assert.equal(assessRecovery({ checkIns: days(5, 2, 4), sleepLogs: sleep(5, 450), sleepTargetHours: 7.5 }).status, 'ok');
  assert.equal(assessRecovery({ checkIns: days(5, 5, 4), sleepLogs: sleep(5, 450), sleepTargetHours: 7.5 }).status, 'poor');
  assert.equal(assessRecovery({ checkIns: days(2, 2, 4), sleepLogs: sleep(5, 450), sleepTargetHours: 7.5 }).status, 'unknown');
  assert.equal(assessRecovery({ checkIns: days(5, 2, 4), sleepLogs: sleep(5, 450), sleepTargetHours: null }).status, 'unknown');
});

test('R102.4 · unilateral setler hacimde çift sayılmaz', () => {
  const rows = [
    { sessionExerciseId: 'se1', setIndex: 1, exerciseId: 'single-arm-cable-lateral-raise', side: 'left' as const, calendarDateKey: '2026-09-07' },
    { sessionExerciseId: 'se1', setIndex: 1, exerciseId: 'single-arm-cable-lateral-raise', side: 'right' as const, calendarDateKey: '2026-09-07' },
    { sessionExerciseId: 'se1', setIndex: 2, exerciseId: 'single-arm-cable-lateral-raise', side: 'left' as const, calendarDateKey: '2026-09-07' },
    { sessionExerciseId: 'se1', setIndex: 2, exerciseId: 'single-arm-cable-lateral-raise', side: 'right' as const, calendarDateKey: '2026-09-07' },
  ];
  const v = weeklyByMuscle(rows, BY_ID);
  assert.equal(v.find((x) => x.muscle === 'lateralDelts')!.directSets, 2, 'sol+sağ = 1 set');
});

test('R106.3 · ikincil katkı ayrı ve tahmindir', () => {
  const rows = [{ sessionExerciseId: 'se1', setIndex: 1, exerciseId: 'lat-pulldown', side: 'both' as const, calendarDateKey: '2026-09-07' }];
  const v = weeklyByMuscle(rows, BY_ID);
  assert.equal(v.find((x) => x.muscle === 'lats')!.directSets, 1);
  const bi = v.find((x) => x.muscle === 'biceps')!;
  assert.equal(bi.directSets, 0, 'ikincil kas direkt sayıma girmez');
  assert.equal(bi.secondarySetsEstimate, 0.5);
  assert.equal(bi.isEstimate, true);
});

// ---------------------------------------------------------------- §9 analitik
test('TV-9.01 (AT-10) · 7 günlük ortalama eksik günü atlar', () => {
  const logs = [
    { localDateKey: '2026-09-07', weightKg: 107.0 }, { localDateKey: '2026-09-08', weightKg: 106.8 },
    { localDateKey: '2026-09-09', weightKg: 107.4 }, { localDateKey: '2026-09-10', weightKg: 106.5 },
    { localDateKey: '2026-09-12', weightKg: 106.9 }, { localDateKey: '2026-09-13', weightKg: 106.6 },
  ];
  const r = weightMovingAverage(logs, '2026-09-13')!;
  assert.equal(r.daysUsed, 6);
  assert.equal(r.value, 106.9);
});

test('TV-9.02 / TV-9.03 · yetersiz veri null; aynı gün çift tartı ortalanır', () => {
  assert.equal(weightMovingAverage([{ localDateKey: '2026-09-12', weightKg: 107 }, { localDateKey: '2026-09-13', weightKg: 106 }], '2026-09-13'), null);
  const two = weightMovingAverage([
    { localDateKey: '2026-09-11', weightKg: 106.4 }, { localDateKey: '2026-09-11', weightKg: 106.8 },
    { localDateKey: '2026-09-12', weightKg: 106.6 }, { localDateKey: '2026-09-13', weightKg: 106.6 },
  ], '2026-09-13')!;
  assert.equal(two.daysUsed, 3);
  assert.equal(two.value, 106.6);
});

test('TV-9.04–TV-9.06 (AT-11) · omuz/bel oranı ± 3 gün eşleşmesiyle', () => {
  const sh = [{ localDateKey: '2026-09-07', valueCm: 137 }];
  assert.equal(shoulderToWaist(sh, [{ localDateKey: '2026-09-07', valueCm: 95 }])!.ratio, 1.44);
  assert.equal(shoulderToWaist([{ localDateKey: '2026-09-03', valueCm: 137 }], [{ localDateKey: '2026-09-01', valueCm: 95 }])!.ratio, 1.44);
  assert.equal(shoulderToWaist([{ localDateKey: '2026-09-08', valueCm: 137 }], [{ localDateKey: '2026-09-01', valueCm: 95 }]), null);
  assert.equal(shoulderToWaist(sh, []), null);
});

test('28 günlük eğim ve etiket', () => {
  const logs = Array.from({ length: 28 }, (_, i) => ({
    localDateKey: `2026-09-${String(i + 1).padStart(2, '0')}`, weightKg: 107 - i * 0.08,
  }));
  const t = weightTrend(logs, '2026-09-28')!;
  assert.equal(t.label, 'down');
  assert.ok(Math.abs(t.kgPerWeek + 0.56) < 0.05);
  const flat = Array.from({ length: 28 }, (_, i) => ({ localDateKey: `2026-09-${String(i + 1).padStart(2, '0')}`, weightKg: 107 }));
  assert.equal(weightTrend(flat, '2026-09-28')!.label, 'stable');
});

test('TV-9.11 (AT-20) · final değer son 7 günün medyanı', () => {
  const pts = [
    { localDateKey: '2026-12-01', valueCm: 89.5 }, { localDateKey: '2026-12-03', valueCm: 90 },
    { localDateKey: '2026-12-05', valueCm: 89 },
  ];
  const f = finalValue(pts, '2026-12-05')!;
  assert.equal(f.source, 'median7d');
  assert.equal(f.valueCm, 89.5);
  const old = finalValue([{ localDateKey: '2026-11-20', valueCm: 92 }], '2026-12-05')!;
  assert.equal(old.source, 'lastKnown');
  assert.equal(old.ageDays, 15);
  assert.equal(finalValue([], '2026-12-05'), null, 'ölçüm yoksa "ölçülmedi"');
});

test('TV-9.09 / TV-9.10 (R103.4) · kısmi ayrı sayılır, taşınan çift sayılmaz', () => {
  const rows = [
    { id: 'a', plannedDateKey: '2026-09-07', status: 'completed' as const },
    { id: 'b', plannedDateKey: '2026-09-08', status: 'completed' as const },
    { id: 'c', plannedDateKey: '2026-09-09', status: 'partiallyCompleted' as const, doneWorkingSets: 10, plannedWorkingSets: 18 },
    { id: 'd', plannedDateKey: '2026-09-10', status: 'planned' as const },
    { id: 'e', plannedDateKey: '2026-09-11', status: 'rescheduled' as const },
  ];
  const w = adherenceWeek(rows, '2026-09-09', '2026-09-12');
  assert.equal(w.weekStartKey, '2026-09-07');
  assert.equal(w.completed, 2);
  assert.equal(w.partial, 1);
  assert.equal(w.missed, 1, 'geçmişte kalan planned = missed');
  assert.equal(w.rescheduledOut, 1);
  assert.equal(w.completionRate, 0.5);
  assert.equal(w.partialCompletionRatio, 0.56);
});

// ---------------------------------------------------------------- §10 tarif
// Belgedeki (§10) seed değerleri: ham/pişmemiş ağırlık üzerinden.
const FOODS = new Map<string, Per100g>([
  ['chicken-breast-raw', { kcal: 120, protein: 22.5, carb: 0, fat: 2.6, fiber: 0 }],
  ['rice-white-raw', { kcal: 365, protein: 7.1, carb: 80.0, fat: 0.7, fiber: 1.3 }],
  ['sunflower-oil', { kcal: 884, protein: 0, carb: 0, fat: 100, fiber: 0 }],
]);
const TAVUKLU_PILAV = {
  id: 'r1', name: 'Tavuklu Pilav', cookedYieldG: 1050,
  ingredients: [{ foodId: 'chicken-breast-raw', grams: 500 }, { foodId: 'rice-white-raw', grams: 300 }, { foodId: 'sunflower-oil', grams: 20 }],
};

test('TV-10 (R110) · Tavuklu Pilav 350 g porsiyon', () => {
  const n = compute(TAVUKLU_PILAV, FOODS);
  assert.equal(n.rawTotalG, 820);
  assert.equal(n.basis, 'cookedYield');
  assert.equal(n.basisG, 1050);
  const p = portion(n, 350);
  assert.deepEqual(p.macros, { kcal: 624, proteinG: 44.6, carbG: 80, fatG: 11.7, fiberG: 1.3 });
  assert.deepEqual(p.warnings, []);
});

test('R110.5 · pişmiş ağırlık yoksa ham toplam + zorunlu uyarı', () => {
  const n = compute({ ...TAVUKLU_PILAV, cookedYieldG: null }, FOODS);
  assert.equal(n.basis, 'rawTotal');
  assert.equal(n.basisG, 820);
  assert.ok(n.warnings.includes('noCookedYield'));
});

test('porsiyon YUVARLANMIŞ per100g\'den değil tam toplamdan hesaplanır', () => {
  const n = compute(TAVUKLU_PILAV, FOODS);
  const viaRounded = displayPer100g(n).kcal * 3.5;          // gösterim değerinden hesaplansaydı
  assert.notEqual(Math.round(viaRounded), portion(n, 350).macros.kcal);
});

test('porsiyon parti ağırlığını aşarsa uyarı verir ama engellenmez', () => {
  const p = portion(compute(TAVUKLU_PILAV, FOODS), 1200);
  assert.ok(p.warnings.includes('portionExceedsBasis'));
  assert.equal(p.macros.kcal, 2139);
});

test('lif bilinmiyorsa toplam lif null olur', () => {
  const foods = new Map(FOODS);
  foods.set('sunflower-oil', { kcal: 884, protein: 0, carb: 0, fat: 100, fiber: null });
  assert.equal(compute(TAVUKLU_PILAV, foods).total.fiberG, null);
});

// ---------------------------------------------------------------- §11 ölçüm
test('A1 / A2 / A5 / A6 / A8 / A14 · ölçüm kalitesi', () => {
  const a1 = quality([38.2, 38.4]);
  assert.equal(a1.status, 'pairWithinThreshold');
  assert.equal(a1.finalValueCm, 38.3);
  assert.equal(a1.aggregation, 'mean');

  const a2 = quality([38.2, 39.6]);
  assert.equal(a2.status, 'thirdRecommended');
  assert.equal(a2.recommendThird, true);
  assert.equal(a2.finalValueCm, 38.9, 'kullanıcı yine de kaydedebilir (R97.4)');

  assert.deepEqual(quality([39.6, 38.2]), a2, 'sıra sonucu değiştirmez');
  assert.equal(quality([38.2, 38.5]).finalValueCm, 38.4, '.5 yukarı yuvarlanır');
  assert.equal(quality([95.0, 96.4]).status, 'pairWithinThreshold', 'büyük çevrede %1,5 baskın');
  const a14 = quality([38.2, 45.0, 38.3]);
  assert.equal(a14.aggregation, 'median');
  assert.equal(a14.finalValueCm, 38.3);
  assert.equal(quality([38.2]).aggregation, 'single');
});

test('B2 / B3 · sol-sağ birleşik görünüm', () => {
  assert.deepEqual(deriveBicepsView({ leftCm: 38.3, rightCm: 37.6 }), { combinedCm: 38, source: 'meanOfSides' });
  assert.deepEqual(deriveBicepsView({ leftCm: 38.3, rightCm: 37.8 }), { combinedCm: 38.1, source: 'meanOfSides' });
  assert.deepEqual(deriveBicepsView({ leftCm: 38.3 }), { combinedCm: 38.3, source: 'singleSide' });
  assert.equal(deriveBicepsView({}), null, 'uydurma ortalama yok');
});

test('geçersiz ölçüm reddedilir (R119.3)', () => {
  assert.throws(() => quality([0]), /0 < v < 300/);
  assert.throws(() => quality([]), /1–3 örnek/);
  assert.throws(() => quality([38, 38, 38, 38]), /1–3 örnek/);
});

test('AT-12 · biceps baseline yokken 0 cm GÖSTERİLMEZ', () => {
  const kpi = buildBicepsKpi(null, null);
  assert.equal(kpi.active, false);
  assert.equal(kpi.ctaTr, 'Başlangıç kol ölçümünü ekle.');
  assert.equal(kpi.baselineCm, undefined);
  assert.equal(JSON.stringify(kpi).includes('0'), false, 'hiçbir yerde sıfır değer yok');
});

test('baseline: is_baseline önceliği, sonra ±7 gün penceresi', () => {
  const rows = [
    { id: 'm1', site: 'bicepsFlexed', localDateKey: '2026-09-05', finalValueCm: 38.2, isBaseline: false },
    { id: 'm2', site: 'bicepsFlexed', localDateKey: '2026-10-01', finalValueCm: 39.0, isBaseline: true },
  ];
  assert.equal(resolveBaseline(rows, 'bicepsFlexed', '2026-09-07')!.source, 'explicit');
  const noExplicit = rows.map((r) => ({ ...r, isBaseline: false }));
  const w = resolveBaseline(noExplicit, 'bicepsFlexed', '2026-09-07')!;
  assert.equal(w.source, 'window');
  assert.equal(w.measurementId, 'm1');
  assert.equal(resolveBaseline(noExplicit.slice(1), 'bicepsFlexed', '2026-09-07'), null, 'pencere dışı → baseline yok');
  assert.equal(resolveBaseline([], 'bicepsFlexed', '2026-09-07'), null);
});

test('geç alınan baseline etiketlenir', () => {
  const rows = [{ id: 'm1', site: 'bicepsFlexed', localDateKey: '2026-10-16', finalValueCm: 38.2, isBaseline: true }];
  const kpi = buildBicepsKpi(resolveBaseline(rows, 'bicepsFlexed', '2026-09-07'), 39.4);
  assert.equal(kpi.active, true);
  assert.equal(kpi.deltaCm, 1.2);
  assert.equal(kpi.baselineLabelTr, 'Başlangıç: Gün 40');
});
