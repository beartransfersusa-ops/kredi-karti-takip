// docs/v90/04-domain-engines.md §3.5 test vektörleri + AT-08, AT-09.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparable, effectiveLoad, toRaw } from '../src/domain/exercise/LoadBehavior.ts';
import {
  resolveIncrement, roundToAvailable, targetFromPercent,
} from '../src/domain/exercise/IncrementResolver.ts';
import { ex, fakeExercise } from './fixtures.ts';

test('TV-3.01 (AT-08) · makine artışı imkânsız değeri reddeder, tekrara düşer', () => {
  const spec = resolveIncrement(ex('leg-press'));
  assert.equal(spec.incrementKg, 5);
  assert.equal(spec.source, 'exercise');
  assert.deepEqual(targetFromPercent(80, 0.03, spec), { value: 80, fallback: 'repProgression' });
});

test('TV-3.02 (AT-08) · cable 2.5 kg adımı 82,5 verir', () => {
  const spec = resolveIncrement(ex('seated-cable-row'));
  assert.equal(spec.incrementKg, 2.5);
  assert.deepEqual(targetFromPercent(80, 0.03, spec), { value: 82.5 });
});

test('TV-3.03 · dumbbell 12 kg @ +%5 → adım atlanmaz, tekrara düşer', () => {
  // 12,6 hedefi 12 ile 14 arasında 12'ye yakın; 14 kg %16,7 sıçrama olurdu.
  const spec = resolveIncrement(ex('incline-dumbbell-curl'));
  assert.equal(spec.incrementKg, 2);
  assert.deepEqual(targetFromPercent(12, 0.05, spec), { value: 12, fallback: 'repProgression' });
});

test('TV-3.04 · ayrık rack: eşit uzaklıkta yukarı yuvarlanır', () => {
  const spec = resolveIncrement(fakeExercise({ id: 'db', equipment: ['dumbbells'], availableLoadsKg: [10, 12, 14, 16] }));
  assert.deepEqual(roundToAvailable(13, 12, spec), { value: 14 });
  assert.deepEqual(roundToAvailable(12.4, 12, spec), { value: 14 }, 'aynı kademede kalınca bir üst gerçek kademe');
});

test('TV-3.05 · barbell 60 @ +%4 → 62,5', () => {
  const spec = resolveIncrement(ex('romanian-deadlift'));
  assert.deepEqual(targetFromPercent(60, 0.04, spec), { value: 62.5 });
});

test('TV-3.06 / TV-3.07 / TV-3.08 (AT-09) · assisted: yardım azalması ilerlemedir', () => {
  const pullup = ex('assisted-pullup');
  assert.equal(pullup.loadProgressionType, 'assistanceLowerIsHarder');

  // bodyweight biliniyor: 107 − 40 = 67 → hedef 72 → yardım 35
  const known = { assistanceKg: 40, bodyweightKgSnapshot: 107 };
  assert.equal(effectiveLoad(known, pullup), 67);
  assert.deepEqual(toRaw(72, pullup, known), { assistanceKg: 35, bodyweightKgSnapshot: 107 });

  // bodyweight bilinmiyor: ölçek negatif ama sıralama korunur
  const unknown = { assistanceKg: 40 };
  assert.equal(effectiveLoad(unknown, pullup), -40);
  assert.deepEqual(toRaw(-35, pullup, unknown), { assistanceKg: 35 });
  assert.ok(effectiveLoad({ assistanceKg: 35 }, pullup)! > effectiveLoad({ assistanceKg: 40 }, pullup)!,
    '35 kg yardım 40 kg yardımdan DAHA ZOR sayılmalı');

  // gerileme: yardım artışı ilerleme değildir
  assert.ok(effectiveLoad({ assistanceKg: 40 }, pullup)! < effectiveLoad({ assistanceKg: 35 }, pullup)!);
});

test('TV-3.09 · weighted pull-up: gerçek yük = bw + ek', () => {
  const wp = fakeExercise({ id: 'wp', loadProgressionType: 'bodyweightPlusExternalLoad' });
  const cur = { loadKg: 10, bodyweightKgSnapshot: 100 };
  assert.equal(effectiveLoad(cur, wp), 110);
  assert.deepEqual(toRaw(112.5, wp, cur), { loadKg: 12.5, bodyweightKgSnapshot: 100 });
});

test('TV-3.10 · bodyweight: yük önerisi üretilmez', () => {
  const pu = fakeExercise({ id: 'pushup', loadProgressionType: 'bodyweight' });
  assert.equal(effectiveLoad({ bodyweightKgSnapshot: 107 }, pu), 107);
  assert.equal(effectiveLoad({}, pu), null, 'kilo bilinmiyorsa ölçek yok');
  assert.deepEqual(toRaw(110, pu, { bodyweightKgSnapshot: 107 }), { bodyweightKgSnapshot: 107 });
});

test('TV-3.11 / TV-3.12 · ordinal türler', () => {
  const lvl = fakeExercise({ id: 'lvl', loadProgressionType: 'machineLevel' });
  assert.equal(effectiveLoad({ machineLevel: 6 }, lvl), 6);
  assert.deepEqual(toRaw(7, lvl, { machineLevel: 6 }), { machineLevel: 7 });
  const band = fakeExercise({ id: 'band', loadProgressionType: 'distanceOrBand' });
  assert.equal(effectiveLoad({ bandRank: 2 }, band), 2);
  assert.deepEqual(toRaw(3, band, { bandRank: 2 }), { bandRank: 3 });
});

test('TV-3.13 · kullanıcı artış adımı kazanır', () => {
  const spec = resolveIncrement(ex('leg-press'), { minIncrementKg: 1.25 });
  assert.equal(spec.source, 'user');
  // 82,4 hedefi 1,25 kademelerinde 82,5'e en yakın (81,25'ten 1,15 uzak).
  assert.deepEqual(targetFromPercent(80, 0.03, spec), { value: 82.5 });
});

test('TV-3.14 · rack tavanı', () => {
  const spec = resolveIncrement(fakeExercise({ id: 'db2', availableLoadsKg: [28, 30, 32] }));
  assert.deepEqual(roundToAvailable(34, 32, spec), { value: 32, fallback: 'repProgression', clamped: 'max' });
});

test('TV-3.15 · deload aşağı yuvarlanır, fallback üretmez', () => {
  const spec = resolveIncrement(ex('seated-cable-row'));
  assert.deepEqual(roundToAvailable(90, 100, spec), { value: 90 });
});

test('E1–E8 · sınır durumları', () => {
  const e = ex('seated-cable-row');
  assert.deepEqual(resolveIncrement(e, { availableLoadsKg: [] }).availableLoads, undefined, 'boş liste yok sayılır');
  assert.throws(() => resolveIncrement(e, { minIncrementKg: 0 }), /minIncrementKg/);
  // ölçek karışımı: biri bodyweight biliyor, diğeri bilmiyor
  const ap = ex('assisted-pullup');
  assert.equal(comparable({ assistanceKg: 40, bodyweightKgSnapshot: 107 }, { assistanceKg: 35 }, ap), false);
  assert.equal(comparable({ assistanceKg: 40 }, { assistanceKg: 35 }, ap), true);
  assert.equal(comparable({ loadKg: 80 }, { loadKg: 82.5 }, e), true, 'harici yükte ölçek sorunu yok');
  // veri hatası: yardım > bodyweight → negatif ama sıralama bozulmaz
  assert.equal(effectiveLoad({ assistanceKg: 120, bodyweightKgSnapshot: 107 }, ap), -13);
});

test('çoklu ekipmanda en ince adım kazanır', () => {
  const e = fakeExercise({ id: 'multi', equipment: ['selectorizedMachine', 'dumbbells'], defaultIncrementKg: null });
  assert.equal(resolveIncrement(e).incrementKg, 2, 'machine 5 yerine dumbbell 2');
  assert.equal(resolveIncrement(e).source, 'equipment');
});
