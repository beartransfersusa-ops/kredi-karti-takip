// docs/v90/04-domain-engines.md §7.5 test vektörleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectForSet, detectSessionVolumePr, estimate1rm, isPrCandidate } from '../src/domain/workout/PrDetector.ts';
import type { CurrentPrs, PrCandidateSet } from '../src/domain/workout/PrDetector.ts';
import { ex, fakeExercise } from './fixtures.ts';

const set = (over: Partial<PrCandidateSet> = {}): PrCandidateSet => ({
  setLogId: 'sl1', sessionId: 'sess1', exerciseId: 'seated-cable-row', side: 'both',
  setType: 'working', raw: { loadKg: 80 }, reps: 10, excludeFromPr: false, discarded: false, ...over,
});
const kinds = (rs: ReturnType<typeof detectForSet>) => rs.map((r) => r.prType).sort();

test('TV-7.01 · daha ağır yük → loadPr', () => {
  const cur: CurrentPrs = { loadPr: { effectiveLoad: 80, raw: { loadKg: 80 } }, repsAtLoad: new Map([[80, 10]]), estimated1rm: 106.67 };
  const r = detectForSet(set({ raw: { loadKg: 82.5 }, reps: 8 }), ex('seated-cable-row'), cur);
  assert.deepEqual(kinds(r), ['loadPr']);
  assert.equal(r[0]!.effectiveLoad, 82.5);
});

test('TV-7.02 · aynı yükte daha çok tekrar → repPrAtLoad + e1RM', () => {
  const cur: CurrentPrs = { loadPr: { effectiveLoad: 80, raw: { loadKg: 80 } }, repsAtLoad: new Map([[80, 10]]), estimated1rm: 106.67 };
  const r = detectForSet(set({ raw: { loadKg: 80 }, reps: 11 }), ex('seated-cable-row'), cur);
  assert.deepEqual(kinds(r), ['estimatedPerformancePr', 'repPrAtLoad']);
  const e = r.find((x) => x.prType === 'estimatedPerformancePr')!;
  assert.equal(e.estimated1rm, 109.33);
  assert.equal(e.isEstimate, true, 'e1RM her zaman tahmin olarak işaretlenir (R123.4)');
});

test('TV-7.03 / TV-7.04 · ısınma ve "PR\'a sayma" hiç PR üretmez', () => {
  const cur: CurrentPrs = { loadPr: { effectiveLoad: 80 }, repsAtLoad: new Map() };
  assert.equal(isPrCandidate(set({ setType: 'warmup' })), false);
  assert.deepEqual(detectForSet(set({ setType: 'warmup', raw: { loadKg: 90 }, reps: 3 }), ex('seated-cable-row'), cur), []);
  assert.deepEqual(detectForSet(set({ excludeFromPr: true, raw: { loadKg: 90 }, reps: 3 }), ex('seated-cable-row'), cur), []);
  assert.deepEqual(detectForSet(set({ discarded: true, raw: { loadKg: 90 } }), ex('seated-cable-row'), cur), []);
});

test('TV-7.05 (AT-09) · assisted: yardım azalınca loadPr', () => {
  const ap = ex('assisted-pullup');
  const cur: CurrentPrs = { loadPr: { effectiveLoad: 67, raw: { assistanceKg: 40, bodyweightKgSnapshot: 107 } }, repsAtLoad: new Map() };
  const r = detectForSet(set({ exerciseId: ap.id, raw: { assistanceKg: 35, bodyweightKgSnapshot: 107 }, reps: 8 }), ap, cur);
  const load = r.find((x) => x.prType === 'loadPr')!;
  assert.equal(load.effectiveLoad, 72, '107 − 35 = 72 > 67');
});

test('TV-7.06 · ordinal türlerde e1RM üretilmez', () => {
  const lvl = fakeExercise({ id: 'lvl', loadProgressionType: 'machineLevel' });
  const r = detectForSet(set({ raw: { machineLevel: 7 }, reps: 10 }), lvl,
    { loadPr: { effectiveLoad: 6 }, repsAtLoad: new Map() });
  assert.deepEqual(kinds(r), ['loadPr']);
  assert.equal(estimate1rm({ machineLevel: 7 }, 10, lvl), null);
});

test('TV-7.07 · reps > 12 ise e1RM yok, loadPr var', () => {
  const r = detectForSet(set({ raw: { loadKg: 85 }, reps: 15 }), ex('seated-cable-row'),
    { loadPr: { effectiveLoad: 80, raw: { loadKg: 80 } }, repsAtLoad: new Map(), estimated1rm: 100 });
  assert.deepEqual(kinds(r), ['loadPr']);
});

test('TV-7.08 · taraf bazlı PR', () => {
  const cur: CurrentPrs = { loadPr: { effectiveLoad: 20, raw: { loadKg: 20 } }, repsAtLoad: new Map() };
  const l = detectForSet(set({ side: 'left', raw: { loadKg: 22 }, reps: 12 }), ex('single-arm-cable-lateral-raise'), cur);
  const r = detectForSet(set({ side: 'right', raw: { loadKg: 22 }, reps: 12 }), ex('single-arm-cable-lateral-raise'), cur);
  assert.equal(l[0]!.side, 'left');
  assert.equal(r[0]!.side, 'right');
});

test('TV-7.11 / TV-7.12 · oturum hacmi PR\'ı ve ölçeksiz hareketin dışlanması', () => {
  const row = ex('seated-cable-row');
  const bw = fakeExercise({ id: 'pushup', loadProgressionType: 'bodyweight' });
  const sets = [
    { set: set({ raw: { loadKg: 80 }, reps: 10 }), exercise: row },
    { set: set({ raw: { loadKg: 80 }, reps: 10 }), exercise: row },
    { set: set({ exerciseId: 'pushup', raw: {}, reps: 20 }), exercise: bw },    // ölçek yok
    { set: set({ setType: 'warmup', raw: { loadKg: 40 }, reps: 10 }), exercise: row },
  ];
  const { pr, volume, excludedExerciseIds } = detectSessionVolumePr('sess1', sets, 1500);
  assert.equal(volume, 1600, 'ısınma ve ölçeksiz set hacme girmez');
  assert.equal(pr?.prType, 'sessionVolumePr');
  assert.equal(pr?.exerciseId, null, 'oturum PR\'ı bir harekete ait değildir');
  assert.deepEqual(excludedExerciseIds, ['pushup']);
  assert.equal(detectSessionVolumePr('sess1', sets, 2000).pr, null);
});

test('E1 · ilk kayıt baseline loadPr üretir', () => {
  const r = detectForSet(set(), ex('seated-cable-row'), {});
  assert.ok(r.some((x) => x.prType === 'loadPr'));
});

test('E2 · eşit değer PR değildir', () => {
  const cur: CurrentPrs = { loadPr: { effectiveLoad: 80, raw: { loadKg: 80 } }, repsAtLoad: new Map([[80, 10]]), estimated1rm: 106.67 };
  assert.deepEqual(detectForSet(set({ raw: { loadKg: 80 }, reps: 10 }), ex('seated-cable-row'), cur), []);
});

test('E3 · ölçek karışımında loadPr üretilmez', () => {
  const ap = ex('assisted-pullup');
  const cur: CurrentPrs = { loadPr: { effectiveLoad: -35, raw: { assistanceKg: 35 } }, repsAtLoad: new Map() };
  const r = detectForSet(set({ exerciseId: ap.id, raw: { assistanceKg: 30, bodyweightKgSnapshot: 107 }, reps: 8 }), ap, cur);
  assert.equal(r.find((x) => x.prType === 'loadPr'), undefined, 'bw bilinen ile bilinmeyen kıyaslanmaz');
});

test('E6 · sıfır/negatif effective load e1RM üretmez', () => {
  const ap = ex('assisted-pullup');
  assert.equal(estimate1rm({ assistanceKg: 40 }, 8, ap), null, 'bw yoksa e1RM yok');
  assert.equal(estimate1rm({ assistanceKg: 120, bodyweightKgSnapshot: 107 }, 8, ap), null, 'negatif ölçekte e1RM yok');
});
