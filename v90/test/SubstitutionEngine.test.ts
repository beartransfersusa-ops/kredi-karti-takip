// docs/v90/04-domain-engines.md §8.6 test vektörleri (gerçek seed kataloğu ile).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alternatives, isAvailable } from '../src/domain/exercise/SubstitutionEngine.ts';
import type { EquipmentTag } from '../src/domain/types.ts';
import { EXERCISES, RELATIONS, ex } from './fixtures.ts';

const ALL: EquipmentTag[] = [
  'cableStation', 'latPulldown', 'chestSupportedRow', 'plateLoadedMachine', 'selectorizedMachine',
  'dumbbells', 'barbells', 'smithMachine', 'hackSquat', 'legPress', 'legExtension', 'legCurl',
  'pecDeck', 'preacherBench', 'adjustableBench', 'pullupBar', 'dipStation', 'assistedPullupMachine',
  'resistanceBands', 'bodyweightOnly',
];
const ctx = (over: Partial<Parameters<typeof alternatives>[2]> = {}) =>
  ({ available: ALL, relations: RELATIONS, ...over });
const ids = (cs: { exercise: { id: string } }[]) => cs.map((c) => c.exercise.id);

test('TV-8.01 · Cable Lateral Raise → machine, dumbbell (R99.4)', () => {
  const r = alternatives('cable-lateral-raise', EXERCISES, ctx());
  assert.deepEqual(ids(r.sameIntent).slice(0, 2), ['machine-lateral-raise', 'dumbbell-lateral-raise']);
});

test('TV-8.02 · Lat Pulldown → assisted pull-up, plate-loaded (ekipman eksikken)', () => {
  const available = ALL.filter((t) => t !== 'latPulldown');
  const r = alternatives('lat-pulldown', EXERCISES, ctx({ available }));
  assert.deepEqual(ids(r.sameIntent).slice(0, 2), ['assisted-pullup', 'plate-loaded-pulldown']);
  assert.ok(!ids(r.sameIntent).includes('lat-pulldown'));
});

test('TV-8.03 · Hack Squat → leg press, smith squat', () => {
  const available = ALL.filter((t) => t !== 'hackSquat');
  const r = alternatives('hack-squat', EXERCISES, ctx({ available }));
  assert.deepEqual(ids(r.sameIntent).slice(0, 2), ['leg-press', 'smith-squat']);
});

test('TV-8.04 · ekipmanı olmayan aday listelenmez (R98.4)', () => {
  const available = ALL.filter((t) => t !== 'dumbbells');
  const r = alternatives('cable-lateral-raise', EXERCISES, ctx({ available }));
  assert.ok(!ids(r.sameIntent).includes('dumbbell-lateral-raise'));
  assert.ok(ids(r.sameIntent).includes('machine-lateral-raise'));
});

test('TV-8.05 · ağrı bölgesi adayları cezalandırır', () => {
  const noPain = alternatives('machine-chest-press', EXERCISES, ctx());
  const withPain = alternatives('machine-chest-press', EXERCISES, ctx({ painAreas: ['shoulder'] }));
  const pecNo = noPain.sameIntent.find((c) => c.exercise.id === 'pec-deck')!;
  const pecPain = withPain.sameIntent.find((c) => c.exercise.id === 'pec-deck')!;
  assert.ok(pecPain.score < pecNo.score, 'omuz stresi olan aday ceza almalı');
  assert.equal(pecNo.score - pecPain.score, 50, 'omuz stresi 2 × 25');
});

test('TV-8.06 · deterministik: aynı girdi aynı sıra', () => {
  const a = ids(alternatives('cable-lateral-raise', EXERCISES, ctx()).sameIntent);
  const b = ids(alternatives('cable-lateral-raise', [...EXERCISES].reverse(), ctx()).sameIntent);
  assert.deepEqual(a, b, 'katalog sırası sonucu değiştirmemeli (R99.2)');
});

test('TV-8.10 · home gym preset makineleri eler', () => {
  const home: EquipmentTag[] = ['dumbbells', 'adjustableBench', 'resistanceBands', 'pullupBar', 'bodyweightOnly', 'barbells'];
  const r = alternatives('cable-lateral-raise', EXERCISES, ctx({ available: home }));
  assert.deepEqual(ids(r.sameIntent), ['dumbbell-lateral-raise']);
});

test('sameIntent / otherIntent ayrımı', () => {
  const r = alternatives('lat-pulldown', EXERCISES, ctx());
  assert.ok(r.sameIntent.every((c) => c.exercise.movementPattern === 'verticalPull'));
  assert.ok(r.otherIntent.every((c) => c.exercise.movementPattern !== 'verticalPull'));
  assert.ok(r.otherIntent.every((c) => c.exercise.primaryMuscle === 'lats'));
});

test('gerekçe metni üretilir', () => {
  const r = alternatives('cable-lateral-raise', EXERCISES, ctx());
  const first = r.sameIntent[0]!;
  assert.ok(first.reasonsTr.length > 0);
  assert.equal(first.reasonsTr[0], 'Aynı kas');
  assert.ok(first.reasonsTr.includes('aynı hareket kalıbı'));
});

test('ileri seviye aday uyarı taşır', () => {
  const available = ALL.filter((t) => t !== 'latPulldown' && t !== 'assistedPullupMachine' && t !== 'plateLoadedMachine');
  const r = alternatives('lat-pulldown', EXERCISES, ctx({ available, experience: 'beginner' }));
  const pullup = r.sameIntent.find((c) => c.exercise.id === 'pullup');
  assert.ok(pullup, 'pull-up listelenmeli');
  assert.ok(pullup!.reasonsTr.includes('ileri seviye'));
});

test('bodyweightOnly her zaman mevcuttur', () => {
  assert.equal(isAvailable(ex('pullup'), ['pullupBar']), true);
  assert.equal(isAvailable(ex('cable-lateral-raise'), []), false);
});

test('bilinmeyen hareket hata verir', () => {
  assert.throws(() => alternatives('yok-boyle-bir-sey', EXERCISES, ctx()), /katalogda yok/);
});
