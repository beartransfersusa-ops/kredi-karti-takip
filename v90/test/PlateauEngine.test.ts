// docs/v90/04-domain-engines.md §5.4 test vektörleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKLIST_ORDER, evaluate } from '../src/domain/progression/PlateauEngine.ts';
import type { PlateauContext } from '../src/domain/progression/PlateauEngine.ts';
import type { Exposure, WorkingSetRef } from '../src/domain/types.ts';
import { ex } from './fixtures.ts';

const TARGET = { repMin: 10, repMax: 12, targetRir: 2, plannedWorkingSets: 3 };
const expo = (i: number, spec: Array<[number, number]>, load = 60, flags: Partial<WorkingSetRef> = {}): Exposure => ({
  sessionId: `s${i}`, calendarDateKey: `2026-09-0${i}`, exerciseId: 'seated-cable-row', side: 'both',
  target: TARGET,
  workingSets: spec.map(([reps, rir], k) => ({
    setLogId: `s${i}-${k}`, setIndex: k + 1, effectiveLoad: load, reps, rir,
    painFlag: false, formBreakdownFlag: false, excludeFromPr: false, ...flags,
  })),
});
const stalled = [expo(1, [[10, 2], [10, 2], [9, 2]]), expo(2, [[10, 2], [10, 2], [9, 2]]), expo(3, [[10, 2], [10, 2], [9, 2]])];
const row = () => ({ exercise: ex('seated-cable-row') });

test('TV-5.01 · 3 ardışık durağan exposure → plateau insight', () => {
  const r = evaluate({ ...row(), exposures: stalled })!;
  assert.ok(r, 'insight üretilmeli');
  assert.deepEqual(r.exposureSessionIds, ['s1', 's2', 's3']);
  assert.deepEqual(r.checklist.map((c) => c.key), [...CHECKLIST_ORDER], 'R104.4 sırası korunmalı');
  assert.equal(r.checklist.length, 7);
});

test('TV-5.02 · tekrar arttıysa plateau yok', () => {
  assert.equal(evaluate({ ...row(), exposures: [expo(1, [[10, 2], [10, 2], [10, 2]]), expo(2, [[11, 2], [11, 2], [11, 2]]), expo(3, [[11, 2], [11, 2], [11, 2]])] }), null);
});

test('TV-5.03 · yük arttıysa plateau yok', () => {
  assert.equal(evaluate({ ...row(), exposures: [expo(1, [[10, 2], [10, 2], [10, 2]], 60), expo(2, [[10, 2], [10, 2], [10, 2]], 62.5), expo(3, [[10, 2], [10, 2], [10, 2]], 62.5)] }), null);
});

test('TV-5.04 · 2 exposure yetmez (tek kötü antrenman kuralı, R104.1)', () => {
  assert.equal(evaluate({ ...row(), exposures: stalled.slice(0, 2) }), null);
  assert.equal(evaluate({ ...row(), exposures: [] }), null);
});

test('TV-5.05 · ağrı işareti varsa bu plateau değildir', () => {
  const withPain = [...stalled.slice(0, 2), expo(3, [[10, 2], [10, 2], [9, 2]], 60, { painFlag: true })];
  assert.equal(evaluate({ ...row(), exposures: withPain }), null);
});

test('TV-5.06 · RIR hedef bandı dışındaysa plateau değil (çok zorlanma)', () => {
  const hard = [expo(1, [[10, 0], [10, 0], [9, 0]]), expo(2, [[10, 0], [10, 0], [9, 0]]), expo(3, [[10, 0], [10, 0], [9, 0]])];
  assert.equal(evaluate({ ...row(), exposures: hard }), null);
});

test('TV-5.07 · uyku eksikse sameLoad önerilir', () => {
  const context: PlateauContext = { sleep: { averageHours: 5.9, targetHours: 7.5, nights: 7 } };
  const r = evaluate({ ...row(), exposures: stalled, context })!;
  const sleep = r.checklist.find((c) => c.key === 'sleep')!;
  assert.equal(sleep.status, 'attention');
  assert.match(sleep.valueTr, /5,9 sa \(hedef 7,5\)/);
  assert.ok(r.suggestions.includes('sameLoad'));
  assert.ok(!r.suggestions.includes('deload'), 'toparlanma sorunu varken deload önerilmez');
});

test('TV-5.08 · veri yoksa deload ÖNERİLMEZ; yük korunur', () => {
  const r = evaluate({ ...row(), exposures: stalled })!;
  const unknowns = r.checklist.filter((c) => c.status === 'unknown').map((c) => c.key);
  assert.deepEqual(unknowns.sort(), ['adherence', 'recovery', 'rest', 'sleep']);
  assert.ok(r.suggestions.includes('sameLoad'), 'toparlanma bilinmiyorken muhafazakâr seçenek');
  assert.ok(!r.suggestions.includes('deload'), 'olmayan teşhise dayanan öneri üretilmez (R123.1)');
});

test('yalnızca tüm toparlanma verisi BİLİNİYOR ve iyiyken deload önerilir', () => {
  const healthy: PlateauContext = {
    recovery: { soreness: 2, energy: 4, days: 7 },
    sleep: { averageHours: 7.6, targetHours: 7.5, nights: 7 },
    nutrition: { proteinAdherencePct: 96, kcalOffDays: 0, loggedDays: 7 },
    rest: { averageSeconds: 120, targetSeconds: 120 },
  };
  // RIR'ı hedefin altına al ki rirAccuracy 'ok' olsun ve tek öneri deload kalsın.
  const e = [1, 2, 3].map((i) => expo(i, [[10, 1], [10, 1], [9, 1]]));
  const r = evaluate({ ...row(), exposures: e, context: healthy })!;
  assert.deepEqual(r.suggestions, ['deload']);
});

test('TV-5.09 · cooldown içinde yeni insight üretilmez', () => {
  assert.equal(evaluate({ ...row(), exposures: stalled, context: { exposuresSinceLastInsight: 1 } }), null);
  assert.ok(evaluate({ ...row(), exposures: stalled, context: { exposuresSinceLastInsight: 3 } }));
});

test('TV-5.11 / TV-5.12 · assisted: sabit yardım plateau, ölçek karışımı değil', () => {
  const ap = ex('assisted-pullup');
  const e = [1, 2, 3].map((i) => ({ ...expo(i, [[10, 2], [10, 2], [9, 2]], 67), exerciseId: ap.id }));
  const bwKnown = [{ bodyweightKgSnapshot: 107 }, { bodyweightKgSnapshot: 107 }, { bodyweightKgSnapshot: 107 }];
  assert.ok(evaluate({ exercise: ap, exposures: e, rawByExposure: bwKnown }));
  const mixed = [{ bodyweightKgSnapshot: null }, { bodyweightKgSnapshot: 107 }, { bodyweightKgSnapshot: 107 }];
  assert.equal(evaluate({ exercise: ap, exposures: e, rawByExposure: mixed }), null);
});

test('RIR hedefte ama ilerleme yoksa repTargetAdjust önerilir', () => {
  const r = evaluate({ ...row(), exposures: stalled, context: { recovery: { soreness: 2, energy: 4, days: 7 } } })!;
  const rir = r.checklist.find((c) => c.key === 'rirAccuracy')!;
  assert.equal(rir.status, 'attention');
  assert.ok(r.suggestions.includes('repTargetAdjust'));
});

test('kısa dinlenme attention üretir', () => {
  const r = evaluate({ ...row(), exposures: stalled, context: { rest: { averageSeconds: 60, targetSeconds: 120 } } })!;
  assert.equal(r.checklist.find((c) => c.key === 'rest')!.status, 'attention');
  assert.ok(r.suggestions.includes('sameLoad'));
});
