#!/usr/bin/env node
// V90 seed doğrulayıcı — sıfır bağımlılık.
//
// Seed JSON dosyalarının (a) Bölüm II enum'larına uyduğunu, (b) Bölüm I §27
// haftalık hacim tablosunu birebir ürettiğini, (c) referans bütünlüğünü
// koruduğunu ve (d) gerçek SQLite şemasının kısıtlarını geçtiğini doğrular.
//
//   npm run verify:seed      (hata varsa çıkış kodu 1)

import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

const failures = [];
const checks = [];
function check(name, fn) {
  try {
    const detail = fn();
    checks.push({ name, ok: true, detail });
  } catch (e) {
    checks.push({ name, ok: false, detail: e.message });
    failures.push(`${name}: ${e.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

// ---------------------------------------------------------------- kaynaklar
const partI = read('../docs/v90/00-specification-part1.md');
const dataModel = read('../docs/v90/03-data-model.md');
const { exercises, relations } = json('data/exercises.json');
const program = json('data/programs/v90.json');
const { targets } = json('data/muscle-volume-targets.json');
const profile = json('data/initial-profile.json');
const foodSeed = json('data/food-items.json');
const foods = foodSeed.foods;

const enumOf = (name) => {
  const m = dataModel.match(new RegExp(`export type ${name}\\s*=\\s*([\\s\\S]*?);`));
  assert(m, `03-data-model.md içinde ${name} tipi bulunamadı`);
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
};
const MUSCLES = enumOf('MuscleGroup');
const PATTERNS = enumOf('MovementPattern');
const EQUIPMENT = enumOf('EquipmentTag');
const LPTS = enumOf('LoadProgressionType');
const JOINTS = enumOf('Joint');
const SKILLS = new Set(['beginner', 'intermediate', 'advanced']);

const byId = new Map(exercises.map((e) => [e.id, e]));

// ---------------------------------------------------------------- A. enum uyumu
check('A1 · hareket alanları Bölüm II enum\'larına uyuyor', () => {
  for (const e of exercises) {
    assert(MUSCLES.has(e.primaryMuscle), `${e.id}: primaryMuscle "${e.primaryMuscle}"`);
    for (const m of e.secondaryMuscles) assert(MUSCLES.has(m), `${e.id}: secondaryMuscle "${m}"`);
    assert(PATTERNS.has(e.movementPattern), `${e.id}: movementPattern "${e.movementPattern}"`);
    assert(e.equipment.length > 0, `${e.id}: ekipman listesi boş`);
    for (const t of e.equipment) assert(EQUIPMENT.has(t), `${e.id}: equipment "${t}"`);
    assert(LPTS.has(e.loadProgressionType), `${e.id}: loadProgressionType "${e.loadProgressionType}"`);
    assert(SKILLS.has(e.skillLevel), `${e.id}: skillLevel "${e.skillLevel}"`);
    for (const j of Object.keys(e.jointStressProfile)) assert(JOINTS.has(j), `${e.id}: joint "${j}"`);
    for (const v of Object.values(e.jointStressProfile)) assert(v >= 0 && v <= 3, `${e.id}: eklem stresi 0–3 dışında`);
    assert(!e.secondaryMuscles.includes(e.primaryMuscle), `${e.id}: primary kas secondary listesinde de var`);
  }
  return `${exercises.length} hareket`;
});

check('A2 · alan sınırları geçerli', () => {
  for (const e of exercises) {
    assert(e.lengthenedBias >= 0 && e.lengthenedBias <= 3, `${e.id}: lengthenedBias`);
    assert(e.defaultIncrementKg > 0, `${e.id}: defaultIncrementKg > 0 olmalı (R100)`);
    assert(e.volumeMultiplier === 1, `${e.id}: volumeMultiplier 1 olmalı (R102.4 çift sayım koruması)`);
    assert(e.cues.length >= 3, `${e.id}: en az 3 teknik ipucu gerekir (R32.2, video fallback'i)`);
    assert(/^[a-z0-9-]+$/.test(e.id), `${e.id}: kimlik biçimi`);
  }
  return 'lengthenedBias, increment, volumeMultiplier, cues';
});

// ---------------------------------------------------------------- B. referans bütünlüğü
check('B1 · alternatif ilişkileri çözümleniyor', () => {
  const seen = new Set();
  for (const r of relations) {
    assert(byId.has(r.exerciseId), `bilinmeyen kaynak: ${r.exerciseId}`);
    assert(byId.has(r.relatedExerciseId), `bilinmeyen hedef: ${r.relatedExerciseId}`);
    assert(r.exerciseId !== r.relatedExerciseId, `kendine referans: ${r.exerciseId}`);
    const key = `${r.exerciseId}->${r.relatedExerciseId}`;
    assert(!seen.has(key), `tekrarlanan ilişki: ${key}`);
    seen.add(key);
  }
  return `${relations.length} ilişki`;
});

check('B2 · Bölüm II §99.4 alternatif örnekleri karşılanıyor', () => {
  const expected = {
    'cable-lateral-raise': ['machine-lateral-raise', 'dumbbell-lateral-raise'],
    'lat-pulldown': ['assisted-pullup', 'plate-loaded-pulldown'],
    'hack-squat': ['leg-press', 'smith-squat'],
  };
  for (const [src, want] of Object.entries(expected)) {
    const got = relations.filter((r) => r.exerciseId === src)
      .sort((a, b) => a.priority - b.priority).map((r) => r.relatedExerciseId);
    assert(JSON.stringify(got) === JSON.stringify(want),
      `${src} → beklenen [${want}], bulunan [${got}]`);
  }
  return 'cable lateral raise · lat pulldown · hack squat';
});

// ---------------------------------------------------------------- C. program
check('C1 · program yapısı (R20, R21)', () => {
  const t = program.workoutTemplates;
  assert(program.isCyclic === true, 'V90 döngüsel olmalı (R20.1)');
  assert(t.length === 5, `5 şablon bekleniyor, ${t.length} var (R20.1)`);
  const orders = t.map((x) => x.sequenceOrder).sort((a, b) => a - b);
  assert(JSON.stringify(orders) === '[0,1,2,3,4]', `sequenceOrder 0–4 olmalı, ${orders} bulundu`);
  const day5 = t.find((x) => x.sequenceOrder === 4);
  assert(day5.id === 'v90-d5-vtaper-upper',
    `templates[4] "v90-d5-vtaper-upper" olmalı (Bölüm II §88 çapası), "${day5.id}" bulundu`);
  assert(day5.name === 'Day 5 – V-Taper Upper', `templates[4].name yanlış: "${day5.name}"`);
  return `5 şablon · templates[4] = ${day5.name}`;
});

check('C2 · şablon set/tekrar/RIR alanları geçerli', () => {
  for (const t of program.workoutTemplates) {
    const sum = t.exercises.reduce((n, e) => n + e.workingSets, 0);
    assert(sum === t.declaredWorkingSets,
      `${t.id}: §21 tablosu ${t.declaredWorkingSets} set diyor, hareketler ${sum} veriyor`);
    const orders = t.exercises.map((e) => e.orderIndex);
    assert(new Set(orders).size === orders.length, `${t.id}: orderIndex tekrarı`);
    for (const e of t.exercises) {
      assert(byId.has(e.exerciseId), `${t.id}: bilinmeyen hareket ${e.exerciseId}`);
      assert(e.workingSets >= 1 && e.workingSets <= 10, `${t.id}/${e.exerciseId}: working_sets 1–10 (şema CHECK)`);
      assert(e.warmupSets >= 0, `${t.id}/${e.exerciseId}: warmupSets`);
      assert(e.repMin <= e.repMax, `${t.id}/${e.exerciseId}: rep_max >= rep_min (şema CHECK)`);
      assert(e.targetRir >= 0 && e.targetRir <= 5, `${t.id}/${e.exerciseId}: target_rir 0–5 (şema CHECK)`);
      assert(e.restSeconds > 0, `${t.id}/${e.exerciseId}: rest_seconds > 0`);
    }
  }
  return program.workoutTemplates.map((t) => `${t.declaredWorkingSets}`).join('+') + ' set';
});

// ---------------------------------------------------------------- D. hacim pariteleri
function computeWeekly() {
  const w = {};
  for (const t of program.workoutTemplates)
    for (const e of t.exercises) {
      const m = byId.get(e.exerciseId).primaryMuscle;
      w[m] = (w[m] ?? 0) + e.workingSets;     // unilateral çift sayılmaz (R27.4)
    }
  return w;
}

check('D1 · haftalık hacim = Bölüm I §27 tablosu', () => {
  // §27 tablosundaki "Haftalık" sütununu belgeden oku
  const sec = partI.match(/^## §27\.[\s\S]*?(?=^## §28)/m)[0];
  const TR = { 'Yan omuz (lateral delts)': 'lateralDelts', Biceps: 'biceps', Triceps: 'triceps',
    Lats: 'lats', 'Üst sırt': 'upperBack', 'Göğüs': 'chest', Hamstring: 'hamstrings',
    Quadriceps: 'quads', 'Arka omuz': 'rearDelts', 'Baldır': 'calves', 'Karın': 'abs' };
  const doc = {};
  for (const line of sec.split('\n')) {
    const c = line.split('|').map((x) => x.trim().replace(/\*\*/g, ''));
    if (c.length !== 10 || !TR[c[1]]) continue;   // '|' ile bölününce baş/son boş hücre
    doc[TR[c[1]]] = Number(c[7]);
  }
  assert(Object.keys(doc).length === 11, `§27'den 11 kas satırı okunmalı, ${Object.keys(doc).length} okundu`);
  const got = computeWeekly();
  for (const [m, want] of Object.entries(doc))
    assert(got[m] === want, `${m}: §27 ${want} diyor, şablonlar ${got[m] ?? 0} veriyor`);
  for (const m of Object.keys(got)) assert(m in doc, `${m} şablonlarda var ama §27 tablosunda yok`);
  const total = Object.values(got).reduce((a, b) => a + b, 0);
  assert(total === 87, `haftalık toplam 87 olmalı, ${total}`);
  return `11 kas · toplam ${total} set`;
});

check('D2 · Bölüm II §106.1 örneğiyle birebir', () => {
  const w = computeWeekly();
  const want = { lateralDelts: 12, biceps: 13, triceps: 13, chest: 10, quads: 7, hamstrings: 8 };
  for (const [m, v] of Object.entries(want)) assert(w[m] === v, `${m}: beklenen ${v}, bulunan ${w[m]}`);
  const back = w.lats + w.upperBack;
  assert(back === 15, `Lats/Back: beklenen 15, bulunan ${back}`);
  return 'yan omuz 12 · biceps 13 · triceps 13 · sırt 15 · göğüs 10 · quad 7 · hamstring 8';
});

check('D3 · hacim hedefleri programla tutarlı (R28)', () => {
  const w = computeWeekly();
  const seen = new Set();
  for (const t of targets) {
    assert(MUSCLES.has(t.muscle), `bilinmeyen kas: ${t.muscle}`);
    assert(!seen.has(t.muscle), `tekrarlanan kas: ${t.muscle}`);
    seen.add(t.muscle);
    assert(t.maxRecommendedWeeklySets >= t.baselineWeeklyDirectSets,
      `${t.muscle}: max (${t.maxRecommendedWeeklySets}) < baseline (${t.baselineWeeklyDirectSets}) — şema CHECK ihlali`);
    const actual = w[t.muscle] ?? 0;
    assert(t.baselineWeeklyDirectSets === actual,
      `${t.muscle}: baseline ${t.baselineWeeklyDirectSets}, program ${actual} veriyor`);
  }
  for (const m of Object.keys(w)) assert(seen.has(m), `${m} programda çalışılıyor ama hacim hedefi yok`);
  const prio = targets.filter((t) => t.isPriority).map((t) => t.muscle).sort();
  assert(JSON.stringify(prio) === JSON.stringify(['biceps', 'lateralDelts', 'lats', 'triceps']),
    `öncelikli kaslar R3.4 ile uyuşmuyor: ${prio}`);
  return `${targets.length} kas · öncelikli: ${prio.join(', ')}`;
});

// ---------------------------------------------------------------- E. başlangıç profili
check('E1 · başlangıç profili (R11, R119)', () => {
  const want = { waist: 95, abdomen: 114, shoulder: 137, hip: 119, chest: 110, forearm: 37 };
  assert(profile.profile.heightCm === 187, 'boy 187 olmalı');
  assert(profile.weightKg === 107, 'kilo 107 olmalı');
  for (const [k, v] of Object.entries(want))
    assert(profile.measurementsCm[k] === v, `${k}: beklenen ${v}, bulunan ${profile.measurementsCm[k]}`);
  for (const [k, v] of Object.entries(profile.measurementsCm))
    assert(v > 0, `${k}: sıfır/negatif değer yazılamaz (R119.3)`);
  assert(profile.unknown.includes('bicepsFlexed'),
    'bükülü üst kol BİLİNMİYOR olarak işaretlenmeli (R11.2, R96.1)');
  assert(!('bicepsFlexed' in profile.measurementsCm),
    'bükülü üst kol seed\'de değer taşımamalı (R119.2)');
  return '8 değer + biceps bilinmiyor';
});

// ---------------------------------------------------------------- F. gerçek şemaya yükleme
check('F1 · seed gerçek SQLite şemasına yükleniyor', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(read('src/core/db/migrations/001_initial.sql'));
  const NOW = '2026-09-07T05:00:00.000Z';

  const ex = db.prepare(`INSERT INTO exercises
    (id,name,name_tr,primary_muscle,secondary_muscles_json,movement_pattern,equipment_json,
     lengthened_bias,skill_level,joint_stress_json,load_progression_type,is_unilateral,
     volume_multiplier,default_increment_kg,cues_json,is_custom,seed_version,is_deleted,
     created_at_utc,updated_at_utc)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,1,0,?,?)`);
  for (const e of exercises)
    ex.run(e.id, e.name, e.nameTr, e.primaryMuscle, JSON.stringify(e.secondaryMuscles),
      e.movementPattern, JSON.stringify(e.equipment), e.lengthenedBias, e.skillLevel,
      JSON.stringify(e.jointStressProfile), e.loadProgressionType, e.isUnilateral ? 1 : 0,
      e.volumeMultiplier, e.defaultIncrementKg, JSON.stringify(e.cues), NOW, NOW);

  const rel = db.prepare(`INSERT INTO exercise_relations
    (id,exercise_id,related_exercise_id,relation,priority) VALUES (?,?,?,?,?)`);
  relations.forEach((r, i) =>
    rel.run(`rel-${i}`, r.exerciseId, r.relatedExerciseId, r.relation, r.priority));

  db.prepare(`INSERT INTO program_templates (id,name,version,is_cyclic,created_at_utc)
    VALUES (?,?,?,?,?)`).run(program.id, program.name, program.version, program.isCyclic ? 1 : 0, NOW);

  const wt = db.prepare(`INSERT INTO workout_templates
    (id,program_template_id,sequence_order,name,name_tr,estimated_minutes) VALUES (?,?,?,?,?,?)`);
  const te = db.prepare(`INSERT INTO template_exercises
    (id,workout_template_id,order_index,exercise_id,working_sets,warmup_sets,rep_min,rep_max,
     target_rir,rest_seconds,is_customized) VALUES (?,?,?,?,?,?,?,?,?,?,0)`);
  for (const t of program.workoutTemplates) {
    wt.run(t.id, program.id, t.sequenceOrder, t.name, t.nameTr, t.estimatedMinutes);
    for (const e of t.exercises)
      te.run(`${t.id}-${e.orderIndex}`, t.id, e.orderIndex, e.exerciseId, e.workingSets,
        e.warmupSets, e.repMin, e.repMax, e.targetRir, e.restSeconds);
  }

  const mv = db.prepare(`INSERT INTO muscle_volume_targets
    (muscle,baseline_weekly_direct_sets,max_recommended_weekly_sets,is_priority,updated_at_utc)
    VALUES (?,?,?,?,?)`);
  for (const t of targets)
    mv.run(t.muscle, t.baselineWeeklyDirectSets, t.maxRecommendedWeeklySets, t.isPriority ? 1 : 0, NOW);

  const fk = db.prepare('PRAGMA foreign_key_check').all();
  assert(fk.length === 0, `foreign_key_check ${fk.length} ihlal buldu`);
  const integrity = db.prepare('PRAGMA integrity_check').get();
  assert(Object.values(integrity)[0] === 'ok', 'integrity_check başarısız');

  const n = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  const counts = { exercises: n('exercises'), exercise_relations: n('exercise_relations'),
    workout_templates: n('workout_templates'), template_exercises: n('template_exercises'),
    muscle_volume_targets: n('muscle_volume_targets') };
  assert(counts.exercises === exercises.length, 'hareket sayısı uyuşmuyor');
  db.close();
  return Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ');
});

check('F2 · şema kısıtları hatalı veriyi reddediyor', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(read('src/core/db/migrations/001_initial.sql'));
  const rejects = (sql, why) => {
    let threw = false;
    try { db.exec(sql); } catch { threw = true; }
    assert(threw, `şema şunu reddetmeliydi: ${why}`);
  };
  rejects(`INSERT INTO body_measurements (id,measured_at_utc,local_date_key,time_zone,site,final_value_cm,aggregation)
           VALUES ('m1','2026-09-07T05:00:00.000Z','2026-09-07','Europe/Istanbul','waist',0,'single')`,
    'ölçüm değeri 0 (R119.3)');
  rejects(`INSERT INTO muscle_volume_targets (muscle,baseline_weekly_direct_sets,max_recommended_weekly_sets,updated_at_utc)
           VALUES ('biceps',13,10,'2026-09-07T05:00:00.000Z')`,
    'max < baseline (R28.1)');
  rejects(`INSERT INTO personal_records (id,pr_type,session_id,achieved_at_utc,local_date_key)
           VALUES ('p1','sessionVolumePr','s1','2026-09-07T05:00:00.000Z','2026-09-07')`,
    'geçersiz session_id (FK)');
  db.close();
  return '0 cm ölçüm · max<baseline · geçersiz FK';
});

// ---------------------------------------------------------------- G · besin
check('G1 · R46.1 kapsam: 150–250 kalem, her kategoriden en az bir tane', () => {
  assert(foods.length >= 150 && foods.length <= 250, `${foods.length} besin (150–250 bekleniyor)`);
  const cats = new Set(foods.map((f) => f.category));
  for (const need of ['protein', 'tahıl', 'süt ürünü', 'meyve', 'sebze', 'yağ']) {
    assert(cats.has(need), `R46.1 kategorisi eksik: ${need}`);
  }
  const ids = new Set(foods.map((f) => f.id));
  assert(ids.size === foods.length, 'id tekrarı var');
  return `${foods.length} besin · ${cats.size} kategori`;
});

check('G2 · R46.2/R46.4: kaynak, birim ve 100 g tabanı', () => {
  const units = new Set(['g', 'ml', 'piece', 'scoop', 'slice']);
  const sources = new Set(['seed:usda', 'seed:tr-label']);
  for (const f of foods) {
    assert(sources.has(f.source), `${f.id}: kaynak ${f.source}`);
    assert(units.has(f.servingUnit), `${f.id}: birim ${f.servingUnit}`);
    assert(f.servingSizeG > 0, `${f.id}: porsiyon ≤ 0`);
    if (f.servingUnit === 'g' || f.servingUnit === 'ml') {
      assert(f.servingSizeG === 100, `${f.id}: g/ml biriminde porsiyon 100 olmalı`);
    }
    const m = f.per100g;
    for (const k of ['kcal', 'protein', 'carb', 'fat']) assert(m[k] >= 0, `${f.id}: ${k} negatif`);
    assert(m.fiber === null || m.fiber <= m.carb + 0.01, `${f.id}: lif > karbonhidrat`);
  }
  const usda = foods.filter((f) => f.source === 'seed:usda').length;
  return `usda ${usda} · tr-label ${foods.length - usda} · marka yok (bilinçli)`;
});

check('G3 · makro-tutarlılık: kcal ≈ 4P + 4K + 9Y (±12 % / ±25 kcal)', () => {
  // Üretici bunu zaten denetliyor; burada ÜRETİLMİŞ dosyanın da tutarlı olduğu
  // ayrıca doğrulanır — biri elle düzenlenmişse burada yakalanır.
  let worst = { id: '', diff: 0 };
  for (const f of foods) {
    const { kcal, protein: p, carb: c, fat: fa, fiber } = f.per100g;
    const full = 4 * p + 4 * c + 9 * fa;
    const net = 4 * p + 4 * (c - (fiber ?? 0)) + 9 * fa;
    const tol = Math.max(25, 0.12 * Math.max(kcal, full));
    const diff = Math.min(Math.abs(kcal - full), Math.abs(kcal - net));
    assert(diff <= tol, `${f.id}: ${kcal} kcal vs ${full.toFixed(0)}`);
    if (diff > worst.diff) worst = { id: f.id, diff };
  }
  return `en büyük sapma ${worst.diff.toFixed(0)} kcal (${worst.id})`;
});

check('G4 · R46.5: iyi/kötü, temiz/kirli etiketi yok', () => {
  const banned = /\b(iyi|kötü|temiz|kirli|sağlıksız|junk|clean|dirty)\b/i;
  for (const f of foods) assert(!banned.test(f.name), `${f.id}: yargılayıcı ad "${f.name}"`);
  return `${foods.length} ad tarandı`;
});

check('G5 · besinler gerçek SQLite şemasına yükleniyor (F1 ile aynı şema)', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(read('src/core/db/migrations/001_initial.sql'));
  const NOW = '2026-09-07T05:00:00.000Z';
  const ins = db.prepare(`INSERT INTO food_items
    (id,name,source,serving_unit,serving_size_g,kcal_per_100g,protein_g_per_100g,
     carb_g_per_100g,fat_g_per_100g,fiber_g_per_100g,last_updated,custom_edited,seed_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?)`);
  for (const f of foods) {
    ins.run(f.id, f.name, f.source, f.servingUnit, f.servingSizeG, f.per100g.kcal,
      f.per100g.protein, f.per100g.carb, f.per100g.fat, f.per100g.fiber, NOW, foodSeed.seedVersion);
  }
  const n = db.prepare('SELECT COUNT(*) c FROM food_items').get().c;
  const integrity = db.prepare('PRAGMA integrity_check').get();
  db.close();
  assert(n === foods.length, 'satır sayısı uyuşmuyor');
  assert(Object.values(integrity)[0] === 'ok', 'integrity_check başarısız');
  return `${n} satır · integrity ok`;
});

check('G6 · §42–§44 beslenme hedefi belgeyle aynı ve makro toplamı tutarlı', () => {
  const t = profile.nutritionTarget;
  assert(t, 'initial-profile.json içinde nutritionTarget yok');
  assert(t.kcal === 2800 && t.proteinG === 200 && t.carbG === 320 && t.fatG === 80,
    `hedef ${JSON.stringify(t)} — R42.1/R43.1/R44.1/R44.2 ile uyuşmuyor`);
  assert(Math.abs(4 * t.proteinG + 4 * t.carbG + 9 * t.fatG - t.kcal) <= 20, 'R44.3 dağılımı tutarsız');
  assert(typeof t.rationaleTr === 'string' && t.rationaleTr.length > 20, 'gerekçe yok (R122)');
  return `${t.kcal} kcal · P ${t.proteinG} · K ${t.carbG} · Y ${t.fatG}`;
});

// ---------------------------------------------------------------- rapor
console.log('\nV90 seed doğrulaması\n' + '─'.repeat(72));
for (const c of checks)
  console.log(`${c.ok ? '  ✅' : '  ❌'} ${c.name}\n       ${c.detail}`);
console.log('─'.repeat(72));
if (failures.length) {
  console.error(`\n${failures.length} kontrol BAŞARISIZ:\n` + failures.map((f) => `  • ${f}`).join('\n') + '\n');
  process.exit(1);
}
console.log(`${checks.length} kontrolün tamamı geçti.\n`);
