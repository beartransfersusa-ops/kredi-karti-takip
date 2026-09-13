// Türkçe sözlük — docs/v90/06-ux-flows.md "Türkçe metinler" tabloları.
//
// Sözlük ÜRETİLİR; bu testler üretimin ve `t()` yerine koymasının doğru
// olduğunu kilitler. Metnin kendisi belgede durur, burada değil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t, tr } from '../src/ui/i18n/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOC = readFileSync(join(ROOT, '../docs/v90/06-ux-flows.md'), 'utf8');

test('sözlük belgedeki metni birebir taşıyor', () => {
  // 01/02'de sabitlenmiş, değişmemesi gereken metinler.
  assert.equal(tr['home.day'], 'Day {X} / 90');
  assert.equal(tr['resume.title'], 'Devam eden antrenmanın var.');
  assert.equal(tr['finish.title.partial'], 'Bugün burada bitir');
  assert.equal(tr['home.biceps.cta'], 'Başlangıç kol ölçümünü ekle.');
  assert.equal(tr['error.dbWrite'], 'Kaydedilemedi. Boş alanı kontrol et.');
  assert.equal(tr['active.assistance.hint'], 'Daha az yardım = daha zor');
  assert.equal(tr['missed.skip'], 'Gerçekten atla');
});

test('her anahtar belgede geçiyor · sözlükte uydurma metin yok', () => {
  const missing = Object.keys(tr).filter((k) => !DOC.includes(`\`${k}\``));
  assert.deepEqual(missing, [], 'belgede karşılığı olmayan anahtar');
});

test('t() yer tutucuları doldurur', () => {
  assert.equal(t('home.day', { X: 12 }), 'Day 12 / 90');
  assert.equal(t('resume.progress', { doneExercises: 3, plannedExercises: 7, sets: 12 }),
    '3/7 hareket · 12 set');
  assert.equal(t('active.rest.remaining', { 'mm:ss': '2:30' }), 'Dinlenme 2:30');
  assert.equal(t('missed.title', { templateName: 'Day 5 – V-Taper Upper', plannedWeekday: 'Perşembe' }),
    'Kaçırılan antrenman: Day 5 – V-Taper Upper (Perşembe)');
});

test('yer tutucusuz anahtar olduğu gibi döner', () => {
  assert.equal(t('active.finish'), 'Antrenmanı Bitir');
  assert.equal(t('common.retry'), 'Yeniden dene');
});

test('sözlükte kalıntı markdown yok', () => {
  const dirty = Object.entries(tr).filter(([, v]) =>
    v.includes('`') || v.includes('**') || v.includes('|') || v.trim() !== v);
  assert.deepEqual(dirty, [], 'metinde biçimlendirme kalıntısı');
});

test('kapsam · sözlük belgedeki tüm ekranları kapsıyor', () => {
  const keys = Object.keys(tr);
  assert.ok(keys.length >= 480, `beklenenden az anahtar: ${keys.length}`);
  // Her ana ekran ailesinden en az bir anahtar bulunmalı.
  for (const prefix of ['home.', 'missed.', 'active.', 'finish.', 'resume.', 'reco.', 'plateau.',
    'program.', 'reschedule.', 'onboarding.', 'settings.', 'measurement.',
    'nutrition.', 'progress.', 'photos.', 'recipe.', 'video.', 'error.', 'lock.']) {
    assert.ok(keys.some((k) => k.startsWith(prefix)), `${prefix}* anahtarı yok`);
  }
});
