# V90 – Yayın Öncesi Kabul Testleri (§124)

> **R124.1: Bu 20 senaryonun tamamı geçmeden core application "complete" olarak raporlanmaz.**
>
> Her senaryo gereksinim kimliklerine, mimari bileşenlere (`02-architecture.md`), tablolara (`03-data-model.md`) ve algoritma tanımlarına (`04-domain-engines.md`) bağlanır. "Otomatik test kimlikleri" satırındaki yollar hedef dosya adlarıdır; uygulama sırasında bu adlarla oluşturulur ve izlenebilirlik korunur.
>
> **Test seviyeleri:** unit (Jest, saf domain + `FakeClock`), integration(DB) (Node SQLite/SQLCipher, gerçek migration ve SQL), component (React Native Testing Library), E2E (Maestro, dev build; iOS + Android), manuel cihaz (gerçek donanım gerektiren: ekran kilidi, biyometri, uygulama yeniden başlatma, timezone değişimi).
>
> **Raporlama (R124.3):** sürüm notlarında her senaryo için `AT-NN: geçti/kaldı` satırı; kalan senaryo varsa sürüm "complete" etiketini alamaz.

---

### AT-01 · Workout başlat → app kapat → tekrar aç → workout aynen devam ediyor

- **Gereksinimler:** R90.1, R90.2, R90.3, R90.4, R90.5, R91.8
- **Bileşenler:** `ActiveSessionService`, `AppBootstrap`, `workout_sessions` (`ux_sessions_single_active`), `session_exercises`, `set_logs`, `rest_timers`
- **Test seviyeleri:** integration(DB), component, E2E(Maestro), manuel cihaz
- **Ön koşullar:** Aktif program, `planned` bir antrenman, boş `workout_sessions`
- **Adımlar:**
  1. Antrenmanı başlat (`start`): `workout_sessions.status='active'`, `scheduled_workouts.status='inProgress'`.
  2. İlk hareketin 2 setini logla; ikinci hareketin ağırlık alanına 60 yaz ama seti **tamamlama** (draft).
  3. Uygulamayı tamamen kapat (E2E: `stopApp`; manuel: uygulamayı arka plandan da kaldır).
  4. Uygulamayı yeniden aç.
- **Beklenen sonuç:** Ana ekranda **"Devam eden antrenmanın var."** kartı ve üç buton: **Devam Et**, **Antrenmanı Bitir**, **Antrenmanı İptal Et**. "Devam Et" sonrası: 2 set listede aynı değerlerle; ikinci hareketin ağırlık alanı 60 (draft `session_exercises.draft_load_json`); hareket sırası ve tamamlanma durumları korunmuş. DB'de tek `status='active'` satır.
- **Otomatik test kimlikleri:** `core/db/ActiveSession.persistence.test.ts::restoresActiveSessionAfterColdStart`, `features/active-workout/ResumeCard.test.tsx::showsThreeActions`, `e2e/at-01-resume-session.yaml`
- **Manuel doğrulama notu:** Gerçek cihazda uygulamayı görev yöneticisinden kaydırarak kapat; simülatör "reload" yeterli değildir.
- **Başarısızlık belirtileri:** Kart görünmüyor; setler boş; draft değer kaybolmuş; ikinci bir `active` satır oluşmuş.

### AT-02 · Set logla → crash/reload → set kaybolmuyor

- **Gereksinimler:** R90.1, R90.6, R90.7, R117.3
- **Bileşenler:** `ActiveSessionService.completeSet`, `set_logs` (`command_id UNIQUE`), `command_log`, `PrDetector`
- **Test seviyeleri:** integration(DB), E2E(Maestro), manuel cihaz
- **Ön koşullar:** Aktif oturum
- **Adımlar:**
  1. Bir set tamamla (80 kg × 10, RIR 2).
  2. Uygulamayı **crash** ettir (dev menüden reload veya native crash tetikleyici).
  3. Yeniden aç ve oturuma dön.
  4. Aynı `command_id` ile `completeSet` komutunu tekrar gönder (idempotency testi).
- **Beklenen sonuç:** `set_logs` tek satır (80/10/RIR 2), `completed_at_utc` korunmuş; tekrar gönderim `{ applied:false, reason:'duplicate' }` döner ve ikinci satır oluşmaz. Set listede görünür; dinlenme sayacı doğru kalan süreyle çalışıyor.
- **Otomatik test kimlikleri:** `core/db/SetLog.transaction.test.ts::eachCompletedSetIsCommittedImmediately`, `core/db/SetLog.transaction.test.ts::duplicateCommandIsNoop`, `e2e/at-02-set-survives-reload.yaml`
- **Manuel doğrulama notu:** Telefonu kapatıp açarak da tekrarla (`PRAGMA synchronous=FULL` davranışı).
- **Başarısızlık belirtileri:** Set kaybı; çift satır; "toplu kaydetme" nedeniyle yalnız oturum sonunda yazım.

### AT-03 · Rest timer başlat → screen lock → süre doğru devam ediyor

- **Gereksinimler:** R91.1, R91.2, R91.3, R91.4, R91.5, R91.6, R91.7, R91.8
- **Bileşenler:** `RestTimerService`, `rest_timers`, `LocalNotificationScheduler`, `Clock`
- **Test seviyeleri:** unit (FakeClock), integration(DB), E2E, manuel cihaz
- **Ön koşullar:** Bildirim izni verilmiş; 90 sn dinlenme hedefi
- **Adımlar:**
  1. Set tamamla → timer başlar (`rest_started_at_utc`, `rest_duration_seconds=90`, `state='running'`, `notification_id` dolu).
  2. 40 sn sonra ekranı kilitle.
  3. 70 sn bekle (toplam 110 sn) ve ekranı aç.
  4. Ayrı senaryo: 40 sn sonra uygulamayı kapat, 30 sn sonra aç (toplam 70 sn).
- **Beklenen sonuç:** (3) Timer bitmiş; "Dinlenme bitti" durumu ve bildirim gelmiş; `state='completed'`. (4) Kalan süre **20 sn** (90 − 70), `setInterval` sayacına göre değil zaman damgasına göre. Timer "Atla" ile iptal edilirse `state='skipped'` ve bildirim iptal edilmiş.
- **Otomatik test kimlikleri:** `domain/workout/RestTimer.test.ts::remainingDerivedFromTimestamp`, `domain/workout/RestTimer.test.ts::cancelsNotificationOnSkip`, `core/db/RestTimer.restart.test.ts::survivesAppRestart`, `e2e/at-03-rest-timer-lock.yaml`
- **Manuel doğrulama notu:** Gerçek cihazda ekran kilidi ve uçak modu ile ayrı ayrı test et; bildirim izni reddedildiğinde timer'ın yine doğru çalıştığını doğrula.
- **Başarısızlık belirtileri:** Ekran açıldığında sayaç kaldığı yerden "devam ediyor" (donmuş); süre dolmasına rağmen bildirim gelmemiş; iptal sonrası bildirim gelmiş.

### AT-04 · Bir workout kaçır → sonraki workout sessizce atlanmıyor

- **Gereksinimler:** R88.3, R88.4, R88.5, R88.6, R88.7, R89.3
- **Bileşenler:** `MissedWorkoutResolver`, `Scheduler`, `TrainingSequence`, `scheduled_workouts`, `sequence_events`
- **Test seviyeleri:** unit, integration(DB), component, E2E
- **Ön koşullar:** `training_sequence_index = 4` ("Day 5 – V-Taper Upper"), perşembeye planlanmış antrenman
- **Adımlar:**
  1. FakeClock perşembe: antrenman yapılmaz.
  2. FakeClock cuma: uygulamayı aç.
  3. Kartı kapat, uygulamayı yeniden aç.
  4. **"Gerçekten atla"** seç ve onayla.
- **Beklenen sonuç:** (2) Ana ekranda kaçırılan antrenman kartı: "Day 5 – V-Taper Upper" ve üç buton **"Bugüne taşı"**, **"Başka güne taşı"**, **"Gerçekten atla"**; `training_sequence_index` **hâlâ 4**; sıradaki antrenman olarak Day 6 **gösterilmez**. (3) Kart yeniden görünür. (4) `scheduled_workouts.status='skipped'`, `sequence_events` bir satır (`cause='skipped'`), `training_sequence_index = 5`, yeni plan oluşturuldu.
- **Otomatik test kimlikleri:** `domain/program/TrainingSequence.test.ts::advancesOnlyOnExplicitSkipOrCompletion`, `domain/program/MissedWorkoutResolver.test.ts::detectsMissedWithoutAdvancing`, `features/program/MissedWorkoutCard.test.tsx::rendersThreeOptions`, `e2e/at-04-missed-workout.yaml`
- **Başarısızlık belirtileri:** Cuma açılışında doğrudan Day 6 gösterilmesi; `training_sequence_index` kullanıcı kararı olmadan artması; kartın hiç görünmemesi.

### AT-05 · Workout'u reschedule et → calendar doğru

- **Gereksinimler:** R88.5, R88.7, R88.1, R88.2, R89.4
- **Bileşenler:** `Scheduler.reschedule`, `scheduled_workouts` (`rescheduled_from_id`, `rescheduled_to_id`), `ChallengeCalendar`
- **Test seviyeleri:** unit, integration(DB), E2E
- **Ön koşullar:** AT-04 adım 2 durumu (kaçırılmış plan), `challengeDay` = 17
- **Adımlar:**
  1. **"Bugüne taşı"** seç.
  2. Takvimi aç.
  3. Ayrı senaryo: **"Başka güne taşı"** → pazartesi seç.
  4. Ayrı senaryo: geçmiş bir tarih seçmeye çalış.
- **Beklenen sonuç:** (1) Eski satır `status='rescheduled'` + `rescheduled_to_id`; yeni satır `planned`, `planned_date_key = today`, `reschedule_reason='moveToToday'`, **aynı** `sequence_index`; `sequence_events` **yok**; `training_sequence_index` değişmedi (R88.7). (2) Takvim `Day 17 / 90` gösterir; antrenman bugüne düşmüş. (3) Yeni plan pazartesi. (4) `InvalidRescheduleDateError`; seçici geçmiş günleri zaten kapalı gösterir.
- **Otomatik test kimlikleri:** `domain/program/Scheduler.reschedule.test.ts::keepsSequenceIndex`, `domain/program/ChallengeCalendar.test.ts::challengeDayIndependentOfSequence`, `e2e/at-05-reschedule.yaml`
- **Başarısızlık belirtileri:** Sıranın ilerlemesi; iki açık plan (unique index ihlali); takvim gününün antrenmana göre kayması.

### AT-06 · Partial workout kaydet → adherence doğru

- **Gereksinimler:** R103.1, R103.2, R103.3, R103.4, R103.5
- **Bileşenler:** `ActiveSessionService.finish`, `Scheduler.finish/decidePartial`, `AdherenceCalculator`, `workout_sessions.status='partial'`, `scheduled_workouts.status='partiallyCompleted'`
- **Test seviyeleri:** unit, integration(DB), component, E2E
- **Ön koşullar:** 6 hareketlik antrenman, hedef 3 working set/hareket
- **Adımlar:**
  1. İlk 3 hareketi tamamla, 4. hareketin 1 setini yap.
  2. **"Bugün burada bitir"** seç.
  3. Karar ekranında **"Kalanı sonraki güne taşı"** seç.
  4. Haftalık uyum ekranını aç.
  5. Ayrı senaryo: adım 3'te **"Bitmiş say"** seç.
- **Beklenen sonuç:** (2) `workout_sessions.status='partial'`, `ended_reason='finishHereToday'`; **`completed` değil** (R103.1). (3) `partial_decision='continueLater'`, `remaining_exercise_ids_json` 2 hareket, yeni `planned` satır aynı `sequence_index` ile; `training_sequence_index` değişmedi. (4) Uyum ekranında kısmi ayrı sütun/renk; `completed` sayısına dahil değil; tamamlanma oranı `10/18` gösterilir. (5) `partialCountedDone` olayı, sıra +1.
- **Otomatik test kimlikleri:** `domain/program/Scheduler.partial.test.ts::doesNotAutoComplete`, `domain/analytics/AdherenceCalculator.test.ts::countsPartialSeparately`, `e2e/at-06-partial-workout.yaml`
- **Başarısızlık belirtileri:** Otomatik `completed`; kısmi antrenmanın uyum yüzdesine tam sayılması; kalan hareketlerin kaybolması.

### AT-07 · 12/12/12 hedef RIR → doğru progression

- **Gereksinimler:** R100.3, R100.4, R121.1, R121.2, R121.3, R122.1, R122.2
- **Bileşenler:** `ProgressionEngine`, `IncrementResolver`, `recommendations`
- **Test seviyeleri:** unit, component, E2E
- **Ön koşullar:** `cable-row`, hedef 3×10–12 @ RIR 2, mevcut 80 kg, cable increment 2.5
- **Adımlar:**
  1. Üç working set: 12/12/12, RIR 2.
  2. Antrenmanı bitir; sonraki antrenmanda hareketi aç.
  3. Öneri kartında **"Neden önerildi?"**'yi aç.
  4. **Değiştir** ile 85 gir ve seti logla.
- **Beklenen sonuç:** (2) Kart: "Ağırlığı artır — 82.5 kg" (80 → 82.5, gerçek kademe). (3) Gerekçe: "Son antrenmanda 3/3 sette 12 tekrar yaptın ve RIR hedefinin içinde kaldın." (4) `recommendations.decision_action='modified'`, `decision_value_json={effectiveLoad:85}`; set 85 kg ile loglandı; sonraki öneri bu kararı girdi alır.
- **Otomatik test kimlikleri:** `domain/progression/ProgressionEngine.test.ts::allSetsAtTopWithTargetRirIncreasesLoad`, `domain/progression/ProgressionEngine.test.ts::respectsUserDecisionHistory`, `features/active-workout/RecommendationCard.test.tsx::acceptModifyIgnore`, `e2e/at-07-progression.yaml`
- **Başarısızlık belirtileri:** Öneri yok; gerekçe yok; kullanıcı değerinin kaydedilmemesi.

### AT-08 · Machine increment nedeniyle önerilen ağırlık gerçek kullanılabilir değere yuvarlanıyor

- **Gereksinimler:** R100.1, R100.2, R100.3, R100.4, R100.5
- **Bileşenler:** `IncrementResolver`, `roundToAvailable`, `user_exercise_settings`
- **Test seviyeleri:** unit, component
- **Ön koşullar:** `leg-press` (`selectorizedMachine`, inc 5), mevcut 80 kg; `cable-row` (inc 2.5), mevcut 80 kg
- **Adımlar:**
  1. Her iki hareket için +%3 hedefli öneri üret.
  2. `leg-press` için kullanıcı `min_increment_kg = 2.5` ayarla ve tekrarla.
  3. Ayrık yük seti tanımlı dumbbell (10/12/14/16) için hedef 13 üret.
- **Beklenen sonuç:** (1) `leg-press` → **80 kg** + "tekrar hedefini artır" fallback'i (82.4 önerilmez); `cable-row` → **82.5 kg**. (2) `leg-press` artık 82.5 önerir (kullanıcı ayarı kazanır). (3) **14 kg** (eşit uzaklıkta yukarı). Hiçbir ekranda 82.4 / 83.2 gibi değer görünmez.
- **Otomatik test kimlikleri:** `domain/exercise/IncrementResolver.test.ts::userSettingWins`, `domain/exercise/roundToAvailable.test.ts::neverProposesUnavailableLoad`, `domain/exercise/roundToAvailable.test.ts::fallsBackToRepProgression`
- **Başarısızlık belirtileri:** Ondalıklı imkânsız değer; kullanıcı ayarının yok sayılması; fallback yerine sessiz "değişiklik yok".

### AT-09 · Assisted exercise progression ters hesaplanmıyor

- **Gereksinimler:** R101.1, R101.2, R101.3, R101.4, R107.4
- **Bileşenler:** `LoadBehavior.effectiveLoad/toRaw`, `v_set_effective_load`, `ProgressionEngine`, `PrDetector`
- **Test seviyeleri:** unit, integration(DB), component
- **Ön koşullar:** `assisted-pullup` (`assistanceLowerIsHarder`), bodyweight 107 kg kayıtlı, mevcut yardım 40 kg
- **Adımlar:**
  1. 12/12/12 @ RIR 2 logla, öneri üret.
  2. Yardımı 35 kg'a düşürüp logla; PR kontrolü.
  3. Bodyweight kaydı olmayan bir kullanıcı için aynı akışı tekrarla.
  4. Yardımı 40'a çıkar (gerileme) ve motorun tepkisini kontrol et.
- **Beklenen sonuç:** (1) Öneri **"Yardımı azalt: 35 kg"**; UI hiçbir yerde "ağırlığı artır: 45 kg" demez. (2) `loadPr` üretilir (`effective_load` 67 → 72). (3) `effectiveLoad = −40 → −35`, ilerleme yine doğru yönde; e1RM üretilmez. (4) İlerleme sayılmaz, PR yok.
- **Otomatik test kimlikleri:** `domain/exercise/LoadBehavior.test.ts::assistanceLowerIsHarder`, `domain/progression/ProgressionEngine.assisted.test.ts::proposesLessAssistance`, `core/db/views/effectiveLoadParity.test.ts::sqlMatchesTypescript`
- **Başarısızlık belirtileri:** Daha fazla yardım "ilerleme" sayılması; PR'ın ters yönde verilmesi; SQL görünümü ile TS fonksiyonunun farklı sonuç vermesi.

### AT-10 · Weight 7-day average doğru

- **Gereksinimler:** R123.1, R123.2, R123.3, R112.4
- **Bileşenler:** `TrendCalculator.weightMovingAverage`, `weight_logs`
- **Test seviyeleri:** unit, component
- **Ön koşullar:** Son 7 gün: 107.0, 106.8, 107.4, 106.5, (kayıt yok), 106.9, 106.6
- **Adımlar:**
  1. 7 günlük ortalamayı hesapla.
  2. Yalnızca 2 günlük veri olan bir pencere ile tekrarla.
  3. Aynı güne iki tartı (106.4 ve 106.8) ekle.
  4. Dashboard kartını incele.
- **Beklenen sonuç:** (1) 6 gün kullanılır → **106.9** (1 ondalık; ham 106.87). (2) `null` → "Yeterli tartı yok" (uydurma ortalama yok). (3) O gün 106.6 olarak sayılır. (4) Kart birincil olarak 7 günlük ortalamayı, ikincil olarak günlük değeri gösterir; "kesin", "X gram kas" gibi ifade yok.
- **Otomatik test kimlikleri:** `domain/analytics/TrendCalculator.test.ts::sevenDayAverageIgnoresMissingDays`, `domain/analytics/TrendCalculator.test.ts::requiresMinimumThreeDays`, `domain/analytics/TrendCalculator.test.ts::averagesMultipleWeighInsSameDay`, `shared/copy/forbiddenPhrases.test.ts::uiCopyHasNoFakePrecision`
- **Başarısızlık belirtileri:** Eksik günün 0 sayılması; 2 günlük veriyle ortalama gösterilmesi; günlük değerin trend gibi sunulması.

### Tutarsızlık / açık nokta

- **AT-07'deki `12/12/12 @ RIR 0` varyantı** `holdLoad` üretir (bkz. `04-domain-engines.md` §4.3); 01'de bu ayrım yok, ürün onayı bekler. Test bu davranışı kilitler.
- **AT-02'de "crash"** simülasyonu platforma bağlıdır; CI'da yalnızca reload testi çalışır, gerçek crash manuel kontrol listesindedir.
- **AT-03'te bildirim izni** reddedilmiş durum ayrı test edilir; R91.5 "gerekiyorsa" dediği için bildirim yokluğu başarısızlık sayılmaz.
- **AT-08'deki `selectorizedMachine = 5` varsayılanı** `04-domain-engines.md` §3'te türetildi; katalog seed'i geldiğinde doğrulanmalı.
- **AT-10'da 1 ondalık yuvarlama** kararı 02 §9.7'de yok, `04` §9.2'de tanımlandı.


---

### AT-11 · Bel/omuz oranı doğru hesaplanıyor
- **Gereksinimler:** R97.3, R97.4, R97.5, R119.3, R119.4, R123.2, R123.3, R123.4
- **Bileşenler:** `MeasurementService`, `MeasurementQuality`, `TrendCalculator`, `Clock`/`FakeClock`; tablolar `body_measurements` (`site`, `final_value_cm`, `aggregation`, `local_date_key`), `measurement_samples` (`measurement_id`, `sample_index`, `value_cm`); Progress ekranı KPI kartı.
- **Test seviyeleri:** unit / integration(DB) / component
- **Ön koşullar**
  - `FakeClock`: `nowUtc = 2026-09-07T06:00:00Z`, `timeZone = 'Europe/Istanbul'` → `todayKey() = '2026-09-07'`.
  - `programs` tek satır: `start_date_key = '2026-09-07'`, `status = 'active'`, `calendar_mode = 'strictCalendar'`.
  - Integration için Node SQLite (SQLCipher) üzerinde `001_initial` uygulanmış boş DB; `body_measurements` ve `measurement_samples` boş.
  - Bu test için sabitlenen oran tanımı (02/03'te tanımlı değil, bkz. açık nokta): `ratio = shoulder.final_value_cm / waist.final_value_cm`; her site için **en son** `final_value_cm`; gösterim 2 ondalık. Eşik (02 §11.1): iki örnek farkı `> max(0.8 cm, %1.5)` → üçüncü örnek önerilir.
- **Adımlar**
  1. (unit) `MeasurementQuality.evaluate([95.0, 96.6], 'waist')` çağır. Fark 1.6 cm; eşik `max(0.8, 0.015 × 95.0 = 1.425)`.
  2. (unit) Üçüncü örnekle tekrar: `evaluate([95.0, 96.6, 95.4], 'waist')`.
  3. (unit) `MeasurementQuality.evaluate([137.0, 137.4], 'shoulder')`. Fark 0.4 cm; eşik `max(0.8, 2.055)`.
  4. (integration) `MeasurementService.record({ site: 'waist', samples: [95.0, 96.6, 95.4] })` ve `record({ site: 'shoulder', samples: [137.0, 137.4] })` — tek transaction'da hem `body_measurements` hem `measurement_samples` yazılmalı.
  5. (unit) `TrendCalculator` ile `todayKey()` için bel/omuz oranını hesapla.
  6. (integration) `FakeClock.set('2026-10-05T06:00:00Z')`; `record({ site: 'waist', samples: [92.0] })`, `record({ site: 'shoulder', samples: [138.0, 138.2] })`. Oranı ve önceki orana göre değişimi hesapla.
  7. (integration) `FakeClock.set('2026-11-02T06:00:00Z')`; `record({ site: 'waist', samples: [89.0] })`, `record({ site: 'shoulder', samples: [138.6] })`. Son 3 ölçüm medyanına dayalı düzleştirilmiş oranı hesapla (02 §9.7).
  8. (unit, negatif) Yalnızca `waist` satırı olan fixture ile oranı iste.
  9. (unit, Zod + integration) `body_measurements` satır şemasına `final_value_cm: 0` ve `measurement_samples` şemasına `value_cm: 0` ver; ardından aynı satırları doğrudan `INSERT` etmeyi dene.
  10. (component) Progress KPI kartını adım 7 verisiyle render et.
- **Beklenen sonuç**
  - Adım 1: `{ suggestThird: true }`.
  - Adım 2: `{ finalValueCm: 95.4, aggregation: 'median' }` (medyan; ortalama 95.67 **değil**).
  - Adım 3: `{ suggestThird: false, finalValueCm: 137.2, aggregation: 'mean' }`.
  - Adım 4: `body_measurements` 2 satır — `('waist', 95.4, 'median', '2026-09-07')`, `('shoulder', 137.2, 'mean', '2026-09-07')`; `measurement_samples` 5 satır — waist için `(1, 95.0), (2, 96.6), (3, 95.4)`, shoulder için `(1, 137.0), (2, 137.4)` (R97.5: ham örnekler + final birlikte).
  - Adım 5: `137.2 / 95.4 = 1.4382…` → `"1.44"`.
  - Adım 6: waist `(92.0, 'single')`, shoulder `(138.1, 'mean')`; oran `138.1 / 92.0 = 1.5011…` → `"1.50"`; değişim `"+0.06"`. Ham örnek değil `final_value_cm` kullanılır (`137.2 / 96.6 = 1.42` çıkıyorsa hata).
  - Adım 7: en son oran `138.6 / 89.0 = 1.5573…` → `"1.56"`; düzleştirilmiş oran (son 3 finalin medyanı: waist `median(95.4, 92.0, 89.0) = 92.0`, shoulder `median(137.2, 138.1, 138.6) = 138.1`) → `"1.50"`; UI tekil değeri bağlamıyla ("son 3 ölçüm medyanı") birlikte sunar (R123.3).
  - Adım 8: oran `null`; UI `"—"` gösterir; ekranda `"0"`, `"0.00"` veya `"NaN"` yok (R119.3).
  - Adım 9: Zod `positive()` hatası; DB `CHECK (final_value_cm > 0 …)` ve `CHECK (value_cm > 0)` ihlali (`SQLITE_CONSTRAINT`), satır yazılmaz (R119.4).
  - Adım 10: kart `"1.56"` gösterir; ölçüm değeri "tahmin" rozeti **taşımaz** (rozet yalnızca `isEstimate: true` metrikler için, R123.4).
- **Otomatik test kimlikleri:**
  - `domain/measurements/MeasurementQuality.test.ts::suggestsThirdSampleWhenSpreadExceedsThreshold`
  - `domain/measurements/MeasurementQuality.test.ts::medianOfThreeSamplesIsFinal`
  - `domain/measurements/MeasurementQuality.test.ts::meanOfTwoSamplesIsFinal`
  - `domain/measurements/MeasurementService.test.ts::recordsSamplesAndFinalInOneTransaction`
  - `domain/analytics/TrendCalculator.test.ts::shoulderToWaistRatioUsesFinalValues`
  - `domain/analytics/TrendCalculator.test.ts::smoothedRatioUsesMedianOfLastThree`
  - `domain/analytics/TrendCalculator.test.ts::ratioIsNullWhenEitherSiteMissing`
  - `core/db/repositories/MeasurementRepository.test.ts::rejectsZeroValuesByCheckConstraint`
  - `features/progress/RatioKpiCard.test.tsx::rendersTwoDecimalsAndNoEstimateBadge`
- **Manuel doğrulama notu:** Gerekmez.
- **Başarısızlık belirtileri:** Oran ters (`"0.69"`) veya ham örnekten hesaplanmış; medyan yerine ortalama; üçüncü ölçüm önerisi çıkmıyor; `measurement_samples` boş (yalnızca final saklanıyor); eksik site için `"0.00"`/`"NaN"`; ölçümde "tahmin" rozeti.

### AT-12 · Biceps baseline yokken `0 cm` gösterilmiyor
- **Gereksinimler:** R96.1, R96.2, R96.3, R96.4, R96.5, R119.2, R119.3, R119.4
- **Bileşenler:** `BaselineResolver`, `seedInitialProfile`, `data/initial-profile.json`, `MeasurementService`; tablolar `profiles`, `body_measurements` (`site ∈ {'bicepsLeftFlexed','bicepsRightFlexed','bicepsFlexed'}`, `final_value_cm`, `is_baseline`), `weight_logs`; Dashboard kol KPI kartı + CTA; `TableRegistry` Zod satır şemaları.
- **Test seviyeleri:** unit / integration(DB) / component / E2E(Maestro)
- **Ön koşullar**
  - Temiz DB; `FakeClock`: `2026-09-07T06:00:00Z`, `'Europe/Istanbul'`.
  - `programs.start_date_key = '2026-09-07'`, `status = 'active'`.
  - Onboarding'de "önceden girilmiş değerleri kullan" seçilmiş → `seedInitialProfile()` çalışmış.
  - E2E: dev build, temiz kurulum (uygulama verisi silinmiş).
- **Adımlar**
  1. (integration) `seedInitialProfile()` sonrası `SELECT site, final_value_cm FROM body_measurements` ve `SELECT height_cm FROM profiles`, `SELECT weight_kg FROM weight_logs` sorgula.
  2. (unit) `BaselineResolver.biceps()` çağır (in-memory repo, hiç biceps satırı yok).
  3. (component) Dashboard'u `bicepsBaseline = null` ile render et; `"0 cm"`, `"0.0 cm"`, `"0"` metinlerini ara; CTA'yı ara.
  4. (unit, Zod) `{ site: 'bicepsFlexed', finalValueCm: 0 }` ve `{ site: 'bicepsFlexed', finalValueCm: null }` şemaya ver; (integration) `final_value_cm = 0` ile INSERT dene.
  5. (integration) `FakeClock.set('2026-09-08T07:00:00Z')`; `MeasurementService.record({ site: 'bicepsLeftFlexed', samples: [37.5] })` ve `record({ site: 'bicepsRightFlexed', samples: [38.5] })`.
  6. (unit) `BaselineResolver.biceps()` tekrar; (component) Dashboard'u yeni değerle render et.
  7. (unit, sınır) Fixture'ı sıfırla; tek kayıt `bicepsFlexed = 39.0`, `local_date_key = '2026-09-16'` (başlangıçtan 9 gün sonra, ±7 gün penceresi dışı) → `BaselineResolver.biceps()`.
  8. (E2E) `e2e/at-12-biceps-baseline-cta.yaml`: temiz kurulum → onboarding'de kol ölçümü alanını boş bırak (**"Atla"** / boş) → Dashboard'da `id: dashboard.bicepsKpi` bul → CTA'ya dokun → ölçüm ekranında `id: measurement.bicepsLeftFlexed.input` = `37.5`, `id: measurement.bicepsRightFlexed.input` = `38.5` → kaydet → Dashboard'a dön.
- **Beklenen sonuç**
  - Adım 1: `body_measurements` tam olarak 7 satır: `waist 95`, `abdomen 114`, `shoulder 137`, `hip 119`, `chest 110`, `forearm 37` … (R119.1 listesi); **hiçbir satır** `site LIKE 'biceps%'`; hiçbir satırda `final_value_cm = 0`; `profiles.height_cm = 187`; `weight_logs.weight_kg = 107` (R119.2, R119.3).
  - Adım 2: `null` (`0`, `undefined` veya `{ left: 0, right: 0 }` değil).
  - Adım 3: `"Başlangıç kol ölçümünü ekle."` metni **görünür**; `"0 cm"` benzeri metin **yok**; KPI kartı `disabled` (accessibilityState `{ disabled: true }`) (R96.3–R96.5).
  - Adım 4: `0` → Zod hatası; `null` → geçerli ("bilinmiyor"); DB INSERT `CHECK` ihlali (R119.4).
  - Adım 5: `body_measurements` 2 yeni satır `('bicepsLeftFlexed', 37.5, '2026-09-08')`, `('bicepsRightFlexed', 38.5, '2026-09-08')`, `aggregation = 'single'`.
  - Adım 6: `{ leftCm: 37.5, rightCm: 38.5, displayCm: 38.0, measuredOn: '2026-09-08' }`; Dashboard KPI aktif, `"38.0 cm"` gösterir; CTA **kaybolur**.
  - Adım 7: 02 §11.2 kuralına göre `null` (pencere dışı) → CTA görünmeye devam eder. (Bkz. açık nokta: pencere dışı ilk ölçümün UX'i.)
  - Adım 8: CTA görünür → ölçüm kaydı → `"38.0 cm"` görünür, `"Başlangıç kol ölçümünü ekle."` görünmez.
- **Otomatik test kimlikleri:**
  - `domain/profile/seedInitialProfile.test.ts::doesNotWriteBicepsOrZeroValues`
  - `domain/measurements/BaselineResolver.test.ts::returnsNullWhenNoBicepsRecord`
  - `domain/measurements/BaselineResolver.test.ts::averagesLeftAndRightWithinWindow`
  - `domain/measurements/BaselineResolver.test.ts::returnsNullOutsidePlusMinusSevenDays`
  - `core/db/zod/MeasurementRow.test.ts::rejectsZeroAcceptsNull`
  - `features/dashboard/BicepsKpiCard.test.tsx::showsCtaAndNoZeroWhenBaselineMissing`
  - `features/dashboard/BicepsKpiCard.test.tsx::enablesKpiAfterBaseline`
  - `e2e/at-12-biceps-baseline-cta.yaml`
- **Manuel doğrulama notu:** Gerekmez (simülatör yeterli).
- **Başarısızlık belirtileri:** Dashboard'da `"0 cm"`; `body_measurements`'ta `final_value_cm = 0` satırı; seed'in biceps satırı yazması; CTA'nın baseline girildikten sonra da kalması; `null` değerin Zod tarafından reddedilmesi.

### AT-13 · Timezone değişimi: günlük loglar yanlış güne kaymıyor
- **Gereksinimler:** R112.1, R112.2, R112.3, R112.4, R112.5, R113.1, R113.2, R113.3, R113.4, R88.2, R88.8, R91.3
- **Bileşenler:** `Clock`/`FakeClock`, `core/time` (`localDateKey`), `DayRolloverObserver` (`DAY_CHANGED`, `TZ_CHANGED`), `ChallengeCalendar`, `ActiveSessionService`, `SetLogService`, `RestTimerService`, `MealLogService`; tablolar `meal_logs` (`local_date_key`, `time_zone`, `logged_at_utc`), `weight_logs`, `workout_sessions` (`started_at_utc`, `completed_at_utc`, `calendar_date_key`, `calendar_date_overridden`, `time_zone`, `utc_offset_minutes`), `set_logs` (`local_date_key`, `completed_at_utc`), `rest_timers`.
- **Test seviyeleri:** unit / integration(DB) / E2E(Maestro, Android) / manuel cihaz (iOS)
- **Ön koşullar**
  - `programs.start_date_key = '2026-09-07'`, `start_time_zone = 'Europe/Istanbul'`, `calendar_mode = 'strictCalendar'`.
  - `FakeClock`: `nowUtc = 2026-09-20T22:30:00Z`, `timeZone = 'Europe/Istanbul'` (UTC+3 → yerel **2026-09-21 01:30**).
  - E2E: Android emülatör, otomatik saat dilimi kapalı; Maestro flow'u `adb shell service call alarm 3 s16 <tz>` ile tz değiştiren bir kabuk sarmalayıcı (`e2e/run-at-13.sh`) tarafından çalıştırılır.
- **Adımlar**
  1. (integration) `MealLogService.log({ mealSlot: 'breakfast', entries: [...] })` ve `weight_logs` INSERT (100.0 kg) — clock'tan `todayKey()` alınarak.
  2. (unit) `ChallengeCalendar.challengeDay(clock)` hesapla.
  3. (unit) `FakeClock.setTimeZone('America/New_York')` (UTC−4 → yerel **2026-09-20 18:30**); `DayRolloverObserver.tick()` çağır.
  4. (integration) Adım 1 satırlarını tekrar oku; `MealLogService.forDay(clock.todayKey())` ve `forDay('2026-09-21')` sorgula; `challengeDay` tekrar hesapla.
  5. (unit) `FakeClock.set('2026-09-21T04:00:00Z')` (New York 00:00, 21 Eylül) → `DayRolloverObserver.tick()`.
  6. (integration, gün sınırı) Fixture'ı sıfırla; `FakeClock`: `2026-09-21T20:50:00Z`, `'Europe/Istanbul'` (23:50). `ActiveSessionService.start(scheduledWorkoutId)`.
  7. (integration) `FakeClock.set('2026-09-21T21:10:00Z')` (00:10, 22 Eylül). `SetLogService.completeSet(...)` bir working set; ardından `ActiveSessionService.finish({ reason: 'allDone' })`.
  8. (integration) Oturum özetinde `calendarDateKey`'i `'2026-09-22'` olarak düzenle (R113.4).
  9. (unit, rest timer) `RestTimerService.start(120)` at `2026-09-21T21:00:00Z`; `FakeClock.setTimeZone('Asia/Tokyo')`; `FakeClock.set('2026-09-21T21:01:30Z')`; `remaining()` oku.
  10. (E2E) `e2e/at-13-timezone-change.yaml`: Beslenme ekranında `id: nutrition.addMeal` → `"Kahvaltı"` öğününe bir besin ekle → uygulamayı kapat → sarmalayıcı tz'yi `America/New_York` yapar → uygulamayı aç → Beslenme ekranında tarih seçiciyle `2026-09-21`'e git → öğünü doğrula; Dashboard `id: dashboard.challengeDay` metnini oku.
- **Beklenen sonuç**
  - Adım 1: `meal_logs`: `local_date_key = '2026-09-21'`, `time_zone = 'Europe/Istanbul'`, `logged_at_utc = '2026-09-20T22:30:00.000Z'`; `weight_logs.local_date_key = '2026-09-21'` (UTC tarihi 20 Eylül olmasına rağmen; R112.2).
  - Adım 2: `challengeDay = 15` (`daysBetween('2026-09-07','2026-09-21') + 1`).
  - Adım 3: `TZ_CHANGED` olayı yayılır; hiçbir tabloda UPDATE yok (satır sayıları ve `local_date_key` değerleri birebir aynı; R112.4).
  - Adım 4: `forDay('2026-09-20')` → 0 satır; `forDay('2026-09-21')` → 1 satır; `challengeDay = 14` (en fazla ±1 gün kayma **beklenen** davranış, 02 §5.5); UI `"Day 14 / 90"`.
  - Adım 5: `DAY_CHANGED` yayılır; `todayKey() = '2026-09-21'`; `challengeDay = 15`; öğün "bugün" görünümünde.
  - Adım 6: `workout_sessions`: `started_at_utc = '2026-09-21T20:50:00.000Z'`, `calendar_date_key = '2026-09-21'`, `time_zone = 'Europe/Istanbul'`, `utc_offset_minutes = 180`, `calendar_date_overridden = 0`.
  - Adım 7: `set_logs.completed_at_utc = '2026-09-21T21:10:00.000Z'`, `set_logs.local_date_key = '2026-09-21'` — oturuma bağlı kayıtlar günü `workout_sessions.calendar_date_key`'ten alır (02 §5.1 istisnası, R113.1); yazma anının yerel tarihi (22 Eylül) **kullanılmaz**. `workout_sessions.completed_at_utc = '2026-09-21T21:10:00.000Z'`, `calendar_date_key` **hâlâ** `'2026-09-21'` (R113.3). `v_weekly_direct_sets` seti `2026-09-21` altında sayar.
  - Adım 8: `calendar_date_key = '2026-09-22'`, `calendar_date_overridden = 1`, `started_at_utc` değişmez; aynı transaction'da oturumun `set_logs.local_date_key` ve varsa `personal_records.local_date_key` satırları da `'2026-09-22'`'ye taşınır (02 §12.5).
  - Adım 9: `remaining = 30` (tz'den bağımsız, UTC farkından; R91.3).
  - Adım 10: Öğün `2026-09-21` altında görünür, `2026-09-20` altında görünmez; `"Day 14 / 90"` (veya cihaz saati 21 Eylül'e geçtiyse `"Day 15 / 90"`); uygulama çökmez.
- **Otomatik test kimlikleri:**
  - `core/time/localDateKey.test.ts::istanbulAfterMidnightIsNextDayWhileUtcIsPrevious`
  - `domain/nutrition/MealLogService.test.ts::mealKeepsLocalDateKeyAfterTimezoneChange`
  - `domain/program/ChallengeCalendar.test.ts::challengeDayShiftsAtMostOneDayOnTimezoneChange`
  - `core/time/DayRolloverObserver.test.ts::emitsDayChangedWhenTodayKeyChanges`
  - `core/time/DayRolloverObserver.test.ts::emitsTzChangedWithoutRewritingRows`
  - `domain/workout/ActiveSessionService.test.ts::calendarDateIsStartDateAcrossMidnight`
  - `domain/workout/ActiveSessionService.test.ts::calendarDateOverrideSetsFlag`
  - `domain/workout/RestTimerService.test.ts::remainingIsTimezoneIndependent`
  - `e2e/at-13-timezone-change.yaml`
- **Manuel doğrulama notu:** iOS'ta tz değişimi Maestro ile otomatikleştirilemez: gerçek iPhone'da Ayarlar > Genel > Tarih ve Saat > "Otomatik ayarla" kapat, saat dilimini `New York` yap, uygulamayı ön plana getir; öğün/kilo/antrenmanın günü değişmemeli, `Day X / 90` en fazla 1 gün oynamalı. Gerçek seyahat senaryosu (uçak modu + tz değişimi) ayrıca önerilir.
- **Başarısızlık belirtileri:** Öğün bir gün geriye kayıyor; `local_date_key` tz değişiminde yeniden hesaplanıyor (UPDATE); `calendar_date_key` bitiş tarihini alıyor (`'2026-09-22'`); gece yarısından sonra loglanan set oturumun değil yazma anının gününe düşüyor; `challengeDay` 2+ gün oynuyor; gece yarısı ekran güncellenmiyor (`DAY_CHANGED` yok); rest timer tz değişiminde sıfırlanıyor/negatif.

### AT-14 · Backup export → app reset → import → tüm veri geri geliyor
- **Gereksinimler:** R95.1, R95.2, R95.3, R95.4, R95.5, R95.6, R95.8, R93.5, R116.1, R116.4, R92.2
- **Bileşenler:** `BackupExporter`, `BackupImporter`, `BackupArchiver`, `TableRegistry`, `BACKUP_MIGRATORS` (`core/backup/migrators/00k.ts`), `MigrationRunner` (staging DB), `EncryptedSqliteProvider`, `DbKeyManager`, `PhotoStore`, `OrphanSweeper`; arşiv içeriği `manifest.json`, `data.json`, `photos/`; dosyalar `v90.sqlite`, `v90.import.sqlite`, `v90.pre-import.sqlite`, `photos.import/`.
- **Test seviyeleri:** integration(DB) / unit / manuel cihaz (E2E opsiyonel)
- **Ön koşullar**
  - `test/fixtures/backup/full-dataset.ts`: `TableRegistry`'deki **her** tabloda ≥ 1 satır (`settings`'te `'appLock.enabled' = true`, `'appLock.graceSeconds' = 30`; `programs.training_sequence_index = 4`; 3 `workout_sessions` (biri `partial`), 24 `set_logs` (2'si `discarded = 1`), 2 `rest_timers` (`completed`/`skipped`), 2 `personal_records`, 1 `recommendations` (`decision_action = 'modified'`), 1 `plateau_insights`, 2 `progress_photos` + gerçek dosyalar, 2 `recipes` + `recipe_ingredients`, 1 `saved_meals`, 1 `nutrition_targets`, 2 `lab_results`, 1 `program_pauses`, 2 `sequence_events`, 1 `settings_history`, `user_exercise_settings`, `exercise_relations`, `food_items` (`custom_edited = 1` olan bir satır) …).
  - `FakeClock`: `2026-10-15T09:00:00Z`, `'Europe/Istanbul'`.
  - Geçici dizin; `expo-file-system`/`expo-sharing` mock'ları.
- **Adımlar**
  1. (unit) Registry tamlığı: `Object.keys(TableRegistry)` ile `sqlite_master` kullanıcı tabloları (hariç: `schema_migrations`, `command_log`) karşılaştır.
  2. (integration) Fixture'ı yükle; her tablo için `snapshotBefore[table] = SELECT * ORDER BY <pk>` (kanonik JSON) ve `photoShaBefore` al.
  3. (integration) `BackupExporter.export()` → `zipUri`. ZIP'i aç; `manifest.json`'ı Zod ile parse et; `data.json` sha256'sını hesapla.
  4. (unit) `data.json` ve `manifest.json` metninde `DbKeyManager` anahtarının hex değeri ve `'v90.dbkey'` geçmediğini doğrula.
  5. (integration, "app reset") DB'yi kapat; `v90.sqlite`, `-wal`, `-shm`, `photos/` dizinini sil; `SecureStore` mock'undaki `'v90.dbkey'`'i sil; uygulamayı yeniden aç (`MigrationRunner.run()` → boş şema, yeni anahtar üretimi).
  6. (integration) Boş DB'de `SELECT COUNT(*) FROM programs` = 0 olduğunu doğrula.
  7. (integration) `BackupImporter.import(zipUri)` (mod **"Değiştir"**).
  8. (integration) Her tablo için `snapshotAfter` al ve `snapshotBefore` ile karşılaştır; `photos/` dosyalarının sha256'larını `photoShaBefore` ile karşılaştır; `PRAGMA integrity_check`, `PRAGMA foreign_key_check`, `PRAGMA user_version`; dosya sisteminde artık `v90.import.sqlite` / `photos.import/` olmadığını, `v90.pre-import.sqlite` bulunduğunu doğrula.
  9. (integration) `OrphanSweeper.run()` çalıştır; `progress_photos` sayısını ve dosya sayısını oku.
  10. (integration, eski sürüm) `test/fixtures/backup/v001.zip` (`schemaVersion: 1`) ile `import()`; `BACKUP_MIGRATORS` zincirinin çağrıldığını spy ile doğrula.
  11. (unit) Zincir eşliği: her `MIGRATIONS[k]` için `BACKUP_MIGRATORS[k]` var.
  12. (uygulama düzeyi, component) Import sonrası `AppBootstrap` → Dashboard; `AppLockService.enabled` ve `TrainingSequence.next()`.
- **Beklenen sonuç**
  - Adım 1: iki küme **eşit** (eksik/fazla tablo yok → R95.1 garanti).
  - Adım 3: dosya adı `v90-backup-20261015-1200.zip` (yerel saat); `manifest.json` = `{ formatVersion: 1, schemaVersion: <PRAGMA user_version>, appVersion, createdAtUtc: '2026-10-15T09:00:00.000Z', timeZone: 'Europe/Istanbul', tables: { <her tablo>: <COUNT(*)> }, photos: { count: 2, totalBytes }, dataSha256, photoShas }`; `dataSha256 == sha256(data.json)`; `data.json.tables` anahtarları `TableRegistry` ile aynı; `photos/<photoId>.<ext>` 2 dosya.
  - Adım 4: anahtar arşivde **yok** (R93.5); UI'da "yedek şifresizdir" uyarısı gösterilmiş (component).
  - Adım 6: 0.
  - Adım 7: `import()` hatasız döner; `{ mode: 'replace', tables: {...}, photos: 2 }`.
  - Adım 8: `snapshotAfter` **deep-equal** `snapshotBefore` (tüm tablolar, `discarded = 1` setler ve `settings_history` dahil); sha256'lar eşit; `integrity_check = 'ok'`; `foreign_key_check` boş; `user_version == MIGRATIONS.at(-1).version`; `v90.pre-import.sqlite` var (7 gün "Geri al"), staging artıkları yok.
  - Adım 9: sweeper hiçbir satır/dosya silmez (2 satır ↔ 2 dosya).
  - Adım 10: import başarılı; satırlar güncel şemada; migrator zinciri `v001 → latest` sırayla çağrılmış (R95.8).
  - Adım 11: lint testi geçer.
  - Adım 12: Dashboard'da challengeDay fixture'a göre (`start_date_key`'den türetilir); `AppLockService.enabled = true`, `graceSeconds = 30`; sıradaki antrenman `"Day 5 – V-Taper Upper"` (`training_sequence_index = 4`).
- **Otomatik test kimlikleri:**
  - `core/db/TableRegistry.test.ts::registryMatchesSqliteMasterUserTables`
  - `core/backup/BackupExporter.test.ts::manifestRowCountsAndShaMatchDatabase`
  - `core/backup/BackupExporter.test.ts::archiveNeverContainsDbKey`
  - `core/backup/BackupRoundTrip.test.ts::exportResetImportRestoresEveryTableAndPhoto`
  - `core/backup/BackupImporter.test.ts::importsOlderSchemaThroughMigratorChain`
  - `core/backup/migrators/index.test.ts::everyDbMigrationHasBackupMigrator`
  - `core/media/OrphanSweeper.test.ts::noOrphansAfterImport`
  - `features/settings/BackupScreen.test.tsx::warnsThatArchiveIsUnencrypted`
- **Manuel doğrulama notu:** Gerçek cihaz (iOS + Android): Ayarlar > Yedekleme > dışa aktar → paylaşım sayfasından Dosyalar/Drive'a kaydet → uygulamayı kaldır → yeniden kur → onboarding'i atla → içe aktar (**"Değiştir"**) → Dashboard, Program takvimi, Progress fotoğrafları, Labs, Beslenme geçmişi, Ayarlar (app lock açık) görsel kontrol. iOS'ta Keychain anahtarı kaldırma sonrası kalabilir; Android'de silinir — her iki durumda import yeni DB'ye yazıldığı için sonuç aynı olmalı.
- **Başarısızlık belirtileri:** Bir tablo `data.json`'da eksik (`TableRegistry` testi kırmızı); fotoğraflar geri gelmiyor veya sha uyuşmuyor; `settings` içe aktarılmıyor (app lock kapalı geliyor); `training_sequence_index` 0'a dönüyor; `v90.import.sqlite` artığı kalıyor; anahtar arşivde görünüyor; eski `schemaVersion` reddediliyor.

### AT-15 · Başarısız import mevcut veriyi silmiyor
- **Gereksinimler:** R95.6, R95.7, R95.8, R117.1, R117.3, R117.4, R117.5
- **Bileşenler:** `BackupImporter`, `BackupArchiver`, `TableRegistry` Zod şemaları, `BACKUP_MIGRATORS`, staging DB `v90.import.sqlite`, `photos.import/`, `ImportError`, hata → Türkçe mesaj haritası (`core/errors`), `ErrorBoundary`, `ActiveSessionService`.
- **Test seviyeleri:** unit / integration(DB) / component / manuel cihaz
- **Ön koşullar**
  - AT-14'teki `full-dataset` fixture yüklü **ve** ek olarak `status = 'active'` bir `workout_sessions` satırı + `state = 'running'` bir `rest_timers` satırı (import sırasında aktif antrenman var).
  - `snapshotBefore` (tüm tablolar, kanonik JSON + tablo başına sha256), `photoShaBefore`, `v90.sqlite` dosya sha256'sı ve `mtime`.
  - Bozuk yedek fixture'ları (`test/fixtures/backup/bad/*`):
    | Kod | Fixture | Hata sınıfı |
    |-----|---------|-------------|
    | a | `not-a-zip.zip` (rastgele bayt) | `ImportError('ARCHIVE_INVALID')` |
    | b | `missing-manifest.zip` | `ImportError('MANIFEST_MISSING')` |
    | c | `sha-mismatch.zip` (`dataSha256` yanlış) | `ImportError('CHECKSUM_MISMATCH')` |
    | d | `zod-invalid.zip` (`weight_logs[0].weight_kg = 0`) | `ImportError('VALIDATION_FAILED')` |
    | e | `fk-broken.zip` (`set_logs` → olmayan `session_id`) | `ImportError('INTEGRITY_FAILED')` (`foreign_key_check`) |
    | f | `newer-schema.zip` (`schemaVersion = 99`) | `ImportError('SCHEMA_TOO_NEW')` |
    | g | geçerli zip + adım 6 swap'ta `rename` enjekte hata | `ImportError('SWAP_FAILED')` |
    | h | `photo-sha-mismatch.zip` | `ImportError('PHOTO_CHECKSUM_MISMATCH')` |
- **Adımlar**
  1. (integration, parametrik a–h) `BackupImporter.import(fixtureUri)` çağır; fırlatılan hatayı yakala.
  2. (integration) `snapshotAfter`, `photoShaAfter`, `v90.sqlite` sha256/mtime al; dosya sisteminde `v90.import.sqlite`, `photos.import/`, temp açma dizini var mı bak.
  3. (integration) `ActiveSessionService.findActive()` ve `rest_timers WHERE state='running'` sorgula.
  4. (integration, g) Swap adımı için `FileSystem.moveAsync` mock'unu **ikinci** çağrıda (`v90.import.sqlite → v90.sqlite`) fırlatacak şekilde ayarla; ilk adım (`v90.sqlite → v90.pre-import.sqlite`) yapılmış olacak.
  5. (unit) `errorMessageFor(ImportError)` haritasını her kod için çağır.
  6. (component) Yedekleme ekranını hata durumuyla render et; `"Ayrıntılar"` aç.
  7. (component) Kök `ErrorBoundary` üzerine bir `onError` spy koy; adım 1'i UI akışından tetikle.
  8. (integration) Başarısız denemeden sonra geçerli yedek ile `import()` tekrar çağır (**"Tekrar dene"** yolu).
- **Beklenen sonuç**
  - Adım 1: her fixture için tablodaki kodla `ImportError` fırlatılır; `import()` **asla** kısmi başarı döndürmez.
  - Adım 2: `snapshotAfter` deep-equal `snapshotBefore` (tüm tablolar); `photoShaAfter == photoShaBefore`; `v90.sqlite` sha256 ve `mtime` değişmemiş; staging artıkları (`v90.import.sqlite`, `photos.import/`, temp dizin) **temizlenmiş** (R95.7).
  - Adım 3: aktif oturum hâlâ `active`, rest timer hâlâ `running` (import aktif antrenmanı bozmaz).
  - Adım 4 (g): ters işlem çalışır: `v90.pre-import.sqlite → v90.sqlite` geri adlandırılır; sonuç adım 2 ile aynı; `v90.pre-import.sqlite` artığı **kalmaz**.
  - Adım 5: her kod için ana mesaj `"İçe aktarma başarısız; mevcut verin değişmedi."`; (f) için ek açıklama `"Bu yedek daha yeni bir sürümle alınmış"` (+ yedeğin `schemaVersion` ve uygulamanın sürümü); teknik detay yalnızca `details` alanında (R117.5).
  - Adım 6: ekranda `"İçe aktarma başarısız; mevcut verin değişmedi."`, `"Ayrıntılar"` ve `"Tekrar dene"` butonları; `"Ayrıntılar"` altında hata kodu ve (d için) Zod yolu `tables.weight_logs[0].weight_kg`.
  - Adım 7: `ErrorBoundary.onError` **çağrılmaz** (beyaz ekran yok, R117.1); ekran etkileşimli kalır.
  - Adım 8: import başarılı; AT-14 doğrulamaları geçer (başarısız deneme sonraki denemeyi kilitlemez).
- **Otomatik test kimlikleri:**
  - `core/backup/BackupImporter.test.ts::failedImportLeavesDataUntouched` (`describe.each` a–h)
  - `core/backup/BackupImporter.test.ts::rejectsNewerSchemaVersionWithExplanation`
  - `core/backup/BackupImporter.test.ts::swapFailureRestoresOriginalDatabaseFile`
  - `core/backup/BackupImporter.test.ts::cleansStagingArtifactsAfterFailure`
  - `core/backup/BackupImporter.test.ts::activeSessionSurvivesFailedImport`
  - `core/backup/BackupImporter.test.ts::retryAfterFailureSucceeds`
  - `core/errors/errorMessages.test.ts::importErrorMapsToTurkishMessageWithDetails`
  - `features/settings/BackupScreen.test.tsx::showsImportFailureWithDetailsAndRetry`
  - `features/settings/BackupScreen.test.tsx::doesNotTriggerRootErrorBoundary`
- **Manuel doğrulama notu:** Gerçek cihazda dosya seçiciden bilerek bozulmuş bir ZIP (`.txt` yeniden adlandırılmış) ve `schemaVersion` elle 99 yapılmış bir yedek seç; ardından uygulamayı kapatıp aç → tüm veri yerinde, aktif antrenman kartı hâlâ görünüyor.
- **Başarısızlık belirtileri:** Kısmi tablolar (bazı tablolar yedekten, bazıları eski); satır sayıları değişti; `v90.sqlite` `mtime` değişti; `v90.import.sqlite`/`photos.import/` artığı; İngilizce/teknik hata mesajı ana metinde; boş/beyaz ekran; import sonrası aktif oturum kaybı; "Tekrar dene" ikinci denemede `SQLITE_BUSY`.

### AT-16 · Schema migration → eski veri korunuyor
- **Gereksinimler:** R92.1, R92.2, R92.3, R92.4, R92.5, R92.6, R92.7, R95.8, R117.3
- **Bileşenler:** `MigrationRunner`, `MIGRATIONS`, `Migration.up`, `hasColumn`, `schema_migrations` (`version`, `name`, `checksum`, `applied_at_utc`), `PRAGMA user_version`, yedek dosyası `v90.bak.v<from>.sqlite`, `MigrationFailedScreen`, `MigrationFailedError`, `DbIntegrityError`, `BACKUP_MIGRATORS`, fixture `test/fixtures/db/v001.sql`; test-double migration `m002AddWorkoutState` (03 §2'deki şablon).
- **Test seviyeleri:** unit / integration(DB) / component
- **Ön koşullar**
  - `test/fixtures/db/v001.sql`: `001_initial` şeması + temsili veri (1 `programs`, 2 `scheduled_workouts`, 3 `workout_sessions`, 24 `set_logs`, 3 `rest_timers`, 10 `weight_logs`, 8 `body_measurements` + 12 `measurement_samples`, 2 `progress_photos`, 5 `meal_logs` + 12 `meal_entries`, 2 `lab_results`, 3 `settings`, 1 `program_pauses`) ve `PRAGMA user_version = 1`, `schema_migrations` 1 satır.
  - Test `MIGRATIONS` listesi enjekte edilebilir: `[m001Initial, m002AddWorkoutState]` (`m002`, `workout_sessions.perceived_effort` kolonu ekler).
  - Hata enjeksiyonu için `m002Failing`: `ALTER TABLE` sonrası `throw new Error('injected')`.
  - `FakeClock`: `2026-10-20T08:00:00Z`; `expo-file-system` mock'u (`copyAsync`, `deleteAsync`, boş alan sorgusu).
- **Adımlar**
  1. (integration, a: fresh→latest) Boş DB → `MigrationRunner.run()`.
  2. (integration, b: v001→latest) `v001.sql` yükle; `snapshotBefore` al; `run()`.
  3. (integration, c: idempotency) Adım 2 sonrasında `run()` **ikinci kez**; ayrıca `m002.up(tx)`'i doğrudan iki kez çağır.
  4. (integration, d: fail-injection) `v001.sql` yükle; `MIGRATIONS = [m001Initial, m002Failing]`; `run()`; hatayı yakala.
  5. (integration, e: checksum) `schema_migrations.checksum`'ı elle boz; `run()`.
  6. (integration, f: user_version onarımı) `PRAGMA user_version = 0` yap ama `schema_migrations` dolu bırak; `run()`.
  7. (integration, g: yedek) Adım 2'de `copyAsync` çağrısını spy'la; `FakeClock`'u 8 gün ileri al ve uygulamayı yeniden başlat.
  8. (integration, h: alan yetersiz) `copyAsync` mock'u `ENOSPC` fırlatsın; `run()`.
  9. (unit, i) `BACKUP_MIGRATORS[2]` var mı; `BACKUP_MIGRATORS[2](v1DataJson)` çıktısı Zod ile güncel şemayı geçiyor mu.
  10. (component) `MigrationFailedError` ile `MigrationFailedScreen` render et.
- **Beklenen sonuç**
  - Adım 1: `PRAGMA user_version = 2`; `schema_migrations` 2 satır (`'001_initial'`, `'002_add_workout_state'`), `checksum` dosya SHA-256'ları ile eşit; `hasColumn('workout_sessions','perceived_effort') = true`.
  - Adım 2: tüm fixture satırları korunur — her tablo için `COUNT(*)` eşit ve ortak kolonlarda `snapshotAfter` deep-equal `snapshotBefore`; `perceived_effort` her satırda `NULL`; `user_version = 2` (R92.4).
  - Adım 3: ikinci `run()` no-op: `schema_migrations` hâlâ 2 satır, hata yok; `m002.up` ikinci çağrıda `hasColumn` sayesinde `ALTER TABLE` çalıştırmaz ("duplicate column" hatası yok) (R92.3).
  - Adım 4: `MigrationFailedError` fırlatılır; `ROLLBACK` sonrası `user_version = 1`, `schema_migrations` 1 satır, `perceived_effort` kolonu **yok**; `snapshotAfter` deep-equal `snapshotBefore`; `v90.bak.v1.sqlite` geri kopyalanmış (`copyAsync(bak → v90.sqlite)` çağrılmış) (R92.6).
  - Adım 5: `DbIntegrityError`; migration çalışmaz; veri değişmez.
  - Adım 6: runner onarır: `user_version = 2` (MAX(`schema_migrations.version`)), log kaydı; veri değişmez.
  - Adım 7: `copyAsync('v90.sqlite' → 'v90.bak.v1.sqlite')` migration'dan **önce** çağrılmış (WAL checkpoint sonrası); 8 gün sonra yeniden başlatmada `deleteAsync('v90.bak.v1.sqlite')` çağrılmış (R92.5).
  - Adım 8: migration **başlamaz** (`user_version = 1`), kullanıcıya `"Alan yetersiz"` ekranı (03 §2); veri değişmez.
  - Adım 9: migrator mevcut; dönüşmüş JSON güncel `TableRegistry` şemalarını geçer (R95.8 paralellik).
  - Adım 10: ekranda `"Veritabanı güncellenemedi. Verilerin güvende; uygulamayı güncelleyip tekrar dene."`, butonlar `"Yedeği dışa aktar"` ve `"Tekrar dene"`; başka hiçbir ekran (Dashboard vb.) render edilmez.
- **Otomatik test kimlikleri:**
  - `core/db/migrations/MigrationRunner.test.ts::freshDatabaseReachesLatestVersion`
  - `core/db/migrations/MigrationRunner.test.ts::v001FixtureMigratesToLatestPreservingRows`
  - `core/db/migrations/MigrationRunner.test.ts::runningTwiceIsNoOp`
  - `core/db/migrations/MigrationRunner.test.ts::failingMigrationRollsBackAndRestoresBackup`
  - `core/db/migrations/MigrationRunner.test.ts::checksumMismatchRaisesDbIntegrityError`
  - `core/db/migrations/MigrationRunner.test.ts::repairsUserVersionFromSchemaMigrations`
  - `core/db/migrations/MigrationRunner.test.ts::createsBakBeforeMigrationAndCleansAfterSevenDays`
  - `core/db/migrations/MigrationRunner.test.ts::insufficientSpaceBlocksMigration`
  - `core/db/migrations/002_add_workout_state.test.ts::upIsIdempotent`
  - `core/backup/migrators/index.test.ts::everyDbMigrationHasBackupMigrator`
  - `features/bootstrap/MigrationFailedScreen.test.tsx::showsTurkishMessageAndExportButton`
- **Manuel doğrulama notu:** Yayın öncesi: bir önceki store sürümü gerçek cihaza kurulur, 1–2 hafta veri girilir, yeni build üzerine kurulur (upgrade); açılışta veri kaybı yok, `Ayarlar > Hakkında`'da şema sürümü güncel. Her yeni migration eklendiğinde bir önceki sürümün fixture'ı (`v00k.sql`) dondurulur.
- **Başarısızlık belirtileri:** Upgrade sonrası boş Dashboard; `duplicate column` hatası; `user_version` ile `schema_migrations` uyuşmazlığı; hata sonrası yarım şema (kolon var, `schema_migrations` yok); `.bak` alınmadan migration; `.bak` hiç temizlenmiyor; İngilizce hata ekranı; migrator eksikliği (lint kırmızı).

### AT-17 · Video kullanılamıyor → egzersiz sayfası çalışmaya devam ediyor
- **Gereksinimler:** R114.1, R114.2, R114.3, R114.4, R114.5, R115.1, R115.2, R115.3, R117.1, R117.4, R117.5
- **Bileşenler:** `data/exercise-videos.json` (`videoProvider`, `videoId`, `channelName`, `sourceUrl`, `lastVerifiedAt`, `fallbackUrl`), `VideoManifest`, `ExerciseVideo`, `VideoFallback`, `exercises.cues_json`, `VideoUnavailable`, `ErrorBoundary`, `NetInfo`, `scripts/verify-exercise-videos.ts`; egzersiz sayfası aksiyonları (`"Hareketi Değiştir"`, `SubstitutionEngine`, `SetLogService`).
- **Test seviyeleri:** unit / component / E2E(Maestro, Android) / manuel cihaz
- **Ön koşullar**
  - `react-native-youtube-iframe` mock'u: `onReady`/`onError` callback'leri testten tetiklenebilir; Jest fake timers.
  - `NetInfo` mock'u (`isConnected` kontrol edilebilir).
  - Katalog fixture: `'lat-pulldown'` (`cues_json = ["Göğsü yukarı tut", "Dirsekleri kalçaya çek"]`, manifest kaydı var), `'custom-row-1'` (`is_custom = 1`, manifest kaydı **yok**).
  - Script testi için `fetch` mock'u: `oembed` isteğine `videoId`'ye göre 200 / 404 döner.
- **Adımlar**
  1. (unit) `VideoManifest.load()` → her kaydı Zod ile doğrula; `VideoManifest.get('custom-row-1')`.
  2. (component) `ExerciseVideo exerciseId='lat-pulldown'` render et; `NetInfo.isConnected = true`; mock player'dan `onError('video_not_found')` tetikle.
  3. (component) Yeniden render; `onReady` **hiç** tetiklenmesin; fake timers ile 8 000 ms ilerlet.
  4. (component) `NetInfo.isConnected = false` ile render.
  5. (component) `exerciseId='custom-row-1'` (manifest kaydı yok) ile render.
  6. (component) Egzersiz sayfasının tamamını (`ExerciseVideo` + hareket kartı) adım 2 durumunda render et; `"Hareketi Değiştir"` butonuna bas; `"Seti Tamamla"` ile bir set logla; kök `ErrorBoundary.onError` spy'ını kontrol et.
  7. (unit, script) `verify-exercise-videos` ana fonksiyonunu manifest fixture'ı (3 kayıt; biri 404) ile çağır: varsayılan, `--json`, `--strict`.
  8. (unit, statik) Repo taraması: `youtube-dl`, `ytdl-core`, `.mp4` indirme veya `i.ytimg.com` dışında medya kaydetme importu yok (R114.5).
  9. (E2E) `e2e/at-17-video-fallback.yaml`: sarmalayıcı `adb shell svc wifi disable && svc data disable` → egzersiz sayfasını aç (`id: exercise.page.lat-pulldown`) → `id: exercise.videoFallback` bekle → `id: exercise.cues` içinde en az bir metin → `"Kaynağa git"` görünür → `"Hareketi Değiştir"` dokun → alternatif listesi görünür → geri → set logla.
- **Beklenen sonuç**
  - Adım 1: manifest tamamı şemayı geçer (`lastVerifiedAt` `YYYY-MM-DD`, `sourceUrl` `https://www.youtube.com/watch?v=<videoId>`); `get('custom-row-1') = undefined` (throw yok).
  - Adım 2: `VideoFallback` görünür: thumbnail `https://i.ytimg.com/vi/<videoId>/hqdefault.jpg`, `cues_json`'daki 2 ipucu metni, `"Kaynağa git"` (dokununca `Linking.openURL(sourceUrl)`); player unmount; `VideoUnavailable` yalnızca loglanır, fırlatılmaz (R114.3, R114.4).
  - Adım 3: 8 s sonunda aynı fallback (zaman aşımı yolu).
  - Adım 4: player **hiç mount edilmez**; doğrudan fallback (thumbnail yüklenemezse yer tutucu; ipuçları ve link yine görünür).
  - Adım 5: fallback yalnızca ipuçlarıyla (thumbnail ve `"Kaynağa git"` yok); crash yok.
  - Adım 6: `"Hareketi Değiştir"` alternatif listesini açar (`SubstitutionEngine` sonucu ≥ 1 aday); set `set_logs`'a yazılır; `ErrorBoundary.onError` **çağrılmaz** (R117.1).
  - Adım 7: rapor tablosunda 2 `OK`, 1 `BROKEN` (id + `sourceUrl`); varsayılan exit code `0`; `--json` çıktısı `{ ok: 2, broken: 1, items: [...] }`; `--strict` exit code `1` (R115.2, R115.3).
  - Adım 8: eşleşme yok.
  - Adım 9: tüm assert'ler geçer; uygulama çökmez, sayfa etkileşimli.
- **Otomatik test kimlikleri:**
  - `core/media/VideoManifest.test.ts::everyEntryMatchesSchema`
  - `core/media/VideoManifest.test.ts::missingEntryReturnsUndefined`
  - `features/exercise/ExerciseVideo.test.tsx::onErrorShowsFallbackWithCuesAndSourceLink`
  - `features/exercise/ExerciseVideo.test.tsx::readyTimeoutAfterEightSecondsShowsFallback`
  - `features/exercise/ExerciseVideo.test.tsx::offlineSkipsPlayerAndShowsFallback`
  - `features/exercise/ExerciseVideo.test.tsx::noManifestEntryShowsCuesOnly`
  - `features/exercise/ExercisePage.test.tsx::pageStaysInteractiveWhenVideoFails`
  - `scripts/__tests__/verify-exercise-videos.test.ts::reportsBrokenAndStrictExitCode`
  - `test/architecture/noVideoRehosting.test.ts`
  - `e2e/at-17-video-fallback.yaml`
- **Manuel doğrulama notu:** Gerçek cihazda (iOS + Android): manifest'te `videoId`'si bilerek kaldırılmış/gizli bir video içeren dev build ile egzersiz sayfasını aç; ayrıca uçak modunda aç. Her iki durumda fallback görünür, `"Kaynağa git"` tarayıcıyı açar, set loglama çalışır. `npm run verify:exercise-videos` CI'da haftalık çalışır; PR'da uyarı olarak görünür.
- **Başarısızlık belirtileri:** Boş/beyaz alan veya sonsuz spinner; `ErrorBoundary` ekranı `"Bir şeyler ters gitti."`; egzersiz sayfasında butonlar tepkisiz; fallback'te ipucu metni yok; `--strict` olmadan script build'i kırıyor; runtime'da YouTube arama isteği.

### AT-18 · Çevrimdışı → tüm core workout özellikleri çalışıyor
- **Gereksinimler:** R90.1, R90.2, R90.3, R90.4, R90.5, R90.6, R91.1, R91.3, R91.5, R91.8, R88.3, R88.5, R99.1, R100.4, R108.3, R109.1, R114.3, R117.1 (02 §2.2 offline garantisi)
- **Bileşenler:** `ActiveSessionService`, `SetLogService`, `RestTimerService`, `LocalNotificationScheduler`, `Scheduler`, `MissedWorkoutResolver`, `TrainingSequence`, `ProgressionEngine`, `PrDetector`, `SubstitutionEngine`, `IncrementResolver`, `AdherenceCalculator`, `MealLogService`, `CopyService`, `MeasurementService`, `BackupExporter`, `ExerciseVideo` (fallback), `NetInfo` (yalnızca video); tablolar `workout_sessions`, `session_exercises`, `set_logs`, `rest_timers`, `scheduled_workouts`, `recommendations`, `personal_records`, `meal_logs`.
- **Test seviyeleri:** unit (statik mimari testi) / integration(DB) / E2E(Maestro, Android) / manuel cihaz (iOS)
- **Ön koşullar**
  - Statik test için izinli ağ kullanım listesi: `src/features/**/ExerciseVideo*`, `src/features/**/VideoFallback*` (thumbnail), `scripts/verify-exercise-videos.ts`. Diğer tüm `src/domain/**`, `src/core/**`, `src/features/**` dosyaları ağ API'si import etmez.
  - Integration: `global.fetch`, `XMLHttpRequest`, `WebSocket` → çağrılınca `throw new Error('NETWORK_USED')`; `NetInfo` mock `isConnected = false`; `expo-notifications` mock (yalnızca yerel planlama).
  - Fixture: aktif program (`training_sequence_index = 4`), bugün için `planned` bir `scheduled_workouts`, dünden kalan **kaçırılmış** (planned, `planned_date_key` = dün) bir plan senaryosu için ikinci fixture; `FakeClock` `2026-10-06T15:00:00Z` `'Europe/Istanbul'`.
  - E2E: Android emülatör, sarmalayıcı `adb shell svc wifi disable; svc data disable` (bitişte geri açar).
- **Adımlar**
  1. (unit, statik) `test/architecture/noNetworkInCore.test.ts`: `src/**` dosyalarını tara; `@react-native-community/netinfo`, `fetch(`, `XMLHttpRequest`, `WebSocket`, `axios`, `expo-notifications`'ın `getExpoPushTokenAsync` kullanımını izinli liste dışında ara.
  2. (integration) Ağ mock'ları aktifken uçtan uca komut dizisi: `Scheduler.ensurePlanned(today)` → `MissedWorkoutResolver.detect()` (ikinci fixture'da kart üretir; **"Bugüne taşı"** uygula) → `ActiveSessionService.start(scheduledWorkoutId)` → `SetLogService.completeSet` × 3 (`load_kg 80, reps 12, rir 2`) → `RestTimerService.start(120)` → `RestTimerService.skip()` → `substituteExercise` (`SubstitutionEngine.alternatives` ilk aday) → `ActiveSessionService.finish({ reason: 'finishHereToday' })` → `partial_decision = 'countAsDone'` → `ProgressionEngine.recommend(exerciseId)` → `AdherenceCalculator.week(weekStartKey)` → `MealLogService.log` + `CopyService.copyDay` → `MeasurementService.record` → `BackupExporter.export()`.
  3. (integration) `LocalNotificationScheduler.schedule` spy: çağrıldığını ve push token API'sinin çağrılmadığını doğrula.
  4. (E2E) `e2e/at-18-offline-workout.yaml`: uçak modu → uygulamayı aç → Dashboard'da `"Day 30 / 90"` (fixture'a göre) → `id: dashboard.startWorkout` → aktif antrenman ekranı `id: workout.exercise.0` → `"Seti Tamamla"` × 3 → `id: workout.restTimer` sayacın azaldığını iki okumayla doğrula (`assertVisible` regex `1:5[0-9]` sonra `1:4[0-9]`) → `"Hareketi Değiştir"` → alternatif listesi ≥ 1 → seç → `id: workout.finish` → `"Bugün burada bitir"` → `"Bitmiş say"` → Dashboard'da sıradaki antrenmanın bir sonrakine geçtiğini doğrula → egzersiz sayfasında video `id: exercise.videoFallback` → uygulamayı kapat/aç (`stopApp`/`launchApp`) → Dashboard yükleniyor, hata yok → uçak modunu kapat.
  5. (E2E, kaçırılan antrenman) İkinci fixture ile: uçak modunda aç → `"Kaçırılan antrenman: Day 5 – V-Taper Upper (Perşembe)"` kartı → `"Bugüne taşı"` → antrenman başlatılabilir.
- **Beklenen sonuç**
  - Adım 1: izinli liste dışında **0** eşleşme.
  - Adım 2: hiçbir adım `NETWORK_USED` fırlatmaz; DB'de: `workout_sessions` 1 satır `status = 'partial'`, `ended_reason = 'finishHereToday'`; `set_logs` 3 satır, her biri ayrı `command_id`; `rest_timers` 1 satır `state = 'skipped'`; `session_exercises.original_exercise_id` dolu; `scheduled_workouts.status = 'partiallyCompleted'`, `partial_decision = 'countAsDone'`; `sequence_events` 1 satır `cause = 'partialCountedDone'`, `programs.training_sequence_index = 5`; `recommendations` ≥ 1 satır (`rationale_tr` boş değil, `evidence_json.setLogIds` 3 id); `AdherenceCalculator.week` → `{ partial: 1, … }`; `meal_logs` 2 satır (`copied_from_id` dolu); `body_measurements` 1 satır; ZIP dosyası üretildi.
  - Adım 3: `schedule` 1 kez çağrılmış (`Dinlenme bitti – sıradaki set`), `skip` sonrası `cancelNotification` çağrılmış; push token API **hiç** çağrılmamış.
  - Adım 4: tüm assert'ler geçer; hiçbir ekranda ağ hatası/spinner; video fallback görünür; yeniden açılışta Dashboard < 3 s.
  - Adım 5: kart görünür; sessiz atlama yok (`training_sequence_index` değişmedi).
- **Otomatik test kimlikleri:**
  - `test/architecture/noNetworkInCore.test.ts::onlyVideoComponentsMayTouchNetwork`
  - `domain/workout/OfflineWorkoutFlow.test.ts::fullWorkoutFlowRunsWithNetworkDisabled`
  - `domain/workout/OfflineWorkoutFlow.test.ts::missedWorkoutResolutionWorksOffline`
  - `core/notifications/LocalNotificationScheduler.test.ts::usesOnlyLocalNotifications`
  - `core/backup/BackupExporter.test.ts::exportWorksOffline`
  - `e2e/at-18-offline-workout.yaml`
- **Manuel doğrulama notu:** iOS gerçek cihaz (uçak modu Maestro ile açılamaz): uçak modunu aç → tam bir antrenman (başlat, 3 set, rest timer, hareket değiştir, bitir), öğün kopyala, ölçüm gir, yedek dışa aktar (Dosyalar'a) → uygulamayı öldür ve aç. Hepsi çalışmalı; yalnızca video fallback'e düşmeli.
- **Başarısızlık belirtileri:** Herhangi bir ekranda "bağlantı yok" engeli; sonsuz yükleme; `fetch` istisnası yüzünden `ErrorBoundary`; push token izni istemi; rest timer bildirimi planlanmıyor; yedek dışa aktarımı ağ istiyor; statik testte `domain/` içinde `NetInfo` importu.

### AT-19 · Biyometri açıkken app lock çalışıyor
- **Gereksinimler:** R94.1, R94.2, R94.3, R94.4, R94.5, R94.6, R116.5, R93.6 (dolaylı), R117.1
- **Bileşenler:** `AppLockService` (`enabled`, `graceSeconds`, `lastUnlockedAtUtc`), `LockScreen`, `PrivacyShield`, `PrivacyOverlay`, `AppBootstrap`, `settings` (`'appLock.enabled'`, `'appLock.graceSeconds'`, `'privacy.androidFlagSecure'`), `settings_history`, `expo-local-authentication` (`hasHardwareAsync`, `isEnrolledAsync`, `authenticateAsync`), `expo-screen-capture` (`preventScreenCaptureAsync`), `PhotosScreen`, `LabsScreen`, `Clock`/`FakeClock`.
- **Test seviyeleri:** unit / integration(DB) / component / E2E(Maestro, simülatör) / manuel cihaz
- **Ön koşullar**
  - `expo-local-authentication` mock'u: `hasHardwareAsync`, `isEnrolledAsync`, `authenticateAsync` sonucu testten ayarlanabilir; `AppState` olayları testten yayılabilir.
  - `FakeClock`: `2026-10-06T07:00:00Z`.
  - DB'de `settings` satırları: `'appLock.enabled' = false` (varsayılan), `'appLock.graceSeconds' = 30`.
  - E2E iOS simülatör: Face ID kayıtlı (`xcrun simctl spawn booted notifyutil -s com.apple.BiometricKit.enrollmentChanged 1 -p com.apple.BiometricKit.enrollmentChanged`); eşleşme/eşleşmeme `…BiometricKit_Sim.pearl.match` / `…pearl.nomatch`. Android emülatör: parmak izi kayıtlı, `adb -e emu finger touch 1`. Komutlar `e2e/run-at-19.sh` sarmalayıcısından verilir.
- **Adımlar**
  1. (unit) `hasHardwareAsync = false` iken `AppLockService.enable()` çağır; sonra `hasHardwareAsync = true, isEnrolledAsync = false` ile tekrar.
  2. (integration) `hasHardware = true, isEnrolled = true` → `enable()`; `settings` ve `settings_history` oku.
  3. (unit) Soğuk açılış: `AppLockService.onBootstrap()` → `shouldLock()`.
  4. (unit) `authenticateAsync` mock'u `{ success: false, error: 'user_cancel' }` → `unlock()`; ardından `{ success: true }` → `unlock()`.
  5. (unit, grace) `lastUnlockedAtUtc = now`; `AppState → background`; `FakeClock +10 s`; `AppState → active` → `shouldLock()`. Sonra `+45 s` → `shouldLock()`. `graceSeconds = 0` ile `+1 s`. `graceSeconds = 300` ile `+200 s`.
  6. (unit) `enabled = false` iken tüm geçişlerde `shouldLock()`.
  7. (component) `LockScreen` render (kilitli durum): alt ağaçta `dashboard.*` testID'leri ara; `authenticateAsync` çağrı argümanlarını yakala.
  8. (component) `PrivacyShield`: `AppState → inactive` → `PrivacyOverlay` var mı; `→ active` → kalkıyor mu. Kilit açık ve grace içinde olsa bile overlay davranışı.
  9. (component) `PhotosScreen` ve `LabsScreen` mount: `Platform.OS = 'android'` iken `preventScreenCaptureAsync` çağrısı; `Platform.OS = 'ios'` iken çağrı yok ve ayar metni.
  10. (E2E) `e2e/at-19-app-lock.yaml`: Ayarlar > Güvenlik → `id: settings.appLock.toggle` aç → sistem biyometri istemi (simülatör match) → uygulamayı arka plana al (`stopApp` değil; Maestro `pressKey Home`, sonra `launchApp` — 30 s grace'i aşmak için sarmalayıcı `sleep 35`) → `id: lockScreen` görünür, `id: dashboard.challengeDay` **görünmez** → sarmalayıcı `nomatch` → `"V90 kilidini aç"` istemi tekrar görünür → `match` → Dashboard görünür → arka plana al + 5 s içinde geri dön → kilit ekranı **yok**.
- **Beklenen sonuç**
  - Adım 1: `enable()` `false` döner; ayar UI'da gri ve açıklama; `settings` değişmez.
  - Adım 2: `settings('appLock.enabled') = true` (`value_json = 'true'`), `settings_history` 1 satır (`old_value_json = 'false'`, `new_value_json = 'true'`).
  - Adım 3: `shouldLock() = true` (soğuk açılışta `lastUnlockedAtUtc` bellek olduğundan her zaman kilit).
  - Adım 4: ilk `unlock()` → `false`, durum kilitli kalır, `LockScreen` yeniden dene sunar; ikinci → `true`, `lastUnlockedAtUtc = now`.
  - Adım 5: `10 s → false`; `45 s → true`; `grace 0, 1 s → true`; `grace 300, 200 s → false` (R94.2).
  - Adım 6: her durumda `false`; `authenticateAsync` hiç çağrılmaz.
  - Adım 7: alt ağaçta içerik **yok** (yalnızca kilit ekranı); `authenticateAsync({ promptMessage: 'V90 kilidini aç', disableDeviceFallback: false, … })` (R94.3 cihaz parolası fallback'i).
  - Adım 8: `inactive`/`background` → `PrivacyOverlay` render (opak logo perdesi); `active` → kaldırılır; app lock kapalıyken de overlay çalışır (R94.5 bağımsızdır).
  - Adım 9: Android'de `preventScreenCaptureAsync` çağrılır; iOS'ta çağrılmaz ve ekran görüntüsü engeli **vaat edilmez** (ayar metninde "iOS'ta desteklenmez") (R94.6, R116.5).
  - Adım 10: tüm assert'ler geçer.
- **Otomatik test kimlikleri:**
  - `core/security/AppLockService.test.ts::enableRequiresHardwareAndEnrollment`
  - `core/security/AppLockService.test.ts::persistsSettingAndHistory`
  - `core/security/AppLockService.test.ts::locksOnColdStart`
  - `core/security/AppLockService.test.ts::failedAuthKeepsLocked`
  - `core/security/AppLockService.test.ts::graceWindowControlsRelock`
  - `core/security/AppLockService.test.ts::disabledNeverPrompts`
  - `features/security/LockScreen.test.tsx::rendersNoContentBeneathAndCallsAuthenticateWithPrompt`
  - `core/security/PrivacyShield.test.tsx::showsOverlayOnInactiveAndBackground`
  - `features/photos/PhotosScreen.test.tsx::androidOnlyScreenCaptureGuard`
  - `features/labs/LabsScreen.test.tsx::androidOnlyScreenCaptureGuard`
  - `e2e/at-19-app-lock.yaml`
- **Manuel doğrulama notu:** **Gerçek cihaz zorunlu** (iPhone Face ID + Android parmak izi): (1) kilidi aç, uygulamayı arka plana al, app switcher'da önizlemenin perde/logo olduğunu (Progress Photos açıkken fotoğrafın **görünmediğini**) doğrula; (2) 30 s sonra dönüşte biyometri istemi, yüz/parmak reddinde cihaz parolası fallback'i; (3) telefonu yeniden başlat → açılışta kilit; (4) Android'de Photos ekranında ekran görüntüsü engellenir (siyah), iOS'ta engel beklenmez.
- **Başarısızlık belirtileri:** Kilit ekranının altında Dashboard içeriği kısa süre görünüyor (flash); grace içinde gereksiz istem veya grace dışında istem yok; biyometri reddine rağmen açılıyor; app switcher'da fotoğraf görünüyor; donanım yokken toggle açılabiliyor; iOS'ta "ekran görüntüsü engellenir" vaadi; soğuk açılışta kilit yok.

### AT-20 · Day 90 raporu doğru başlangıç/final değerlerini kullanıyor
- **Gereksinimler:** R96.3, R96.4, R96.5, R119.1, R119.3, R123.1, R123.2, R123.3, R123.4, R88.1, R88.2, R89.5, R89.6, R89.8, R97.4, R97.5, R103.4, R107.1, R113.3
- **Bileşenler:** `ChallengeCalendar`, `BaselineResolver`, `TrendCalculator`, `AdherenceCalculator`, `VolumeAnalytics`, `PrDetector`; tablolar `programs` (`start_date_key`, `calendar_mode`, `duration_days`, `status`, `completed_at_utc`), `program_pauses` (`start_date_key`, `end_date_key`), `body_measurements` (`site`, `final_value_cm`, `is_baseline`, `local_date_key`), `weight_logs`, `personal_records` (`estimated_1rm`), `workout_sessions`, `scheduled_workouts`; Day 90 rapor ekranı (02'de ayrı bileşen tanımlı değil, bkz. açık nokta).
- **Test seviyeleri:** unit / integration(DB) / component
- **Ön koşullar**
  - `programs`: `start_date_key = '2026-09-07'`, `start_time_zone = 'Europe/Istanbul'`, `duration_days = 90`, `calendar_mode = 'strictCalendar'`, `status = 'active'`.
  - `program_pauses` 1 satır: `start_date_key = '2026-10-01'`, `end_date_key = '2026-10-06'`, `reason = 'travel'` → `pausedDays = 5` (1–5 Ekim; devam günü hariç).
  - `weight_logs` (günlük): 7–13 Eylül `107.0, 107.4, 106.8, 107.2, 106.9, 107.1, 106.6`; 29 Kasım–5 Aralık `98.4, 98.9, 98.2, 98.6, 98.8, 98.5, 98.1`; arada haftada ~3 kayıt (doğrusal azalan).
  - `body_measurements`:
    | site | local_date_key | final_value_cm | is_baseline | not |
    |------|----------------|----------------|-------------|-----|
    | waist | 2026-08-20 | 97.0 | 0 | ±7 gün penceresi **dışı** (çeldirici) |
    | waist | 2026-09-07 | 95.0 | 1 | baseline (R119.1) |
    | shoulder | 2026-09-07 | 137.0 | 1 | |
    | abdomen | 2026-09-07 | 114.0 | 1 | |
    | waist | 2026-10-19 | 91.0 | 0 | ara |
    | waist | 2026-12-04 | 86.0 | 0 | final |
    | shoulder | 2026-12-04 | 139.0 | 0 | final |
    | abdomen | 2026-12-04 | 104.0 | 0 | final |
    | waist | 2026-12-07 | 85.0 | 0 | Day 90 **sonrası** (çeldirici) |
  - Biceps: **Varyant A** hiç kayıt yok; **Varyant B** `bicepsFlexed 38.0 @ 2026-09-08` (pencere içi) ve `bicepsFlexed 40.0 @ 2026-12-04`.
  - `personal_records`: 1 `estimatedPerformancePr` (`estimated_1rm = 132.5`), 1 `loadPr`.
  - `scheduled_workouts` özet: `completed 34`, `partiallyCompleted 3`, `skipped 2`, türetilmiş `missed 1`.
  - `FakeClock`: `2026-12-05T07:00:00Z`, `'Europe/Istanbul'` (`todayKey = '2026-12-05'`).
- **Adımlar**
  1. (unit) `ChallengeCalendar.challengeDay(clock)` ve `ChallengeCalendar.dayKeyFor(90)` — `strictCalendar`.
  2. (unit) `calendar_mode = 'activeDays'` ile aynı hesaplar.
  3. (unit) `BaselineResolver` ile `waist`, `shoulder`, `abdomen` baseline'ları; final = `local_date_key ≤ dayKeyFor(90)` olan **son** kayıt (bu testte sabitlenen kural; bkz. açık nokta).
  4. (unit) `TrendCalculator` ile kilo baseline (ilk 7 günün ortalaması) ve final (son 7 günün hareketli ortalaması), 28 günlük eğim.
  5. (unit) `BaselineResolver.biceps()` — Varyant A ve B.
  6. (unit) Bel/omuz oranı başlangıç ve final (AT-11 tanımı).
  7. (unit) `AdherenceCalculator` 90 günlük toplamlar; `VolumeAnalytics.weekly` son hafta.
  8. (component) Day 90 rapor ekranını yukarıdaki verilerle render et; metin taraması: `"kas kazandın"`, `"kesin"`, `"%"` ile biten recovery iddiaları; `"tahmin"` rozetleri; `"0 cm"`.
  9. (integration) `FakeClock.set('2026-12-06T07:00:00Z')` → uygulama açılışı; `programs.status`/`completed_at_utc` oku (program tamamlanma geçişi; bkz. açık nokta).
- **Beklenen sonuç**
  - Adım 1: `challengeDay = 90`; Day 90 tarihi `'2026-12-05'`; 6 Aralık'ta hâlâ `90` (clamp) (R88.1, R89.5-A).
  - Adım 2: `challengeDay = 85` (90 − 5 dondurma günü); Day 90 tarihi `'2026-12-10'`; `program_pauses` kayıtlarından türetilir, ayrı sayaç yok (R89.5-B, R89.8).
  - Adım 3: waist `95.0 → 86.0` (Δ `−9.0 cm`); shoulder `137.0 → 139.0` (Δ `+2.0 cm`); abdomen `114.0 → 104.0` (Δ `−10.0 cm`). `97.0` (pencere dışı) **baseline değil**; `85.0` (7 Aralık) **final değil**.
  - Adım 4: baseline `107.0 kg` (7 günlük ort.), final `98.5 kg` (7 günlük ort.; tekil son tartı `98.1` **değil**), Δ `−8.5 kg`; eğim `"−x.x kg/hafta"` biçiminde (R123.2, R123.3).
  - Adım 5: Varyant A → `null`; raporda kol satırı `"Başlangıç kol ölçümünü ekle."` (veya `"—"`), `"0 cm"` **yok**, kol KPI'sı `disabled` (R96.3–R96.5). Varyant B → `38.0 → 40.0`, Δ `+2.0 cm`.
  - Adım 6: `137.0 / 95.0 = 1.4421…` → `"1.44"`; `139.0 / 86.0 = 1.6162…` → `"1.62"`; Δ `"+0.18"`.
  - Adım 7: `{ completed: 34, partial: 3, skipped: 2, missed: 1 }` dört ayrı etiketle (kısmi `completed`'a dahil **değil**, R103.4); `weekly` direkt set sayıları `COUNT(DISTINCT set_index)` ile.
  - Adım 8: `"kas kazandın"`/`"kesin"` **yok**; `estimated_1rm 132.5` ve `secondarySetsEstimate` `"tahmin"` rozetiyle; ölçüm/kilo değerleri rozetsiz; `"0 cm"` yok (R123.1, R123.4).
  - Adım 9: Day 90 geçildikten sonra `programs.status = 'completed'`, `completed_at_utc` dolu, `ux_programs_one_open` kısıtı yeni program açmaya izin verir.
- **Otomatik test kimlikleri:**
  - `domain/program/ChallengeCalendar.test.ts::day90DateStrictCalendar`
  - `domain/program/ChallengeCalendar.test.ts::day90DateActiveDaysExcludesPausedDays`
  - `domain/program/ChallengeCalendar.test.ts::challengeDayClampsAt90`
  - `domain/measurements/BaselineResolver.test.ts::baselineIgnoresRecordsOutsideWindow`
  - `domain/measurements/BaselineResolver.test.ts::finalIsLastRecordOnOrBeforeDay90`
  - `domain/analytics/TrendCalculator.test.ts::weightBaselineAndFinalAreSevenDayAverages`
  - `domain/analytics/TrendCalculator.test.ts::slopeIsExpressedPerWeek`
  - `domain/analytics/AdherenceCalculator.test.ts::ninetyDayTotalsKeepPartialSeparate`
  - `features/report/Day90Report.test.tsx::noFakePrecisionCopyAndEstimateBadges`
  - `features/report/Day90Report.test.tsx::showsBicepsCtaInsteadOfZero`
  - `domain/program/ProgramCompletion.test.ts::marksProgramCompletedAfterDay90`
- **Manuel doğrulama notu:** Gerekmez; ancak yayın öncesi bir cihazda `FakeClock` yerine cihaz tarihini Day 90'a alarak raporun açıldığı ve değerlerin Progress ekranındaki son kayıtlarla birebir eşleştiği gözle doğrulanır.
- **Başarısızlık belirtileri:** Baseline olarak en eski kayıt (`97.0`) veya `is_baseline` ihmal; final olarak Day 90 sonrası kayıt (`85.0`); kilo için tekil tartı (`98.1`); biceps `0 cm`; `activeDays` modunda Day 90 tarihi kaymıyor; `"Bugün X gram kas kazandın"` benzeri metin; e1RM rozetsiz; kısmi antrenmanlar `completed`'a sayılıyor; Day 90 sonrası `status` `active` kalıyor.

### Tutarsızlık / açık nokta
- **AT-11 – oran tanımı (ÇÖZÜLDÜ; `shoulder ÷ waist`, ±3 gün eşleşme — 02 §9.7, `04` §9.3):** 02 §17 §97'yi AT-11'e eşler ama 02/03'te bel/omuz oranı için bileşen, formül yönü (omuz ÷ bel mi, bel ÷ omuz mu), eşleştirme kuralı (aynı gün mü, her sitenin son değeri mi) ve UI adı tanımlı değil. Bu belge `shoulder.final_value_cm / waist.final_value_cm`, her sitenin son değeri, 2 ondalık varsayımını kullanır; 02 §9.7 veya §11'e eklenmesi gerekir.
- **AT-11 – eşik tabanı (ÇÖZÜLDÜ; 02 §11.1: iki örneğin ortalamasının %1.5'i):** 02 §11.1'deki `> max(0.8 cm, %1.5)` ifadesinde yüzdenin neye göre alındığı (ilk örnek, ortalama) belirsiz; testler ilk örneği taban alır.
- **AT-12/AT-20 – baseline kaynağı (ÇÖZÜLDÜ; 02 §11.2: `is_baseline` öncelikli, sonra ±7 gün ilk kayıt; onboarding yazar):** 02 §11.2 `BaselineResolver` = "program başlangıcına en yakın (±7 gün) **ilk** kayıt" (en yakın mı, ilk mi belirsiz) derken 03 `body_measurements.is_baseline` bayrağı tanımlar; bayrağı kimin ne zaman set ettiği ve iki kaynak çeliştiğinde hangisinin kazandığı yazılı değil.
- **AT-12 – pencere dışı ilk ölçüm UX'i:** Kullanıcı ilk biceps ölçümünü başlangıçtan 8+ gün sonra girerse 02 §11.2'ye göre baseline `null` kalır ve CTA sürekli görünür; kabul edilebilir mi, yoksa "ilk kayıt = baseline (geç)" kuralı mı gerekir, tanımlı değil.
- **AT-12 – alan adı eşlemesi:** R96.2 `leftBicepsCm`/`rightBicepsCm`/`bicepsCm` derken 02/03 `bicepsLeftFlexed`/`bicepsRightFlexed`/`bicepsFlexed` site enum'ları kullanır; eşleme belgelenmeli.
- **AT-13 – `Timestamped.utcOffsetMinutes` (ÇÖZÜLDÜ):** 03 §3'te de opsiyonel yapıldı; yalnızca `workout_sessions` saklar.
- **AT-13 – `set_logs.local_date_key` anlamı (ÇÖZÜLDÜ):** taslak turunda 02 §5.1'in genel kuralı ile R113.1 çelişiyordu. Karar: oturuma bağlı kayıtlar (`set_logs`, `rest_timers`, `personal_records`) günü oturumun `calendar_date_key`'inden alır; 02 §5.1'e istisna olarak eklendi. Bu testin 7. adımı bu kuralı kilitler. Eski (çözülmemiş) not: (özellikle `calendar_date_overridden = 1` durumunda) belirtilmemiş.
- **AT-14 – `command_log` yedekte yok (ÇÖZÜLDÜ):** bilinçli; 02 §12.3'e `schema_migrations` ve `command_log`'un kapsam dışı olduğu ve nedeni yazıldı.
- **AT-14/15 – migrator adı:** 03 §2'deki `BACKUP_MIGRATORS` kanoniktir; 02 §12.3'teki `backupMigrators[v]` aynı nesnenin gevşek yazımıdır.
- **AT-16 – fixture yolu (ÇÖZÜLDÜ):** 02 §12.1 `test/fixtures/db/v001.sql` olarak güncellendi; 03 ile aynı.
- **AT-16 – `.bak` dosya adı (ÇÖZÜLDÜ):** 02 §12.1 `v90.bak.v<from>.sqlite` olarak güncellendi; 03 ile aynı.
- **AT-16 – `Migration` arayüzü (ÇÖZÜLDÜ):** 02 §12.1'den `checksum` alanı kaldırıldı; checksum dosya içeriğinden hesaplanıp `schema_migrations`'a yazılır.
- **AT-16 – alan yetersizliği davranışı (ÇÖZÜLDÜ):** 02 §12.1 "migration başlamaz + 'Alan yetersiz' ekranı" olarak güncellendi; 03 ile aynı.
- **AT-16 – hata sonrası "Yedeği dışa aktar":** `BackupExporter` güncel `TableRegistry` şemasını beklediğinden eski şemalı DB'den export'un nasıl yapılacağı (ham dosya paylaşımı mı, eski registry mi) tanımlı değil.
- **AT-17 – çevrimdışı thumbnail (ÇÖZÜLDÜ; 02 §14: ilk yüklemede önbellek, yoksa yerel ikon; `cues[]` her zaman çalışır):** R114.4 thumbnail'ın "çalışmaya devam etmesini" isterken 02 §14 thumbnail'ı `i.ytimg.com`'dan canlı çeker; önbellekleme/paketleme stratejisi yok, çevrimdışı thumbnail görünmez.
- **AT-19 – Android FLAG_SECURE tetikleyicisi (ÇÖZÜLDÜ; 02 §13.1 artık `settings['privacy.androidFlagSecure']` koşuluna bağlı):** 02 §13.1 `PhotosScreen`/`LabsScreen`'in Android'de `preventScreenCaptureAsync()` çağırdığını koşulsuz anlatır; 03 `settings` yorumunda `'privacy.androidFlagSecure'` anahtarı vardır (R116.5 "opsiyonel privacy mode"). Ayarın bu çağrıyı kapılayıp kapılamadığı netleştirilmeli.
- **AT-20 – Day 90 raporu bileşeni (ÇÖZÜLDÜ; `ChallengeReportService` 02 §3'e ve kurallar `04` §9.4'e eklendi):** 02 modül haritasında ve §17'de rapor için servis/ekran tanımlı değil; "final değer" kuralı (Day 90 tarihine kadar son kayıt mı, rapor açıldığı andaki son kayıt mı), kilo baseline'ının tanımı (tekil ilk tartı mı, ilk 7 gün ortalaması mı) ve `programs.status → 'completed'` / `completed_at_utc` geçişini kimin tetiklediği yazılı değil. Bu belge: final = `local_date_key ≤ dayKeyFor(90)` son kayıt; kilo baseline/final = 7 günlük ortalama; tamamlanma geçişi `ChallengeCalendar` gün değişiminde.
