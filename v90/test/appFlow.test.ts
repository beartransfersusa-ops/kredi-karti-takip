// Uygulama bileşimi uçtan uca — src/bootstrap/container.ts.
//
// Ekranların çağırdığı YOLUN TAMAMI burada koşar: bootstrap → seed →
// onboarding → program → dashboard → antrenman → bitirme. Ekran bileşenleri
// React'e bağlı olduğu için test edilmiyor; ama onların çağırdığı her komut
// ve sorgu burada gerçek SQLite üzerinde çalışıyor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeClock } from '../src/core/clock/dateKey.ts';
import { NodeFileStore } from '../src/core/db/NodeFileStore.ts';
import { NodeSqliteProvider } from '../src/core/db/NodeSqliteProvider.ts';
import { nodeSha256 } from '../src/core/db/hash.node.ts';
import { bootstrap, BootstrapError } from '../src/bootstrap/container.ts';
import type { Services } from '../src/bootstrap/container.ts';
import type { SeedBundle } from '../src/core/db/seed.ts';
import { loadDashboard } from '../src/features/program/dashboardQuery.ts';
import { readOnboardingState } from '../src/features/profile/onboarding.ts';
import {
  saveBiceps, saveEquipmentAndFinish, saveInitialValues, saveTrainingProfile, startProgram,
} from '../src/features/profile/onboardingCommands.ts';
import { loadProgress } from '../src/features/progress/progressQuery.ts';
import { finishMode } from '../src/features/active-workout/finishModel.ts';
import { loadField, toRawLoad } from '../src/features/active-workout/loadField.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

const NOW = '2026-09-14T09:00:00.000Z';    // Pazartesi
const TZ = 'Europe/Istanbul';

function seedBundle(): SeedBundle {
  const ex = readJson('data/exercises.json');
  return {
    seedVersion: ex.seedVersion, exercises: ex.exercises, relations: ex.relations,
    program: readJson('data/programs/v90.json'),
    targets: readJson('data/muscle-volume-targets.json').targets,
  };
}

let idCounter = 0;
const testId = () => `id-${String(++idCounter).padStart(4, '0')}`;

async function boot(nowIso = NOW): Promise<{ s: Services; clock: FakeClock }> {
  const clock = new FakeClock(nowIso, TZ);
  const s = await bootstrap({
    clock,
    files: new NodeFileStore(),
    hash: nodeSha256,
    seed: seedBundle(),
    build: { isProduction: false, isExpoGo: false },
    provider: new NodeSqliteProvider(':memory:'),
    log: () => { /* geliştirme uyarısı testte sessiz */ },
  });
  return { s, clock };
}

/** Ekranların B.1–B.4'te yaptığı yazmaların aynısı. */
async function completeOnboarding(s: Services): Promise<void> {
  await s.db.withTransaction(async (tx) => {
    await saveTrainingProfile(tx, s.clock, testId, {
      experience: 'intermediate', gymType: 'fullCommercialGym',
      typicalWorkoutMinutes: 60, preferredWorkoutDays: [1, 3, 5],
      sleepTargetHours: 7.5, painAreas: [],
    });
    await saveInitialValues(tx, s.clock, testId, {
      heightCm: 187, weightKg: 107,
      measurementsCm: { waist: 95, shoulder: 137, chest: 110, abdomen: 114, hip: 119, forearm: 37 },
    });
    await saveBiceps(tx, s.clock, testId, {
      mode: 'single', samples: { bicepsFlexed: [38.5, 38.7] },
    }, (samples) => ({
      finalCm: Math.round((samples.reduce((a, b) => a + b, 0) / samples.length) * 10) / 10,
      aggregation: samples.length === 1 ? 'single' : 'mean',
    }));
    await saveEquipmentAndFinish(tx, s.clock, testId, 'fullCommercialGym',
      (readJson('data/equipment-presets.json') as { presets: Record<string, string[]> })
        .presets.fullCommercialGym as never);
    await startProgram(tx, s.clock, testId);
  });
  await s.catalog.reload();
}

test('bootstrap · şema + seed kurulur, servisler hazır', async () => {
  const { s } = await boot();
  try {
    assert.equal(s.seed.skipped, false);
    assert.equal(s.seed.insertedExercises, 32);
    assert.equal((await s.catalog.all()).size, 32);
    assert.equal(s.isEncrypted, false, 'testte şifresiz sağlayıcı verildi');

    // Program henüz yok → dashboard "boş" durumunda, çökme yok.
    const d = await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));
    assert.equal(d.card.kind, 'empty');
    assert.equal(d.bicepsKpi.state, 'missing');
  } finally { await s.close(); }
});

test('R93.7 · production + şifresiz sağlayıcı bootstrap\'ı durdurur', async () => {
  const err = await bootstrap({
    clock: new FakeClock(NOW, TZ), files: new NodeFileStore(), hash: nodeSha256,
    seed: seedBundle(), build: { isProduction: true, isExpoGo: false },
    provider: new NodeSqliteProvider(':memory:'),
  }).then(() => null, (e: unknown) => e);

  assert.ok(err instanceof BootstrapError);
  assert.equal((err as BootstrapError).step, 'build');
});

test('onboarding · adım DB\'den türetilir, hiçbir adım iki kez sorulmaz', async () => {
  const { s } = await boot();
  try {
    assert.equal((await s.db.withTransaction(readOnboardingState)).step, 'training');

    await s.db.withTransaction((tx) => saveTrainingProfile(tx, s.clock, testId, {
      experience: 'beginner', gymType: 'homeGym', typicalWorkoutMinutes: null,
      preferredWorkoutDays: [], sleepTargetHours: null, painAreas: [],
    }));
    assert.equal((await s.db.withTransaction(readOnboardingState)).step, 'initialValues');

    await s.db.withTransaction((tx) => saveInitialValues(tx, s.clock, testId, {
      heightCm: 187, weightKg: 107, measurementsCm: { waist: 95, chest: null },
    }));
    const afterValues = await s.db.withTransaction(readOnboardingState);
    assert.equal(afterValues.step, 'biceps');

    // R119.3: boş bırakılan alan YAZILMADI, 0 olarak da yazılmadı.
    const chest = await s.db.get('SELECT id FROM body_measurements WHERE site = ?', ['chest']);
    assert.equal(chest, undefined, 'boş alan satır üretmemeli');
    const waist = await s.db.get<{ final_value_cm: number; is_baseline: number }>(
      'SELECT final_value_cm, is_baseline FROM body_measurements WHERE site = ?', ['waist']);
    assert.equal(waist?.final_value_cm, 95);
    assert.equal(waist?.is_baseline, 1);
  } finally { await s.close(); }
});

test('AT-12 · biceps girilince dashboard KPI CTA\'dan değere geçer', async () => {
  const { s } = await boot();
  try {
    await completeOnboarding(s);
    const d = await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));
    assert.deepEqual(d.bicepsKpi, { state: 'known', valueCm: 38.6 });
  } finally { await s.close(); }
});

test('dashboard · onboarding sonrası sıradaki antrenman kartı ve başlatma', async () => {
  const { s } = await boot();
  try {
    await completeOnboarding(s);

    const d = await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));
    assert.equal(d.card.kind, 'next', 'plan otomatik oluşturulmalı');
    assert.equal(d.canStartWorkout, true);
    assert.equal(d.challengeDay?.day, 1);
    assert.equal(d.sequenceLabel, 1);
    assert.ok(d.template?.name_tr, 'şablon adı gelmeli');

    if (d.card.kind !== 'next') return;
    const started = await s.session.start({ commandId: testId(), scheduledWorkoutId: d.card.plan.id });
    assert.ok(started.value?.sessionId);

    // Artık öncelik 1: devam eden antrenman kartı.
    const after = await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));
    assert.equal(after.card.kind, 'resume');
    assert.equal(after.canStartWorkout, false);
  } finally { await s.close(); }
});

test('AT-01/AT-06 · set logla → bitir → adherence ve hacim doğru', async () => {
  const { s } = await boot();
  try {
    await completeOnboarding(s);
    const d = await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));
    assert.equal(d.card.kind, 'next');
    if (d.card.kind !== 'next') return;
    await s.session.start({ commandId: testId(), scheduledWorkoutId: d.card.plan.id });

    const snapshot = await s.session.hydrate();
    assert.ok(snapshot);
    const catalog = await s.catalog.all();
    const first = snapshot!.exercises[0]!;
    const exercise = catalog.get(first.exercise_id)!;
    const field = loadField(exercise);

    // Ekranın yaptığı gibi: yük alanını türe göre doldur, seti tamamla.
    for (let i = 0; i < first.planned_working_sets; i++) {
      await s.session.completeSet({
        commandId: testId(),
        sessionExerciseId: first.id,
        setIndex: i,
        setType: 'working',
        raw: toRawLoad(field, 60, snapshot!.session.bodyweight_kg_snapshot),
        reps: 10,
        rir: 2,
      });
    }

    const mid = await s.session.hydrate();
    assert.equal(mid!.exercises[0]!.status, 'done', 'planlanan set sayısına ulaşınca hareket biter');
    assert.equal(mid!.setLogs.length, first.planned_working_sets);

    // Kalan hareketler yapılmadı → kısmi.
    const mode = finishMode(mid!.exercises.map((e) => ({
      id: e.id, exerciseId: e.exercise_id, status: e.status,
      plannedWorkingSets: e.planned_working_sets, loggedWorkingSets: e.loggedWorkingSets,
    })), mid!.setLogs.length);
    assert.equal(mode.kind, 'partial');

    const finished = await s.session.finish({ commandId: testId(), origin: 'workoutScreen', finishHere: true });
    assert.equal(finished.value?.status, 'partial');
    assert.equal(finished.value?.decisionRequired, true, 'kullanıcı kararı GEREKLİ (R103.1)');

    // Karar verilene kadar sıra ilerlemez.
    const beforeDecision = await s.db.get<{ training_sequence_index: number }>(
      'SELECT training_sequence_index FROM programs LIMIT 1');
    assert.equal(beforeDecision?.training_sequence_index, 0);

    const sched = await s.db.get<{ id: string }>(
      `SELECT id FROM scheduled_workouts WHERE status = 'partiallyCompleted'`);
    await s.session.decidePartial({
      commandId: testId(), scheduledWorkoutId: sched!.id, decision: 'countAsDone',
    });
    const afterDecision = await s.db.get<{ training_sequence_index: number }>(
      'SELECT training_sequence_index FROM programs LIMIT 1');
    assert.equal(afterDecision?.training_sequence_index, 1, '"Bitmiş say" sırayı ilerletir (R88.6)');

    // AT-06: adherence tam/kısmi ayrımını korur.
    const progress = await s.db.withTransaction((tx) => loadProgress(tx, s.clock.todayKey(), catalog));
    assert.equal(progress.adherence?.partial, 1);
    assert.equal(progress.adherence?.completed, 0);

    // Haftalık hacim: bu hareketin ana kasına planlanan set sayısı kadar.
    const primary = progress.volumes.find((v) => v.muscle === exercise.primaryMuscle);
    assert.equal(primary?.directSets, first.planned_working_sets);
  } finally { await s.close(); }
});

test('AT-04 · kaçırılan antrenman sessizce atlanmaz', async () => {
  const { s, clock } = await boot();
  try {
    await completeOnboarding(s);
    await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));

    // 5 gün sonrasına git: plan kaçırıldı.
    clock.set('2026-09-19T09:00:00.000Z');
    const d = await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));

    assert.equal(d.card.kind, 'missed');
    assert.equal(d.canStartWorkout, false, 'karar verilmeden başlatma gösterilmez');

    // Sıra İLERLEMEMİŞ olmalı.
    const program = await s.db.get<{ training_sequence_index: number }>(
      'SELECT training_sequence_index FROM programs LIMIT 1');
    assert.equal(program?.training_sequence_index, 0);
  } finally { await s.close(); }
});

test('R89.3 · program dondurulunca kaçırılan kartı üretilmez', async () => {
  const { s, clock } = await boot();
  try {
    await completeOnboarding(s);
    await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));

    const programId = (await s.db.get<{ id: string }>('SELECT id FROM programs LIMIT 1'))!.id;
    await s.db.withTransaction((tx) => s.pauseService.pause(tx, programId, 'illness'));

    clock.set('2026-09-25T09:00:00.000Z');
    const d = await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));
    assert.equal(d.card.kind, 'paused');
    if (d.card.kind === 'paused') assert.equal(d.card.reason, 'illness');

    // Devam ettir → plan bugüne taşınır, sıra aynı kalır (R89.4, R89.7).
    await s.db.withTransaction((tx) => s.pauseService.resume(tx, programId));
    const after = await s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler));
    assert.ok(after.card.kind === 'next' || after.card.kind === 'missed');
    const program = await s.db.get<{ training_sequence_index: number }>(
      'SELECT training_sequence_index FROM programs LIMIT 1');
    assert.equal(program?.training_sequence_index, 0, 'dondurma sırayı ilerletmez');
  } finally { await s.close(); }
});
