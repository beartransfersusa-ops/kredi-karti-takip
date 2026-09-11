// Servis katmanı entegrasyon testleri — gerçek SQLite, gerçek seed, gerçek kısıtlar.
// AT-01, AT-02, AT-04, AT-05, AT-06 (docs/v90/05-acceptance-tests.md)
// ve 04-domain-engines.md §1.3.1 durum makinesi geçişleri T1–T10.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  allScheduled, makeHarness, openPlan, programRow, sequenceEventRows,
} from './integration-helpers.ts';
import type { Harness } from './integration-helpers.ts';
import { ActiveSessionExistsError, InvalidRescheduleDateError, InvalidTransitionError,
  PendingPartialDecisionError, SetAlreadyLoggedError } from '../src/domain/program/errors.ts';

let cmd = 0;
const c = () => `cmd-${++cmd}`;

/** Planı başlatıp tüm working setleri loglar. */
async function doFullWorkout(h: Harness, planId: string): Promise<string> {
  const start = await h.session.start({ commandId: c(), scheduledWorkoutId: planId });
  const sessionId = start.value!.sessionId;
  const snap = (await h.session.hydrate())!;
  for (const e of snap.exercises) {
    for (let i = 1; i <= e.planned_working_sets; i++) {
      h.clock.advanceSeconds(120);
      await h.session.completeSet({
        commandId: c(), sessionExerciseId: e.id, setIndex: i,
        raw: { loadKg: 60 }, reps: 10, rir: 2,
      });
    }
  }
  return sessionId;
}

const withH = async (fn: (h: Harness) => Promise<void>, opts?: Parameters<typeof makeHarness>[0]) => {
  const h = await makeHarness(opts);
  try { await fn(h); } finally { await h.close(); }
};

// ---------------------------------------------------------------- T1 planlama
test('T1 · ensurePlanned sıradaki şablonu bir kez planlar', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const p = (await openPlan(h))!;
    assert.equal(p.sequence_index, 0);
    assert.equal(p.workout_template_id, 'v90-d1-push');
    assert.equal(p.planned_date_key, '2026-09-07');

    // İkinci çağrı yeni plan üretmez (I1).
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    assert.equal((await allScheduled(h)).length, 1);
  });
});

test('T1 · tercih edilen günlere göre ileri atılır; program başlamadan plan yok', async () => {
  await withH(async (h) => {                       // 2026-09-07 Pazartesi; tercih Salı/Perşembe
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    assert.equal((await openPlan(h))!.planned_date_key, '2026-09-08');
  }, { preferredWorkoutDays: [2, 4] });

  await withH(async (h) => {
    const r = await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    assert.equal(r.outcome, 'created');
    assert.equal((await openPlan(h))!.planned_date_key, '2026-09-20', 'başlangıçtan önce plan yapılmaz');
  }, { startDateKey: '2026-09-20' });
});

// ---------------------------------------------------------------- AT-01 / AT-02
test('AT-01 · oturum kapanış sonrası aynen geri yüklenir', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    const started = await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    assert.equal(started.applied, true);

    const snap0 = (await h.session.hydrate())!;
    assert.equal(snap0.exercises.length, 6, 'Day 1 – Push 6 hareket');

    const first = snap0.exercises[0]!;
    await h.session.completeSet({ commandId: c(), sessionExerciseId: first.id, setIndex: 1, raw: { loadKg: 60 }, reps: 10, rir: 2 });
    await h.session.completeSet({ commandId: c(), sessionExerciseId: first.id, setIndex: 2, raw: { loadKg: 60 }, reps: 9, rir: 1 });
    // Tamamlanmamış set taslağı da kalıcı olmalı
    await h.session.draftInput({ sessionExerciseId: snap0.exercises[1]!.id, load: { loadKg: 60 }, reps: 11 });

    // "Uygulama kapandı" → aynı DB'den yeniden oku
    const snap = (await h.session.hydrate())!;
    assert.equal(snap.session.status, 'active');
    assert.equal(snap.setLogs.length, 2);
    assert.equal(snap.setLogs[0]!.reps, 10);
    assert.equal(snap.setLogs[1]!.rir, 1);
    const second = snap.exercises[1]!;
    assert.equal(second.prefill.source, 'draft');
    assert.equal(second.prefill.reps, 11);
    assert.equal(snap.exercises[0]!.loggedWorkingSets, 2);
    assert.equal(snap.exercises[0]!.prefill.source, 'previousSet');
  });
});

test('AT-02 · set anında kalıcı; aynı command_id tekrarında ikinci satır oluşmaz', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;

    const id = c();
    const first = await h.session.completeSet({ commandId: id, sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 80 }, reps: 10, rir: 2 });
    assert.equal(first.applied, true);
    const again = await h.session.completeSet({ commandId: id, sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 80 }, reps: 10, rir: 2 });
    assert.equal(again.applied, false);
    assert.equal(again.reason, 'duplicate');
    assert.equal(again.value?.setLogId, first.value!.setLogId, 'orijinal set geri döner');

    const rows = await h.db.withTransaction((tx) => tx.all('SELECT * FROM set_logs'));
    assert.equal(rows.length, 1, 'çift kayıt yok');
  });
});

test('set kaydı oturumun gününe yazılır (R113.1)', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });      // yerel 23:50
    const se = (await h.session.hydrate())!.exercises[0]!;
    h.clock.set('2026-09-07T21:10:00.000Z');                                      // yerel 00:10, ertesi gün
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 60 }, reps: 10, rir: 2 });
    const log = await h.db.withTransaction((tx) => tx.get<{ local_date_key: string }>('SELECT local_date_key FROM set_logs'));
    assert.equal(h.clock.todayKey(), '2026-09-08');
    assert.equal(log!.local_date_key, '2026-09-07', 'yazma anının değil, oturumun günü');
  }, { nowIso: '2026-09-07T20:50:00.000Z' });
});

// ---------------------------------------------------------------- AT-04
test('AT-04 · kaçırılan antrenman sırayı SESSİZCE atlatmaz', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    assert.equal(plan.planned_date_key, '2026-09-07');

    h.clock.set('2026-09-09T05:00:00.000Z');                    // iki gün sonra açıldı
    const missed = await h.db.withTransaction((tx) => h.scheduler.detectMissed(tx, 'prog'));
    assert.ok(missed, 'kaçırılan antrenman kartı verisi üretilmeli');
    assert.equal(missed!.scheduledWorkoutId, plan.id);
    assert.equal(missed!.daysLate, 2);
    assert.equal((await programRow(h))!.training_sequence_index, 0, 'sıra İLERLEMEDİ');

    // ensurePlanned de yeni plan üretmez: açık plan duruyor
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    assert.equal((await allScheduled(h)).length, 1);
  });
});

test('T8 · yalnızca açık "Gerçekten atla" sırayı ilerletir', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    h.clock.set('2026-09-09T05:00:00.000Z');
    await h.db.withTransaction((tx) => h.scheduler.skip(tx, plan.id));

    assert.equal((await programRow(h))!.training_sequence_index, 1);
    assert.deepEqual(await sequenceEventRows(h), [{ from_index: 0, to_index: 1, cause: 'skipped' }]);
    const next = (await openPlan(h))!;
    assert.equal(next.sequence_index, 1);
    assert.equal(next.workout_template_id, 'v90-d2-pull');
    assert.equal(next.planned_date_key, '2026-09-09');
  });
});

// ---------------------------------------------------------------- AT-05
test('AT-05 · "Bugüne taşı" sırayı değiştirmez, takvim doğru', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    h.clock.set('2026-09-09T05:00:00.000Z');
    const newId = await h.db.withTransaction((tx) => h.scheduler.reschedule(tx, plan.id, '2026-09-09', 'moveToToday'));

    const rows = await allScheduled(h);
    assert.equal(rows.length, 2);
    const old = rows.find((r) => r.id === plan.id)!;
    const fresh = rows.find((r) => r.id === newId)!;
    assert.equal(old.status, 'rescheduled');
    assert.equal(old.rescheduled_to_id, newId);
    assert.equal(fresh.status, 'planned');
    assert.equal(fresh.planned_date_key, '2026-09-09');
    assert.equal(fresh.sequence_index, plan.sequence_index, 'aynı sıra indeksi (R88.7)');
    assert.equal(fresh.reschedule_reason, 'moveToToday');
    assert.equal((await programRow(h))!.training_sequence_index, 0);
    assert.deepEqual(await sequenceEventRows(h), [], 'taşıma sıra olayı üretmez');
  });
});

test('AT-05 · geçmiş bir güne taşıma reddedilir', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    h.clock.set('2026-09-09T05:00:00.000Z');
    await assert.rejects(
      () => h.db.withTransaction((tx) => h.scheduler.reschedule(tx, plan.id, '2026-09-08', 'moveToDate')),
      (e: unknown) => e instanceof InvalidRescheduleDateError);
  });
});

test('T3 · gününde olmayan plan başlatılırken önce bugüne taşınır', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    h.clock.set('2026-09-09T05:00:00.000Z');
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const active = (await openPlan(h))!;
    assert.equal(active.status, 'inProgress');
    assert.equal(active.planned_date_key, '2026-09-09');
    assert.notEqual(active.id, plan.id, 'yeni satır; eski rescheduled');
  });
});

// ---------------------------------------------------------------- AT-06
test('AT-06 · kısmi antrenman otomatik "completed" olmaz; karar bekler', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const snap = (await h.session.hydrate())!;

    // İlk iki hareketi tamamla, üçüncüde tek set
    for (const e of snap.exercises.slice(0, 2)) {
      for (let i = 1; i <= e.planned_working_sets; i++) {
        await h.session.completeSet({ commandId: c(), sessionExerciseId: e.id, setIndex: i, raw: { loadKg: 60 }, reps: 10, rir: 2 });
      }
    }
    await h.session.completeSet({ commandId: c(), sessionExerciseId: snap.exercises[2]!.id, setIndex: 1, raw: { loadKg: 30 }, reps: 12, rir: 1 });

    const fin = await h.session.finish({ commandId: c() });
    assert.equal(fin.value!.status, 'partial');
    assert.equal(fin.value!.decisionRequired, true);
    assert.equal(fin.value!.remainingExerciseIds.length, 4);

    const sw = (await allScheduled(h)).find((r) => r.id === plan.id)!;
    assert.equal(sw.status, 'partiallyCompleted');
    assert.equal(sw.partial_decision, null);
    assert.deepEqual(JSON.parse(sw.remaining_exercise_ids_json!).length, 4, 'kalanlar bitirme tx\'inde yazıldı');
    assert.equal((await programRow(h))!.training_sequence_index, 0, 'karar verilmeden sıra ilerlemez');

    // Karar beklerken yeni plan oluşturulmaz (I4)
    const ensure = await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    assert.equal(ensure.outcome, 'pendingPartialDecision');
  });
});

test('T6 / T7 · kısmi karar: bitmiş say sırayı ilerletir, devam ettir ilerletmez', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 60 }, reps: 10, rir: 2 });
    await h.session.finish({ commandId: c() });

    await h.session.decidePartial({ commandId: c(), scheduledWorkoutId: plan.id, decision: 'countAsDone' });
    assert.equal((await programRow(h))!.training_sequence_index, 1);
    assert.deepEqual((await sequenceEventRows(h)).map((e) => e.cause), ['partialCountedDone']);
    const next = (await openPlan(h))!;
    assert.equal(next.planned_date_key, '2026-09-08', 'antrenman gününe ikinci plan konmaz');
  });

  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 60 }, reps: 10, rir: 2 });
    await h.session.finish({ commandId: c() });

    const r = await h.session.decidePartial({ commandId: c(), scheduledWorkoutId: plan.id, decision: 'continueLater' });
    assert.equal((await programRow(h))!.training_sequence_index, 0, 'sıra DEĞİŞMEZ');
    const cont = (await allScheduled(h)).find((x) => x.id === r.value!.continuationId)!;
    assert.equal(cont.sequence_index, 0);
    assert.equal(cont.reschedule_reason, 'partialContinuation');
    assert.equal(cont.planned_date_key, '2026-09-08');
    assert.equal(JSON.parse(cont.remaining_exercise_ids_json!).length, 6);
  });
});

test('kısmi devam planı yalnızca kalan hareketleri açar', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const snap = (await h.session.hydrate())!;
    for (let i = 1; i <= snap.exercises[0]!.planned_working_sets; i++) {
      await h.session.completeSet({ commandId: c(), sessionExerciseId: snap.exercises[0]!.id, setIndex: i, raw: { loadKg: 60 }, reps: 10, rir: 2 });
    }
    await h.session.finish({ commandId: c() });
    const r = await h.session.decidePartial({ commandId: c(), scheduledWorkoutId: plan.id, decision: 'continueLater' });

    h.clock.set('2026-09-08T05:00:00.000Z');
    await h.session.start({ commandId: c(), scheduledWorkoutId: r.value!.continuationId! });
    const cont = (await h.session.hydrate())!;
    assert.equal(cont.exercises.length, 5, 'tamamlanan hareket devam planında yok');
  });
});

// ---------------------------------------------------------------- T4 / T9
test('T4 · tam antrenman sırayı ilerletir ve sonraki planı kurar', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await doFullWorkout(h, plan.id);
    const fin = await h.session.finish({ commandId: c() });
    assert.equal(fin.value!.status, 'completed');

    assert.equal((await programRow(h))!.training_sequence_index, 1);
    assert.deepEqual((await sequenceEventRows(h)).map((e) => e.cause), ['completed']);
    const next = (await openPlan(h))!;
    assert.equal(next.workout_template_id, 'v90-d2-pull');
    assert.equal(next.planned_date_key, '2026-09-08');
  });
});

test('T9 · iptal: sıra ilerlemez, setler silinmez, plan yerinde geri açılır', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 80 }, reps: 10, rir: 2 });

    await h.session.cancel({ commandId: c(), origin: 'resumeCard' });

    const rows = await allScheduled(h);
    assert.equal(rows.length, 1, 'yeni satır oluşmaz');
    assert.equal(rows[0]!.status, 'planned');
    assert.equal(rows[0]!.planned_date_key, '2026-09-07', 'tarih korunur');
    assert.equal((await programRow(h))!.training_sequence_index, 0);
    assert.equal(await h.session.findActive(), null);

    const logs = await h.db.withTransaction((tx) => tx.all<{ discarded: number }>('SELECT discarded FROM set_logs'));
    assert.equal(logs.length, 1, 'set kaydı SİLİNMEZ');
    assert.equal(logs[0]!.discarded, 1);
    const prs = await h.db.withTransaction((tx) => tx.all<{ voided: number }>('SELECT voided FROM personal_records'));
    assert.ok(prs.every((p) => p.voided === 1), 'iptal edilen oturumun PR\'ları geçersiz');
  });
});

// ---------------------------------------------------------------- dondurma
test('R89 · dondurma: kaçırılan uyarısı susar, resume planı bugüne taşır', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    await h.db.withTransaction((tx) => h.pauseService.pause(tx, 'prog', 'illness'));
    assert.equal((await programRow(h))!.status, 'paused');

    h.clock.set('2026-09-14T05:00:00.000Z');
    assert.equal(await h.db.withTransaction((tx) => h.scheduler.detectMissed(tx, 'prog')), null,
      'dondurmada kaçırılan uyarısı üretilmez (R89.3)');

    await h.db.withTransaction((tx) => h.pauseService.resume(tx, 'prog'));
    const plan = (await openPlan(h))!;
    assert.equal(plan.planned_date_key, '2026-09-14');
    assert.equal(plan.sequence_index, 0, 'sıra kaldığı yerden (R89.4)');
    const pause = await h.db.withTransaction((tx) => tx.get<{ end_date_key: string }>('SELECT end_date_key FROM program_pauses'));
    assert.equal(pause!.end_date_key, '2026-09-14');
  });
});

test('dondurma guard\'ları: aktif oturum ve karar bekleyen kısmi', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    await assert.rejects(() => h.db.withTransaction((tx) => h.pauseService.pause(tx, 'prog')),
      (e: unknown) => e instanceof ActiveSessionExistsError);

    const se = (await h.session.hydrate())!.exercises[0]!;
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 60 }, reps: 10, rir: 2 });
    await h.session.finish({ commandId: c() });
    await assert.rejects(() => h.db.withTransaction((tx) => h.pauseService.pause(tx, 'prog')),
      (e: unknown) => e instanceof PendingPartialDecisionError);
  });
});

// ---------------------------------------------------------------- diğer komutlar
test('aktif oturum varken ikinci oturum açılamaz', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    await assert.rejects(() => h.session.start({ commandId: c(), scheduledWorkoutId: plan.id }),
      (e: unknown) => e instanceof ActiveSessionExistsError);
  });
});

test('set loglanmış harekette değiştirme reddedilir, öncesinde kabul edilir', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const snap = (await h.session.hydrate())!;
    const target = snap.exercises.find((e) => e.exercise_id === 'cable-lateral-raise')!;

    await h.session.substituteExercise({ commandId: c(), sessionExerciseId: target.id, newExerciseId: 'machine-lateral-raise', reason: 'kablo dolu' });
    const after = (await h.session.hydrate())!.exercises.find((e) => e.id === target.id)!;
    assert.equal(after.exercise_id, 'machine-lateral-raise');
    assert.equal(after.original_exercise_id, 'cable-lateral-raise', 'geçmiş için orijinal korunur');

    await h.session.completeSet({ commandId: c(), sessionExerciseId: target.id, setIndex: 1, raw: { loadKg: 20 }, reps: 12, rir: 1 });
    await assert.rejects(
      () => h.session.substituteExercise({ commandId: c(), sessionExerciseId: target.id, newExerciseId: 'dumbbell-lateral-raise' }),
      (e: unknown) => e instanceof SetAlreadyLoggedError);
  });
});

test('atlanan hareket kısmi sayımına girmez', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const snap = (await h.session.hydrate())!;
    for (const e of snap.exercises.slice(0, 5)) {
      for (let i = 1; i <= e.planned_working_sets; i++) {
        await h.session.completeSet({ commandId: c(), sessionExerciseId: e.id, setIndex: i, raw: { loadKg: 60 }, reps: 10, rir: 2 });
      }
    }
    await h.session.skipExercise({ commandId: c(), sessionExerciseId: snap.exercises[5]!.id });
    const fin = await h.session.finish({ commandId: c() });
    assert.equal(fin.value!.status, 'completed', 'açıkça atlanan hareket antrenmanı kısmi yapmaz');
  });
});

test('R113.4 · oturum günü düzenlenince bağlı kayıtlar da taşınır', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    const sessionId = await doFullWorkout(h, plan.id);
    await h.session.finish({ commandId: c() });

    h.clock.set('2026-09-08T05:00:00.000Z');
    await h.session.overrideCalendarDate({ commandId: c(), sessionId, dateKey: '2026-09-08' });
    const s = await h.db.withTransaction((tx) => tx.get<{ calendar_date_key: string; calendar_date_overridden: number }>(
      'SELECT calendar_date_key, calendar_date_overridden FROM workout_sessions WHERE id = ?', [sessionId]));
    assert.equal(s!.calendar_date_key, '2026-09-08');
    assert.equal(s!.calendar_date_overridden, 1);
    const keys = await h.db.withTransaction((tx) => tx.all<{ local_date_key: string }>(
      'SELECT DISTINCT local_date_key FROM set_logs WHERE session_id = ?', [sessionId]));
    assert.deepEqual(keys.map((k) => k.local_date_key), ['2026-09-08']);
    const prKeys = await h.db.withTransaction((tx) => tx.all<{ local_date_key: string }>(
      'SELECT DISTINCT local_date_key FROM personal_records WHERE session_id = ?', [sessionId]));
    assert.ok(prKeys.every((k) => k.local_date_key === '2026-09-08'));
  });
});

test('yasak geçişler InvalidTransitionError verir', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await assert.rejects(() => h.db.withTransaction((tx) => h.scheduler.reopenAfterCancel(tx, plan.id)),
      (e: unknown) => e instanceof InvalidTransitionError);
    await h.db.withTransaction((tx) => h.scheduler.skip(tx, plan.id));
    await assert.rejects(() => h.db.withTransaction((tx) => h.scheduler.skip(tx, plan.id)),
      (e: unknown) => e instanceof InvalidTransitionError);
  });
});

// ---------------------------------------------------------------- AT-03
test('AT-03 · dinlenme sayacı ekran kilidi ve yeniden başlatmadan etkilenmez', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;

    // Incline Smith Press: şablon dinlenmesi 150 sn
    assert.equal(se.rest_seconds, 150);
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 60 }, reps: 10, rir: 2 });

    const t0 = (await h.session.hydrate())!.restTimer!;
    assert.equal(t0.remainingSeconds, 150);
    assert.equal(t0.state, 'running');
    assert.equal(h.notifications.scheduled.length, 1, 'bildirim planlandı (R91.5)');

    // 40 sn sonra ekran kilitlendi, 70 sn sonra açıldı → toplam 110 sn
    h.clock.advanceSeconds(110);
    const t1 = (await h.session.hydrate())!.restTimer!;
    assert.equal(t1.remainingSeconds, 40, 'kalan süre zaman damgasından türetilir');
    assert.equal(t1.state, 'running');

    // Süre dolunca okuma anında tembel tamamlama: UI "dinlenme bitti" gösterebilsin
    // diye bir kez completed görünümü döner, sonraki okumada sayaç yoktur.
    h.clock.advanceSeconds(60);
    const t2 = (await h.session.hydrate())!.restTimer!;
    assert.equal(t2.remainingSeconds, 0);
    assert.equal(t2.state, 'completed');
    assert.equal(t2.expired, true);
    const row = await h.db.withTransaction((tx) => tx.get<{ state: string }>('SELECT state FROM rest_timers'));
    assert.equal(row!.state, 'completed');
    assert.equal((await h.session.hydrate())!.restTimer, null, 'ikinci okumada çalışan sayaç yok');
  });
});

test('AT-03 · cihaz saati geri alınsa da kalan süre süreyi aşmaz', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 60 }, reps: 10, rir: 2 });
    h.clock.advanceSeconds(-3600);                       // saat geri alındı
    assert.equal((await h.session.hydrate())!.restTimer!.remainingSeconds, 150);
  });
});

test('R91.6 · yeni set eski sayacı kapatır ve bildirimini iptal eder', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;

    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 60 }, reps: 10, rir: 2 });
    h.clock.advanceSeconds(60);                          // sayaç bitmeden ikinci set
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 2, raw: { loadKg: 60 }, reps: 10, rir: 2 });

    assert.deepEqual(h.notifications.cancelled, ['notif-1'], 'eski bildirim iptal edildi');
    const rows = await h.db.withTransaction((tx) => tx.all<{ state: string }>('SELECT state FROM rest_timers ORDER BY rowid'));
    assert.deepEqual(rows.map((r) => r.state), ['skipped', 'running'], 'süresi dolmamış sayaç atlandı sayılır');
    const running = await h.db.withTransaction((tx) => tx.all('SELECT * FROM rest_timers WHERE state = \'running\''));
    assert.equal(running.length, 1, 'tek çalışan sayaç kısıtı (ux_rest_single_running)');
  });
});

test('antrenman bitince çalışan sayaç kapanır ve bildirim iptal edilir', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await doFullWorkout(h, plan.id);
    await h.session.finish({ commandId: c() });
    const rows = await h.db.withTransaction((tx) => tx.all<{ state: string }>(
      'SELECT state FROM rest_timers WHERE state = \'running\''));
    assert.equal(rows.length, 0);
    assert.ok(h.notifications.cancelled.length > 0);
  });
});

test('ısınma seti sayaç başlatmaz', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, setType: 'warmup', raw: { loadKg: 30 }, reps: 10, rir: 4 });
    assert.equal((await h.session.hydrate())!.restTimer, null);
    assert.equal(h.notifications.scheduled.length, 0);
  });
});

test('PR tespiti set commit ile aynı transaction\'da yazılır', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;

    const first = await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, raw: { loadKg: 80 }, reps: 10, rir: 2 });
    assert.deepEqual(first.value!.prs.map((p) => p.prType).sort(), ['estimatedPerformancePr', 'loadPr'],
      'ilk kayıt hem yük hem e1RM baseline\'ı kurar');
    assert.equal(first.value!.prs.find((p) => p.prType === 'estimatedPerformancePr')!.isEstimate, true);

    const better = await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 2, raw: { loadKg: 82.5 }, reps: 8, rir: 1 });
    assert.ok(better.value!.prs.some((p) => p.prType === 'loadPr'));

    const chain = await h.db.withTransaction((tx) => tx.all<{ effective_load: number; superseded_by_id: string | null }>(
      `SELECT effective_load, superseded_by_id FROM personal_records WHERE pr_type = 'loadPr' ORDER BY achieved_at_utc, rowid`));
    assert.equal(chain.length, 2);
    assert.ok(chain[0]!.superseded_by_id, 'eski PR zincire bağlandı');
    assert.equal(chain[1]!.superseded_by_id, null, 'güncel PR');
  });
});

test('ısınma ve "PR\'a sayma" setleri PR üretmez', async () => {
  await withH(async (h) => {
    await h.db.withTransaction((tx) => h.scheduler.ensurePlanned(tx, 'prog'));
    const plan = (await openPlan(h))!;
    await h.session.start({ commandId: c(), scheduledWorkoutId: plan.id });
    const se = (await h.session.hydrate())!.exercises[0]!;
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 1, setType: 'warmup', raw: { loadKg: 100 }, reps: 3 });
    await h.session.completeSet({ commandId: c(), sessionExerciseId: se.id, setIndex: 2, raw: { loadKg: 100 }, reps: 3, excludeFromPr: true });
    const prs = await h.db.withTransaction((tx) => tx.all('SELECT * FROM personal_records'));
    assert.equal(prs.length, 0);
  });
});
