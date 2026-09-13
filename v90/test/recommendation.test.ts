// Öneri kartı — docs/v90/06-ux-flows.md A.7 (R121, R122, R123.4).
//
// En kritik garanti: hiçbir öneri otomatik uygulanmaz ve HİÇBİR KARAR
// KAYBOLMAZ — "Yok say" bile yazılır, çünkü sonraki öneriler geçmiş kararları
// girdi alır (02 §9.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FakeClock } from '../src/core/clock/dateKey.ts';
import { MigrationRunner } from '../src/core/db/MigrationRunner.ts';
import { NodeSqliteProvider } from '../src/core/db/NodeSqliteProvider.ts';
import { NodeFileStore } from '../src/core/db/NodeFileStore.ts';
import { nodeSha256 } from '../src/core/db/hash.node.ts';
import type { Db } from '../src/core/db/types.ts';
import {
  isVisible, prefillValue, primaryValue, toCard, unitOf,
} from '../src/features/active-workout/recommendation.ts';
import type { RecommendationRow } from '../src/features/active-workout/recommendation.ts';
import {
  closeOpenOnSetLogged, decide, openForExercise,
} from '../src/features/active-workout/recommendationService.ts';

const NOW = '2026-09-14T09:00:00.000Z';

const row = (over: Partial<RecommendationRow> = {}): RecommendationRow => ({
  id: 'r1', kind: 'loadIncrease', exercise_id: 'x1', muscle: null, session_exercise_id: null,
  proposed_json: JSON.stringify({ effectiveLoad: 82.5 }),
  rationale_tr: 'Son antrenmanda 3/3 sette 12 tekrar yaptın.',
  evidence_json: JSON.stringify({ setLogIds: ['s1', 's2', 's3'], metrics: { lastReps: 12, incrementKg: 2.5 } }),
  is_estimate: 0, created_at_utc: NOW, local_date_key: '2026-09-14', expires_at_utc: null,
  decision_action: null, decision_value_json: null, decided_at_utc: null, ...over,
});

// ─────────────────────────────────────────────────────── saf model

test('kart, satırın doğrudan görünümüdür', () => {
  const card = toCard(row());
  assert.equal(card.kind, 'loadIncrease');
  assert.equal(card.proposed.effectiveLoad, 82.5);
  assert.equal(card.rationaleTr, 'Son antrenmanda 3/3 sette 12 tekrar yaptın.');
  assert.deepEqual(card.setLogIds, ['s1', 's2', 's3']);
  assert.equal(card.collapsed, false);
  // R122.3: kanıt çipleri okunur etiketlerle gelir.
  assert.deepEqual(card.evidenceChips, ['Son set tekrarları: 12', 'Artış adımı (kg): 2.5']);
});

test('R123.4 · tahmin olan öneri rozetle işaretlenir', () => {
  assert.equal(toCard(row({ is_estimate: 1 })).isEstimate, true);
  assert.equal(toCard(row()).isEstimate, false);
});

test('süresi dolmuş öneri GÖSTERİLMEZ, kararı NULL kalır', () => {
  const now = new Date(NOW);
  assert.equal(isVisible(row({ expires_at_utc: '2026-09-20T00:00:00.000Z' }), now), true);
  assert.equal(isVisible(row({ expires_at_utc: '2026-09-13T00:00:00.000Z' }), now), false);
  assert.equal(isVisible(row({ expires_at_utc: null }), now), true);
  // Karar verilmiş kart süresi dolsa da daraltılmış olarak gösterilir.
  assert.equal(
    isVisible(row({ expires_at_utc: '2026-09-13T00:00:00.000Z', decision_action: 'accepted' }), now),
    true);
});

test('AT-09 · yardımlı harekette değer yardım kg\'ıdır', () => {
  const assisted = row({ proposed_json: JSON.stringify({ raw: { assistanceKg: 22.5 } }) });
  assert.equal(primaryValue(toCard(assisted).proposed), 22.5);
  assert.equal(unitOf('loadDecrease', toCard(assisted).proposed), 'kg');
});

test('birim öneriye göre değişir; tekrar önerisine "kg" yazılmaz', () => {
  assert.equal(unitOf('repIncrease', { reps: 12 }), 'tekrar');
  assert.equal(unitOf('volumeIncrease', { sets: 1 }), 'set');
  assert.equal(unitOf('loadIncrease', { effectiveLoad: 80 }), 'kg');
  assert.equal(unitOf('holdLoad', {}), null, 'değer yoksa birim de yok');
});

test('prefill · yalnızca kabul/değiştir yansır, yok say yansımaz', () => {
  const accepted = toCard(row({
    decision_action: 'accepted', decision_value_json: JSON.stringify({ effectiveLoad: 82.5 }),
  }));
  assert.deepEqual(prefillValue(accepted), { value: 82.5, source: 'recommended' });

  const modified = toCard(row({
    decision_action: 'modified', decision_value_json: JSON.stringify({ effectiveLoad: 80 }),
  }));
  assert.deepEqual(prefillValue(modified), { value: 80, source: 'userValue' });

  // Yok sayılmış öneri prefill'i kaynak 2'ye (son antrenman) bırakır.
  const ignored = toCard(row({ decision_action: 'ignored', decision_value_json: '{}' }));
  assert.equal(prefillValue(ignored), null);
  assert.equal(prefillValue(toCard(row())), null, 'karar verilmemiş öneri prefill\'i değiştirmez');
});

// ─────────────────────────────────────────────────────── DB üzerinde

async function seeded(): Promise<Db> {
  const { db } = await new MigrationRunner({
    provider: new NodeSqliteProvider(':memory:'), files: new NodeFileStore(),
    clock: new FakeClock(NOW), hash: nodeSha256,
  }).run();
  await db.exec(
    `INSERT INTO exercises
       (id, name, name_tr, primary_muscle, secondary_muscles_json, movement_pattern, equipment_json,
        lengthened_bias, skill_level, joint_stress_json, load_progression_type, is_unilateral,
        volume_multiplier, default_increment_kg, cues_json, is_custom, is_deleted, created_at_utc, updated_at_utc)
     VALUES ('x1','X','X','chest','[]','horizontalPush','[]',1,'intermediate','{}',
             'externalLoadHigherIsHarder',0,1,2.5,'["a","b","c"]',0,0,?,?)`, [NOW, NOW]);

  // `applied_session_id` gerçek bir oturuma referans verir (FK); test de
  // gerçek satırla koşsun ki kısıt atlanmasın.
  await db.exec(
    `INSERT INTO workout_sessions
       (id, status, started_at_utc, calendar_date_key, calendar_date_overridden,
        time_zone, utc_offset_minutes, created_at_utc, updated_at_utc)
     VALUES ('sess-1','active',?, '2026-09-14',0,'Europe/Istanbul',180,?,?)`, [NOW, NOW, NOW]);
  return db;
}

async function insertReco(db: Db, over: Partial<RecommendationRow> = {}): Promise<string> {
  const r = row(over);
  await db.exec(
    `INSERT INTO recommendations
       (id, kind, exercise_id, proposed_json, rationale_tr, evidence_json, is_estimate,
        created_at_utc, local_date_key, time_zone, expires_at_utc)
     VALUES (?,?,?,?,?,?,?,?,?,'Europe/Istanbul',?)`,
    [r.id, r.kind, r.exercise_id, r.proposed_json, r.rationale_tr, r.evidence_json,
      r.is_estimate, r.created_at_utc, r.local_date_key, r.expires_at_utc]);
  return r.id;
}

test('Kabul · karar ve değer yazılır, prefill önerilene geçer', async () => {
  const db = await seeded();
  const clock = new FakeClock(NOW);
  try {
    const id = await insertReco(db);
    const ok = await db.withTransaction((tx) => decide(tx, clock, {
      commandId: 'cmd-1', recommendationId: id, decision: 'accepted', appliedSessionId: 'sess-1',
    }));
    assert.equal(ok, true);

    const cards = await db.withTransaction((tx) => openForExercise(tx, 'x1', new Date(NOW)));
    assert.equal(cards[0]?.decision, 'accepted');
    assert.deepEqual(prefillValue(cards[0]!), { value: 82.5, source: 'recommended' });

    const stored = await db.get<{ applied_session_id: string | null; decided_at_utc: string | null }>(
      'SELECT applied_session_id, decided_at_utc FROM recommendations WHERE id = ?', [id]);
    assert.equal(stored?.applied_session_id, 'sess-1');
    assert.ok(stored?.decided_at_utc);
  } finally { await db.close(); }
});

test('Değiştir · kullanıcı değeri önerilenin YERİNE yazılır', async () => {
  const db = await seeded();
  const clock = new FakeClock(NOW);
  try {
    const id = await insertReco(db);
    await db.withTransaction((tx) => decide(tx, clock, {
      commandId: 'cmd-2', recommendationId: id, decision: 'modified', userValue: 80,
    }));
    const cards = await db.withTransaction((tx) => openForExercise(tx, 'x1', new Date(NOW)));
    assert.equal(cards[0]?.decision, 'modified');
    assert.deepEqual(prefillValue(cards[0]!), { value: 80, source: 'userValue' });
  } finally { await db.close(); }
});

test('Değiştir · tekrar önerisinde reps alanı güncellenir, yük değil', async () => {
  const db = await seeded();
  const clock = new FakeClock(NOW);
  try {
    const id = await insertReco(db, { kind: 'repIncrease', proposed_json: JSON.stringify({ reps: 12 }) });
    await db.withTransaction((tx) => decide(tx, clock, {
      commandId: 'cmd-3', recommendationId: id, decision: 'modified', userValue: 10,
    }));
    const stored = await db.get<{ decision_value_json: string }>(
      'SELECT decision_value_json FROM recommendations WHERE id = ?', [id]);
    assert.deepEqual(JSON.parse(stored!.decision_value_json), { reps: 10 });
  } finally { await db.close(); }
});

test('AT-09 · yardımlı öneride değiştirme assistanceKg\'yi günceller', async () => {
  const db = await seeded();
  const clock = new FakeClock(NOW);
  try {
    const id = await insertReco(db, {
      kind: 'loadDecrease', proposed_json: JSON.stringify({ raw: { assistanceKg: 22.5 } }),
    });
    await db.withTransaction((tx) => decide(tx, clock, {
      commandId: 'cmd-4', recommendationId: id, decision: 'modified', userValue: 25,
    }));
    const stored = await db.get<{ decision_value_json: string }>(
      'SELECT decision_value_json FROM recommendations WHERE id = ?', [id]);
    assert.deepEqual(JSON.parse(stored!.decision_value_json), { raw: { assistanceKg: 25 } });
  } finally { await db.close(); }
});

test('R121.3 · karar verilmeden set loglanırsa öneri LOGLANAN değerle kapanır', async () => {
  const db = await seeded();
  const clock = new FakeClock(NOW);
  try {
    const id = await insertReco(db);
    const closed = await db.withTransaction((tx) => closeOpenOnSetLogged(tx, clock, {
      exerciseId: 'x1', loggedValue: 77.5, sessionId: 'sess-1',
    }));
    assert.equal(closed, 1);

    const stored = await db.get<{ decision_action: string; decision_value_json: string; applied_session_id: string }>(
      'SELECT decision_action, decision_value_json, applied_session_id FROM recommendations WHERE id = ?', [id]);
    assert.equal(stored?.decision_action, 'ignored');
    // Kullanıcının FİİLİ tercihi kaydedilir; öneri sessizce silinmez.
    assert.deepEqual(JSON.parse(stored!.decision_value_json), { effectiveLoad: 77.5 });
    assert.equal(stored?.applied_session_id, 'sess-1');
  } finally { await db.close(); }
});

test('aynı commandId ile tekrar karar no-op (command_log)', async () => {
  const db = await seeded();
  const clock = new FakeClock(NOW);
  try {
    const id = await insertReco(db);
    const first = await db.withTransaction((tx) => decide(tx, clock, {
      commandId: 'cmd-same', recommendationId: id, decision: 'accepted',
    }));
    const second = await db.withTransaction((tx) => decide(tx, clock, {
      commandId: 'cmd-same', recommendationId: id, decision: 'ignored',
    }));
    assert.equal(first, true);
    assert.equal(second, false, 'ikinci çağrı yazmamalı');

    const stored = await db.get<{ decision_action: string }>(
      'SELECT decision_action FROM recommendations WHERE id = ?', [id]);
    assert.equal(stored?.decision_action, 'accepted', 'ilk karar korunmalı');
  } finally { await db.close(); }
});

test('süresi dolmuş öneri açık liste olarak DÖNMEZ', async () => {
  const db = await seeded();
  try {
    await insertReco(db, { expires_at_utc: '2026-09-13T00:00:00.000Z' });
    const cards = await db.withTransaction((tx) => openForExercise(tx, 'x1', new Date(NOW)));
    assert.deepEqual(cards, []);
  } finally { await db.close(); }
});
