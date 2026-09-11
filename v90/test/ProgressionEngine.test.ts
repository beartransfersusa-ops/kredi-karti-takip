// docs/v90/04-domain-engines.md §4.5 test vektörleri + AT-07, AT-09.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, weakestSide } from '../src/domain/progression/ProgressionEngine.ts';
import { resolveIncrement } from '../src/domain/exercise/IncrementResolver.ts';
import type { Exposure, RecommendationDecision, Side, WorkingSetRef } from '../src/domain/types.ts';
import { ex } from './fixtures.ts';

const TARGET = { repMin: 10, repMax: 12, targetRir: 2, plannedWorkingSets: 3 };

function sets(spec: Array<[reps: number, rir: number | null, load: number]>,
  flags: Partial<Pick<WorkingSetRef, 'painFlag' | 'formBreakdownFlag'>> = {}): WorkingSetRef[] {
  return spec.map(([reps, rir, load], i) => ({
    setLogId: `s${i + 1}`, setIndex: i + 1, effectiveLoad: load, reps, rir,
    painFlag: false, formBreakdownFlag: false, excludeFromPr: false, ...flags,
  }));
}
const expo = (ws: WorkingSetRef[], over: Partial<Exposure> = {}): Exposure => ({
  sessionId: 'sess', calendarDateKey: '2026-09-07', exerciseId: 'seated-cable-row',
  side: 'both', workingSets: ws, target: TARGET, ...over,
});
const cableRow = () => ({ exercise: ex('seated-cable-row'), incrementSpec: resolveIncrement(ex('seated-cable-row')) });

test('TV-4.01 (AT-07) · 12/12/12 @ RIR 2 → yükü artır, 82,5 kg', () => {
  const r = recommend({ ...cableRow(), exposures: [expo(sets([[12, 2, 80], [12, 2, 80], [12, 2, 80]]))], currentRaw: { loadKg: 80 } })!;
  assert.equal(r.kind, 'loadIncrease');
  assert.equal(r.proposed.effectiveLoad, 82.5);
  assert.deepEqual(r.proposed.raw, { loadKg: 82.5 });
  assert.equal(r.rationaleTr, 'Son antrenmanda 3/3 sette 12 tekrar yaptın ve RIR hedefinin içinde kaldın.');
  assert.deepEqual(r.evidence.setLogIds, ['s1', 's2', 's3']);
});

test('TV-4.02 (AT-08) · kademe yüke göre çok büyükse tekrar hedefi artır', () => {
  const lp = ex('leg-press');                       // 5 kg kademe
  // 40 kg'da bir kademe %12,5 sıçrama demek → yük yerine tekrar.
  const r = recommend({ exercise: lp, incrementSpec: resolveIncrement(lp), exposures: [expo(sets([[12, 2, 40], [12, 2, 40], [12, 2, 40]]))] })!;
  assert.equal(r.kind, 'repIncrease');
  assert.equal(r.proposed.reason, 'incrementTooCoarse');
  assert.equal(r.proposed.reps, 13, 'yük artamıyorsa aralığın üstüne çıkılır');

  // 80 kg'da aynı kademe %6,25 → kabul edilir.
  const ok = recommend({ exercise: lp, incrementSpec: resolveIncrement(lp), exposures: [expo(sets([[12, 2, 80], [12, 2, 80], [12, 2, 80]]))], currentRaw: { loadKg: 80 } })!;
  assert.equal(ok.kind, 'loadIncrease');
  assert.equal(ok.proposed.effectiveLoad, 85);
});

test('TV-4.03 · 12/11/9 @ RIR 2 → tekrar artır (tek set alt sınırın altında)', () => {
  const r = recommend({ ...cableRow(), exposures: [expo(sets([[12, 2, 80], [11, 2, 80], [9, 2, 80]]))] })!;
  assert.equal(r.kind, 'repIncrease');
  assert.equal(r.proposed.reps, 10);
});

test('TV-4.04 / TV-4.05 · tüm setler hedefin altında: önce koru, sonra düşür', () => {
  const bad = expo(sets([[8, 0, 80], [7, 0, 80], [6, 0, 80]]));
  const first = recommend({ ...cableRow(), exposures: [bad] })!;
  assert.equal(first.kind, 'holdLoad');
  assert.equal(first.proposed.reason, 'belowTarget');

  const second = recommend({ ...cableRow(), exposures: [bad, bad], currentRaw: { loadKg: 80 } })!;
  assert.equal(second.kind, 'loadDecrease');
  assert.equal(second.proposed.effectiveLoad, 72.5);   // 80 − %10 = 72 → 2,5 kademesinde 72,5
  assert.match(second.rationaleTr, /İki antrenman üst üste/);
});

test('12/12/12 ama RIR 0 → yük zaten sınırda, artırma', () => {
  const r = recommend({ ...cableRow(), exposures: [expo(sets([[12, 0, 80], [12, 0, 80], [12, 0, 80]]))] })!;
  assert.equal(r.kind, 'holdLoad');
  assert.equal(r.proposed.reason, 'belowTarget');
});

test('TV-4.06 (AT-09) · assisted: yardımı azalt, "ağırlığı artır" deme', () => {
  const ap = ex('assisted-pullup');
  const raw = { assistanceKg: 40, bodyweightKgSnapshot: 107 };
  const r = recommend({
    exercise: ap, incrementSpec: resolveIncrement(ap), currentRaw: raw,
    exposures: [expo(sets([[12, 2, 67], [12, 2, 67], [12, 2, 67]]), { exerciseId: ap.id })],
  })!;
  assert.equal(r.kind, 'loadIncrease');
  assert.equal(r.proposed.effectiveLoad, 72);
  assert.equal(r.proposed.raw?.assistanceKg, 35, 'yardım 40 → 35 (azalış = ilerleme)');
});

test('TV-4.07 / TV-4.08 (R121.3) · kullanıcı kararı sıçrama tavanını daraltır', () => {
  const lp = ex('leg-press');
  // 80 kg + 5 kg = %6,25: normalde kabul, muhafazakâr modda (tavan %5) reddedilir.
  const base = { exercise: lp, incrementSpec: resolveIncrement(lp), currentRaw: { loadKg: 80 },
    exposures: [expo(sets([[12, 2, 80], [12, 2, 80], [12, 2, 80]]))] };
  assert.equal(recommend(base)!.kind, 'loadIncrease');
  assert.equal(recommend(base)!.proposed.effectiveLoad, 85);

  const ignored: RecommendationDecision[] = Array.from({ length: 3 }, () => ({ action: 'ignored', decidedAtUtc: '2026-09-01T00:00:00.000Z' }));
  const soft = recommend({ ...base, decisionHistory: ignored })!;
  assert.equal(soft.kind, 'repIncrease', '3 kez yok sayıldıysa yük artışı ertelenir');

  const modifiedDown: RecommendationDecision[] = [{ action: 'modified', proposedValue: 85, userValue: 80, decidedAtUtc: '2026-09-01T00:00:00.000Z' }];
  assert.equal(recommend({ ...base, decisionHistory: modifiedDown })!.kind, 'repIncrease');

  // Kademe zaten küçükse muhafazakâr mod da yük artışını engellemez.
  const cable = { ...cableRow(), currentRaw: { loadKg: 100 },
    exposures: [expo(sets([[12, 2, 100], [12, 2, 100], [12, 2, 100]]))], decisionHistory: ignored };
  assert.equal(recommend(cable)!.proposed.effectiveLoad, 102.5);
});

test('TV-4.09 (R103.5) · kısmi antrenmandan yük önerisi çıkmaz', () => {
  // 2/3 set tepede olsa bile: eksik veriden yük artırılmaz.
  const r = recommend({ ...cableRow(), exposures: [expo(sets([[12, 2, 80], [12, 2, 80]]))] })!;
  assert.equal(r.kind, 'holdLoad');
  assert.equal(r.proposed.reason, 'partialSession');
  assert.match(r.rationaleTr, /planlanan 3 setin 2 tanesini/);
});

test('TV-4.10 (R102.3) · unilateral: en zayıf taraf belirler', () => {
  const left = expo(sets([[12, 2, 22], [12, 2, 22], [12, 2, 22]]), { side: 'left' });
  const right = expo(sets([[10, 2, 20], [10, 2, 20], [9, 2, 20]]), { side: 'right' });
  assert.equal(weakestSide({ left, right }), 'right');
  assert.equal(weakestSide({ left }), 'left');
  assert.equal(weakestSide({}), null);
});

test('TV-4.11 · RIR bilinmiyorsa tekrar kuralı geçerli', () => {
  const r = recommend({ ...cableRow(), exposures: [expo(sets([[12, null, 80], [12, null, 80], [12, null, 80]]))], currentRaw: { loadKg: 80 } })!;
  assert.equal(r.kind, 'loadIncrease');
});

test('TV-4.12 · ağrı işaretli sette asla yük artırılmaz', () => {
  const ws = sets([[12, 2, 80], [12, 2, 80], [12, 2, 80]]);
  ws[2]!.painFlag = true;
  const r = recommend({ ...cableRow(), exposures: [expo(ws)] })!;
  assert.equal(r.kind, 'holdLoad');
  assert.equal(r.proposed.reason, 'pain');
});

test('form bozulması çoğunluktaysa yük artırılmaz', () => {
  const ws = sets([[12, 2, 80], [12, 2, 80], [12, 2, 80]]);
  ws[0]!.formBreakdownFlag = true; ws[1]!.formBreakdownFlag = true;
  assert.equal(recommend({ ...cableRow(), exposures: [expo(ws)] })!.proposed.reason, 'formBreakdown');
});

test('E1 · hiç set yoksa öneri üretilmez', () => {
  assert.equal(recommend({ ...cableRow(), exposures: [] }), null);
  assert.equal(recommend({ ...cableRow(), exposures: [expo([])] }), null);
});

test('E3 · excludeFromPr set progression\'a dahildir', () => {
  const ws = sets([[12, 2, 80], [12, 2, 80], [12, 2, 80]]);
  ws[1]!.excludeFromPr = true;
  assert.equal(recommend({ ...cableRow(), exposures: [expo(ws)], currentRaw: { loadKg: 80 } })!.kind, 'loadIncrease');
});

test('E4 · piramit setlerde en çok tekrarlanan yük esas alınır', () => {
  const r = recommend({ ...cableRow(), exposures: [expo(sets([[12, 2, 80], [12, 2, 80], [12, 2, 70]]))], currentRaw: { loadKg: 80 } })!;
  assert.equal(r.evidence.metrics.currentEffectiveLoad, 80);
});

test('bodyweight ölçeği yoksa yük yerine tekrar önerilir', () => {
  const pu = { ...ex('pullup'), loadProgressionType: 'bodyweight' as const };
  const ws = sets([[12, 2, 0], [12, 2, 0], [12, 2, 0]]).map((s) => ({ ...s, effectiveLoad: null }));
  const r = recommend({ exercise: pu, incrementSpec: resolveIncrement(pu), exposures: [expo(ws, { exerciseId: pu.id })] })!;
  assert.equal(r.kind, 'repIncrease');
});
