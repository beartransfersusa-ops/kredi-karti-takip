// Ekran görünüm modelleri — docs/v90/06-ux-flows.md A.3, A.4, A.10, B.1–B.4.
//
// Ekranların kuralları saf fonksiyonlarda durur; burada o kurallar kilitlenir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromRawLoad, loadField, toRawLoad } from '../src/features/active-workout/loadField.ts';
import { allowedDateRange, endedReason, finishMode } from '../src/features/active-workout/finishModel.ts';
import type { FinishExercise } from '../src/features/active-workout/finishModel.ts';
import { firstPreferredOnOrAfter, monthGrid, programEndKey } from '../src/features/program/calendarGrid.ts';
import { validateCm, validateKg, nextStep, stepNumber } from '../src/features/profile/onboarding.ts';
import { addDaysKey, daysBetweenKeys, dateTr, elapsed, mmss, num, weekdayTr, UNKNOWN } from '../src/features/format.ts';
import type { Exercise } from '../src/domain/types.ts';

const ex = (over: Partial<Exercise> = {}): Exercise => ({
  id: 'x', name: 'X', nameTr: 'X', primaryMuscle: 'chest', secondaryMuscles: [],
  movementPattern: 'horizontalPush', equipment: [], lengthenedBias: 1, skillLevel: 'intermediate',
  jointStressProfile: {}, loadProgressionType: 'externalLoadHigherIsHarder', isUnilateral: false,
  volumeMultiplier: 1, defaultIncrementKg: 2.5, cues: [], ...over,
});

// ─────────────────────────────────────────────── A.3 · yük alanı (R101)

test('R101 · her yük türü doğru kolona yazılır', () => {
  assert.equal(loadField(ex()).rawKey, 'loadKg');
  assert.equal(loadField(ex({ loadProgressionType: 'assistanceLowerIsHarder' })).rawKey, 'assistanceKg');
  assert.equal(loadField(ex({ loadProgressionType: 'machineLevel' })).rawKey, 'machineLevel');
  assert.equal(loadField(ex({ loadProgressionType: 'distanceOrBand' })).rawKey, 'bandRank');
  assert.equal(loadField(ex({ loadProgressionType: 'bodyweight' })).rawKey, null);
});

test('AT-09 · yardımlı harekette "+" hareketi KOLAYLAŞTIRIR', () => {
  const assisted = loadField(ex({ loadProgressionType: 'assistanceLowerIsHarder' }));
  assert.equal(assisted.plusMeansHarder, false,
    'yardım artınca hareket kolaylaşır; ilerleme önerisi yardımı AZALTIR (R101.3)');
  assert.equal(assisted.hintKey, 'active.assistance.hint');
  // Diğer tüm türlerde "+" zorlaştırır.
  for (const type of ['externalLoadHigherIsHarder', 'bodyweightPlusExternalLoad', 'machineLevel', 'distanceOrBand'] as const) {
    assert.equal(loadField(ex({ loadProgressionType: type })).plusMeansHarder, true, type);
  }
});

test('makine seviyesi ve band adımı her zaman 1 · ara değer yok', () => {
  assert.equal(loadField(ex({ loadProgressionType: 'machineLevel', defaultIncrementKg: 2.5 })).step, 1);
  assert.equal(loadField(ex({ loadProgressionType: 'distanceOrBand', defaultIncrementKg: 2.5 })).step, 1);
  assert.equal(loadField(ex({ defaultIncrementKg: 1.25 })).step, 1.25, 'ağırlık adımı hareketten gelir');
});

test('R119.3 · vücut ağırlığı bilinmiyorsa NULL kalır, 0 yazılmaz', () => {
  const bw = loadField(ex({ loadProgressionType: 'bodyweight' }));
  assert.deepEqual(toRawLoad(bw, null, null), {}, 'bilinmeyen kilo hiç yazılmaz');
  assert.deepEqual(toRawLoad(bw, null, 107), { bodyweightKgSnapshot: 107 });

  const ext = loadField(ex());
  assert.deepEqual(toRawLoad(ext, 80, 107), { loadKg: 80 }, 'dış yükte vücut ağırlığı taşınmaz');
  assert.deepEqual(toRawLoad(ext, null, 107), {}, 'yük girilmediyse kolon boş kalır');
});

test('yük değeri gidiş-dönüş korunur', () => {
  const f = loadField(ex({ loadProgressionType: 'assistanceLowerIsHarder' }));
  assert.equal(fromRawLoad(f, toRawLoad(f, 22.5, 107)), 22.5);
  assert.equal(fromRawLoad(f, null), null);
  assert.equal(fromRawLoad(loadField(ex({ loadProgressionType: 'bodyweight' })), { loadKg: 5 }), null);
});

// ─────────────────────────────────────────────── A.4 · tam / kısmi (R103)

const fe = (status: FinishExercise['status'], logged = 0): FinishExercise =>
  ({ id: `e${status}${logged}`, exerciseId: `x${logged}`, status, plannedWorkingSets: 3, loggedWorkingSets: logged });

test('R103 · hiç set yoksa kısmi kararı SORULMAZ', () => {
  assert.deepEqual(finishMode([fe('pending')], 0), { kind: 'empty' });
});

test('tam · her hareket done ya da skipped', () => {
  assert.deepEqual(finishMode([fe('done', 3), fe('skipped')], 5), { kind: 'full' });
});

test('R103.1 · eksik hareket varsa oturum otomatik "completed" OLMAZ', () => {
  const m = finishMode([fe('done', 3), fe('inProgress', 1), fe('pending')], 4);
  assert.equal(m.kind, 'partial');
  if (m.kind === 'partial') {
    assert.equal(m.doneCount, 1);
    assert.equal(m.plannedCount, 3);
    assert.equal(m.missingCount, 2);
    // Devam planına taşınacak hareketler: 'done' olmayanların hepsi.
    assert.deepEqual(m.remainingExerciseIds, ['x1', 'x0']);
  }
});

test('ended_reason kaynağa göre ayrışır', () => {
  assert.equal(endedReason({ kind: 'full' }, 'workoutScreen'), 'allDone');
  assert.equal(endedReason({ kind: 'full' }, 'resumeCard'), 'resumeCardFinish');
  assert.equal(endedReason(
    { kind: 'partial', doneCount: 1, plannedCount: 3, missingCount: 2, remainingExerciseIds: [] },
    'workoutScreen'), 'finishHereToday');
});

test('R113.4 · tarih düzenleme aralığı başlangıç−1 gün … bugün', () => {
  assert.deepEqual(allowedDateRange('2026-09-12', '2026-09-13'),
    { min: '2026-09-11', max: '2026-09-13' });
  // Ay başında da doğru geriye sarar.
  assert.deepEqual(allowedDateRange('2026-03-01', '2026-03-01'),
    { min: '2026-02-28', max: '2026-03-01' });
});

// ─────────────────────────────────────────────── A.10 · takvim ızgarası

test('ızgara her ayda 42 hücre ve Pazartesi başlangıçlı', () => {
  const cells = monthGrid({
    monthAnchorKey: '2026-09-13', todayKey: '2026-09-13',
    preferredWeekdays: [1, 3, 5], pauses: [],
  });
  assert.equal(cells.length, 42);
  assert.equal(cells[0]!.weekday, 1, 'ilk sütun Pazartesi');
  assert.equal(cells.filter((c) => c.inMonth).length, 30, 'Eylül 30 gün');
});

test('geçmiş günler seçilemez (bugün hariç), dondurma aralığı kapalı', () => {
  const cells = monthGrid({
    monthAnchorKey: '2026-09-13', todayKey: '2026-09-13',
    preferredWeekdays: [], pauses: [{ startDateKey: '2026-09-20', endDateKey: '2026-09-22' }],
  });
  const at = (k: string) => cells.find((c) => c.key === k)!;
  assert.equal(at('2026-09-12').selectable, false, 'dün kapalı');
  assert.equal(at('2026-09-13').selectable, true, 'bugün açık');
  assert.equal(at('2026-09-21').selectable, false, 'dondurma aralığı kapalı');
  assert.equal(at('2026-09-21').paused, true);
  assert.equal(at('2026-09-23').selectable, true, 'dondurma bitince açık');
});

test('varsayılan seçim ilk TERCİH EDİLEN gün; dondurma atlanır', () => {
  // 2026-09-13 Pazar. Tercih: Pzt(1), Çar(3), Cum(5) → 14 Eylül Pazartesi.
  assert.equal(firstPreferredOnOrAfter('2026-09-13', [1, 3, 5]), '2026-09-14');
  // 14'ü dondurulmuşsa bir sonraki tercih gününe kayar.
  assert.equal(
    firstPreferredOnOrAfter('2026-09-13', [1, 3, 5], [{ startDateKey: '2026-09-14', endDateKey: '2026-09-14' }]),
    '2026-09-16');
  // Tercih yoksa günün kendisi.
  assert.equal(firstPreferredOnOrAfter('2026-09-13', []), '2026-09-13');
});

test('activeDays modunda program bitişi dondurma günü kadar uzar (R89.5)', () => {
  // end_date_key DEVAM günüdür ve sayılmaz: 20–22 Eylül = 2 dondurma günü
  // (AT-20: 1–6 Ekim → 5 gün). Sayım motorun pausedDays'ine devredildi.
  const pauses = [{ startDateKey: '2026-09-20', endDateKey: '2026-09-22' }];
  assert.equal(programEndKey('2026-09-01', 90, 'strictCalendar', pauses, '2026-09-30'), '2026-11-29');
  assert.equal(programEndKey('2026-09-01', 90, 'activeDays', pauses, '2026-09-30'), '2026-12-01');
});

// ─────────────────────────────────────────────── B.2 · giriş doğrulama

test('R119.4 · 0 reddedilir, boş kabul edilir', () => {
  assert.deepEqual(validateCm(null), { ok: true, value: null });
  assert.deepEqual(validateCm(95), { ok: true, value: 95 });
  assert.deepEqual(validateCm(0), { ok: false, messageKey: 'validation.zeroNotAllowed' });
  assert.deepEqual(validateCm(300), { ok: false, messageKey: 'validation.outOfRange.cm' });
  assert.deepEqual(validateKg(0), { ok: false, messageKey: 'validation.zeroNotAllowed' });
  assert.deepEqual(validateKg(401), { ok: false, messageKey: 'validation.outOfRange.kg' });
  assert.deepEqual(validateKg(107), { ok: true, value: 107 });
});

test('onboarding adım sırası', () => {
  assert.equal(nextStep('training'), 'initialValues');
  assert.equal(nextStep('equipment'), 'done');
  assert.equal(nextStep('done'), 'done', 'son adımdan ileri gidilmez');
  assert.deepEqual(stepNumber('training'), { index: 1, total: 4 });
  assert.deepEqual(stepNumber('equipment'), { index: 4, total: 4 });
});

// ─────────────────────────────────────────────── biçimlendirme

test('mm:ss ve geçen süre', () => {
  assert.equal(mmss(0), '0:00');
  assert.equal(mmss(9), '0:09');
  assert.equal(mmss(150), '2:30');
  assert.equal(mmss(-5), '0:00', 'negatif süre 0 gösterilir');
  assert.equal(elapsed(42 * 60), '42 dk');
  assert.equal(elapsed(72 * 60), '1 sa 12 dk');
});

test('R123.1 · bilinmeyen değer "—", asla 0', () => {
  assert.equal(num(null), UNKNOWN);
  assert.equal(num(undefined), UNKNOWN);
  assert.equal(num(Number.NaN), UNKNOWN);
  assert.equal(num(0), '0', 'gerçekten 0 olan değer gösterilir');
  assert.equal(num(107.25, 1, 'kg'), '107.3 kg');
});

test('tarih yardımcıları', () => {
  assert.equal(weekdayTr('2026-09-13'), 'Pazar');
  assert.equal(dateTr('2026-09-13'), '13 Eylül');
  assert.equal(dateTr('2025-01-02', '2026-09-13'), '2 Ocak 2025', 'farklı yıl belirtilir');
  assert.equal(addDaysKey('2026-02-28', 1), '2026-03-01');
  assert.equal(daysBetweenKeys('2026-09-10', '2026-09-13'), 3);
  assert.equal(daysBetweenKeys('2026-09-13', '2026-09-10'), -3);
});
