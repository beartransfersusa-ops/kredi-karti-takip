# V90 – UX Akışları ve Ekran Durumları

> Ekranların amacı, durumları (boş / yükleniyor / hata / normal), akışları, Türkçe metinleri ve her adımın hangi servisi çağırıp hangi tabloya yazdığı. `02-architecture.md` ve `04-domain-engines.md` ile birlikte okunur; UI metinleri `01-specification.md`'deki ifadelerle birebir aynıdır (örn. "Devam eden antrenmanın var.", "Bugün burada bitir", "Başlangıç kol ölçümünü ekle.").
>
> Tüm hata durumları Türkçe ve aksiyon odaklıdır; hiçbir akış beyaz ekranla sonuçlanmaz (R117.1).

---

## A. Antrenman akışları

> **Kapsam:** §88–§91, §99–§104, §107, §108, §113, §121–§123 gereksinimlerinin ekran ve akış düzeyindeki karşılığı. Tablo/kolon adları `03-data-model.md`, servis/komut/tip adları `02-architecture.md` ile birebir aynıdır. Metin tablolarındaki **Kaynak** sütunu metnin 01/02'de geçtiği yeri gösterir; 01/02'de bulunmayan metinler **(öneri)** olarak işaretlenmiştir ve ürün onayı gerektirir. Anahtarlar i18n sözlüğüne (`shared/i18n/tr.ts`) aynen taşınır.

### A.0 Ortak kurallar (tüm antrenman ekranları)

| Kural | Uygulama |
|---|---|
| Tek doğruluk kaynağı DB | Her buton bir **komut**tur; `db.withTransaction(async tx => …)` içinde yazılır, aynı transaction'da `command_log(command_id, command_type, executed_at_utc)` satırı eklenir; aynı `command_id` ile tekrar gelen komut no-op'tur. `useActiveWorkoutStore` yalnızca `hydrate()` ile dolar, optimistic update yoktur (R90.7, R117). |
| Durum modeli | Her ekran dört durumu tanımlar: **boş** (gösterilecek veri yok), **yükleniyor** (ilk `hydrate`), **hata**, **normal** (alt durumlarıyla). SQLite yerel olduğu için yükleniyor tipik olarak < 100 ms sürer; skeleton yalnızca ilk açılışta gösterilir, kullanıcı eylemleri asla spinner ile bloklanmaz. |
| Hata görünümü | `DbWriteError` → satır içi hata çubuğu **"Kaydedilemedi. Boş alanı kontrol et."** + **Yeniden dene** (aynı `command_id`). Render hatası → ekran düzeyi `ErrorBoundary`: **"Bir şeyler ters gitti."** + **Yeniden yükle** / **Ana ekrana dön**. Teknik detay **Ayrıntılar** altında (R117.1–R117.5). |
| Zaman | "Bugün", "kalan süre", "Day X" hesapları `Clock` (`nowUtc()`, `todayKey()`, `timeZone()`) ve saklanan zaman damgalarından türetilir; bellekte sayaç tutulmaz (R91.3, R112.1–R112.3). |
| Gün geçişi | `DayRolloverObserver` `DAY_CHANGED` yayınladığında Ana ekran, aktif antrenman ekranı (rest timer hariç) ve program takvimi yeniden hesaplar (R112.5). `TZ_CHANGED`'de kayıtlar dokunulmaz; yalnızca `challengeDay` yeni tz ile hesaplanır (R112.4). |
| Sessiz ilerleme yok | `programs.training_sequence_index` yalnızca `advanceSequence()` ile ve yalnızca `sequence_events.cause ∈ {'completed','skipped','partialCountedDone'}` nedenleriyle artar. Bu bölümdeki hiçbir ekran başka yoldan sırayı ilerletmez (R88.6, R89.7). |
| Metin tonu | Kesin/bilimsel olmayan iddialar yok; tahmin olan her değer (`is_estimate=1`, `estimated_1rm`) **"tahmin"** rozetiyle gösterilir (R123.1, R123.4). |

Rota haritası (expo-router; `features/` klasörleri 02 §3):

| Ekran | Rota | Feature |
|---|---|---|
| Ana ekran | `app/(tabs)/index.tsx` | `features/program/` |
| Aktif antrenman | `app/workout/active.tsx` | `features/active-workout/` |
| Hareketi Değiştir (alt sayfa) | `app/workout/substitute.tsx` (modal) | `features/active-workout/` |
| Bitirme ekranı | `app/workout/finish.tsx` | `features/active-workout/` |
| Plateau insight | `app/insights/plateau/[id].tsx` | `features/progress/` |
| Program Settings | `app/program/settings.tsx` | `features/settings/` |
| Reschedule tarih seçici | `app/program/reschedule.tsx` (modal) | `features/program/` |

---

### A.1 Ana ekran (Dashboard)

**Amaç:** Kullanıcıya iki bağımsız state'i aynı anda ve karıştırmadan göstermek: takvim (`Day X / 90`, `ChallengeCalendar.challengeDay(clock)`) ve antrenman sırası (`programs.training_sequence_index` → sıradaki `workout_templates` satırı). Ekranın tek bir **birincil kart alanı** vardır; hangi kartın gösterileceği aşağıdaki öncelik sırasıyla belirlenir, iki kart aynı anda birincil alanda yer almaz (R88.1, R88.3, R90.4).

**Kart önceliği (yüksekten düşüğe):**

1. **Devam eden antrenman kartı** — `ActiveSessionService.findActive()` bir `workout_sessions(status='active')` satırı döndürüyorsa (R90.4). Bkz. A.5.
2. **Program dondurulmuş bandı** — `programs.status='paused'` (R89.3). Bkz. A.9.
3. **Kaçırılan antrenman kartı** — `MissedWorkoutResolver.detect()` boş değilse (R88.3). Bkz. A.2.
4. **Sıradaki antrenman kartı** — `scheduled_workouts(status='planned')` açık plan (normal durum).

`ux_sched_one_open` unique index'i sayesinde aynı anda en fazla bir `planned`/`inProgress` plan vardır; dolayısıyla en fazla bir kaçırılan kart olabilir.

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | `programs` içinde `status IN ('active','paused')` satırı yok | Day sayacı gizli; "Programı başlat" CTA'sı (Bölüm I onboarding akışına gider). Antrenman kartı yok. |
| Yükleniyor | İlk `hydrate` (bootstrap sonrası) | Day sayacı ve kart alanı skeleton; hiçbir buton render edilmez. |
| Hata | Repository okuma hatası / render hatası | Ekran düzeyi `ErrorBoundary`: "Bir şeyler ters gitti." + Yeniden yükle. (`DbOpenError` daha önce `AppBootstrap`'ta yakalanır; bu ekrana ulaşmaz.) |
| Normal · devam eden | Öncelik 1 | Bkz. A.5. Sıradaki antrenman kartı gizlenir (aynı plan `inProgress`). |
| Normal · dondurulmuş | Öncelik 2 | "Program dondurulmuş" bandı + sebep + gün sayısı; antrenman kartları gizli; kaçırılan uyarısı üretilmez (R89.3). Beslenme/ölçüm girişleri açık. |
| Normal · kaçırılan | Öncelik 3 | Bkz. A.2. Karar verilmeden "Antrenmana Başla" gösterilmez (02 §6.4). |
| Normal · sıradaki | Öncelik 4, `planned_date_key ≥ today` | Kart: `workout_templates.name_tr` (örn. "Day 5 – V-Taper Upper"), sıra etiketi (`sequence_index + 1`), planlanan gün, `estimated_minutes`, hareket sayısı, açık `recommendations` sayısı, "Antrenmana Başla". |
| Normal · bugün tamamlandı | Bugün `calendar_date_key = today` olan `completed`/`partial` oturum var | "Bugünkü antrenman tamamlandı" özeti (set sayısı, PR sayısı) + sıradaki antrenman **öngörü** olarak (planlanan tarihi ile). |
| Normal · program bitti | `challengeDay = 90` geçildi veya `programs.status='completed'` | Day 90 raporu CTA'sı (Bölüm I). Sıradaki antrenman kartı gizli. |

**Kol KPI alt kartı (aynı ekranda):** `BaselineResolver.biceps()` → `null` ise KPI kartı `disabled` ve **"Başlangıç kol ölçümünü ekle."** CTA'sı; `0 cm` asla gösterilmez (R96.3–R96.5, AT-12).

**Akış**

1. `AppBootstrap`: DB açılır → `MigrationRunner.run()` → `ActiveSessionService.findActive()`.
2. Dashboard `hydrate()`: açık `programs` satırı; `ChallengeCalendar.challengeDay(clock)` (`calendar_mode`'a göre `strictCalendar` / `activeDays` formülü, 02 §6.1); `programs.status='active'` ise `Scheduler.ensurePlanned(clock.todayKey())`; `MissedWorkoutResolver.detect()`; `BaselineResolver.biceps()`; açık `recommendations` (`decision_action IS NULL`) ve açık `plateau_insights` (`status='open'`) sayıları.
3. Öncelik sırasına göre birincil kart seçilir.
4. `DAY_CHANGED`, `TZ_CHANGED` ve `AppState → active` olaylarında adım 2 tekrarlanır (R112.5).
5. "Antrenmana Başla" → `ActiveSessionService.start(scheduledWorkoutId)` (tek transaction, 02 §7.1) → A.3'e yönlendirme.
6. Day etiketine dokunma → Program Settings (A.9) — mod bilgisi ("Strict 90 calendar days" / "Active 90 days") orada açıklanır.

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `home.day` | Day {X} / 90 | 01 R88.1 |
| `home.next.title` | Sıradaki antrenman | (öneri) |
| `home.next.sequence` | Antrenman {n} · {templateNameTr} | (öneri; `{templateNameTr}` = `workout_templates.name_tr`, örn. "Day 5 – V-Taper Upper") |
| `home.next.planned` | Planlandı: {weekday}, {date} | (öneri) |
| `home.next.start` | Antrenmana Başla | (öneri) |
| `home.next.recoCount` | {n} öneri hazır | (öneri) |
| `home.doneToday.title` | Bugünkü antrenman tamamlandı | (öneri) |
| `home.doneToday.preview` | Sıradaki (öngörü): {templateNameTr} · {date} | (öneri; 02 §6.2 "öngörü") |
| `home.paused.title` | Program dondurulmuş | (öneri) |
| `home.paused.resume` | Programı Devam Ettir | (öneri) |
| `home.finished.title` | 90 gün tamamlandı | (öneri) |
| `home.biceps.cta` | Başlangıç kol ölçümünü ekle. | 01 R96.4 |
| `home.empty.cta` | Programı başlat | (öneri) |
| `home.resume.title` | Devam eden antrenmanın var. | 01 R90.4 |
| `home.missed.title` | Kaçırılan antrenman: {templateName} ({plannedWeekday}) | 02 §6.4 |

**Servis / DB etkileri**

| Eylem | Servis | Yazma |
|---|---|---|
| Ekran açılışı | `Scheduler.ensurePlanned(today)` | Açık plan yoksa `scheduled_workouts` INSERT (`status='planned'`, `sequence_index = programs.training_sequence_index`, `planned_date_key` = `training_profiles.preferred_workout_days_json`'a göre ilk uygun gün). Program `paused` ise yazma yok. |
| Ekran açılışı | `MissedWorkoutResolver.detect()`, `ChallengeCalendar`, `BaselineResolver` | Yalnızca okuma; `missed` türetilir (`status='planned' AND planned_date_key < today AND programs.status='active'`), saklanmaz. |
| Antrenmana Başla | `ActiveSessionService.start(scheduledWorkoutId)` | `workout_sessions` INSERT (`status='active'`, `started_at_utc`, `calendar_date_key = localDateKey(started_at_utc, time_zone)`, `time_zone`, `utc_offset_minutes`, `bodyweight_kg_snapshot` ← en güncel `weight_logs`), `session_exercises` INSERT (şablondan; `planned_working_sets`, `planned_warmup_sets`, `rep_min`, `rep_max`, `target_rir`, `rest_seconds`, `tracking_mode` ← `user_exercise_settings.default_tracking_mode ?? 'bothSame'`), `scheduled_workouts.status='inProgress'`. Plan `remaining_exercise_ids_json` taşıyorsa yalnızca bu hareketler eklenir (bkz. A.4). |

**Gereksinimler:** R88.1, R88.2, R88.3, R88.8, R89.3, R90.4, R96.3–R96.5, R112.4, R112.5, R117.1, AT-04, AT-12, AT-13.

---

### A.2 Kaçırılan antrenman kararı

**Amaç:** Kaçırılan antrenmanı sessizce atlamadan, kullanıcıya üç açık seçenek sunmak (R88.3, R88.5). Karar `scheduled_workouts` FSM'ine (02 §6.3) birebir eşlenir.

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | `MissedWorkoutResolver.detect()` = ∅ | Kart render edilmez. |
| Yükleniyor | Karar komutu yazılıyor | Üç buton `disabled`; kart üzerinde ince ilerleme çubuğu. Çift dokunma `command_id` ile zararsız. |
| Hata | `DbWriteError` veya `ux_sched_one_open` ihlali | Kart içinde "Kaydedilemedi. Boş alanı kontrol et." + Yeniden dene (aynı `command_id`). Plan durumu değişmemiştir. |
| Normal | Bir `missed` plan var | Başlık "Kaçırılan antrenman: Day 5 – V-Taper Upper (Perşembe)"; alt metin: kaçırılan gün sayısı; üç buton: **Bugüne taşı** (birincil), **Başka güne taşı**, **Gerçekten atla** (destructive). Sağ üstte "Şimdi değil" (kartı yalnızca bugün için gizler; ertesi gün yeniden görünür — 02 §6.4). |
| Normal · onay | "Gerçekten atla"ya basıldı | Onay diyaloğu: "Bu antrenman tamamen atlanacak, sıradaki antrenmana geçilecek." + [Gerçekten atla] / [Vazgeç]. |

**Akış**

1. Uygulama açılışı / `DAY_CHANGED` → `MissedWorkoutResolver.detect()` → kart görünür. Kart görünürken "Antrenmana Başla" gizlidir; yeni antrenman kararsız başlatılamaz (02 §6.4).
2. **Bugüne taşı** → `reschedule(today)`; tek transaction: önce eski satır `status='rescheduled'`, sonra yeni `planned` satırı (sıra 03 §1.5 notu gereği önemlidir). Kart yerini sıradaki antrenman kartına bırakır; kullanıcı aynı ekrandan "Antrenmana Başla" ile doğrudan başlayabilir.
3. **Başka güne taşı** → A.10 tarih seçici açılır → seçim → `reschedule(date)` (`reschedule_reason='moveToDate'`).
4. **Gerçekten atla** → onay diyaloğu → onay → `skip("Gerçekten atla")`: `status='skipped'` + `advanceSequence()` + `Scheduler.ensurePlanned(today)` (sıradaki antrenman için yeni plan). Kart yerini sıradaki antrenman kartına bırakır.
5. **Şimdi değil** → kart bugün için gizlenir; DB'de plan değişmez; ertesi gün `detect()` yeniden bulur (sessiz atlama yok, R88.3).
6. Program `paused` iken adım 1 hiç tetiklenmez (R89.3); `resume()` sonrası açık plan otomatik `reschedule_reason='resume'` ile taşınır (A.9), bu yüzden dondurma sonrası kaçırılan kartı görünmez.

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `missed.title` | Kaçırılan antrenman: {templateName} ({plannedWeekday}) | 02 §6.4 (örnek: "Kaçırılan antrenman: Day 5 – V-Taper Upper (Perşembe)") |
| `missed.subtitle` | {n} gündür bekliyor · sıra ilerlemedi | (öneri) |
| `missed.moveToday` | Bugüne taşı | 01 R88.5 |
| `missed.moveToDate` | Başka güne taşı | 01 R88.5 |
| `missed.skip` | Gerçekten atla | 01 R88.5 |
| `missed.skip.confirm.body` | Bu antrenman tamamen atlanacak, sıradaki antrenmana geçilecek. | 02 §6.4 |
| `missed.skip.confirm.ok` | Gerçekten atla | 01 R88.5 |
| `missed.skip.confirm.cancel` | Vazgeç | (öneri) |
| `missed.dismiss` | Şimdi değil | (öneri) |

**Servis / DB etkileri**

| Buton | Servis | Transaction içeriği |
|---|---|---|
| Bugüne taşı | `MissedWorkoutResolver` → `reschedule(today)` | `scheduled_workouts` UPDATE eski: `status='rescheduled'`, `rescheduled_to_id=<yeni>`, `reschedule_reason='moveToToday'`, `resolved_at_utc`; INSERT yeni: `status='planned'`, aynı `sequence_index`, aynı `workout_template_id`, `planned_date_key=today`, `rescheduled_from_id=<eski>`, `remaining_exercise_ids_json` (varsa) kopyalanır. `programs.training_sequence_index` **değişmez** (R88.7). |
| Başka güne taşı | `reschedule(date)` | Aynı; `planned_date_key=<seçilen>`, `reschedule_reason='moveToDate'`. |
| Gerçekten atla | `TrainingSequence.advanceSequence()` | `scheduled_workouts` UPDATE: `status='skipped'`, `resolved_at_utc`; `programs.training_sequence_index += 1` (`program_templates.is_cyclic=1` ise `mod templates.length`, başa dönüşte `sequence_wraps += 1`); `sequence_events` INSERT (`from_index`, `to_index`, `cause='skipped'`, `scheduled_workout_id`); ardından `Scheduler.ensurePlanned(today)` yeni `planned`. |
| Şimdi değil | — | DB'de plan değişmez. Gizleme bilgisi `settings` (`key='missedCard.dismissedDateKey'`, `value_json=today`) olarak saklanır (bkz. açık nokta). |

**Gereksinimler:** R88.3–R88.7, R89.3, R89.7, R117.3, AT-04, AT-05.

---

### A.3 Aktif antrenman ekranı

**Amaç:** Bir seti 3–5 saniyede loglamak (R108.4) ve hiçbir girdiyi kaybetmemek (R90). Ekran `workout_sessions(status='active')` + `session_exercises` + `set_logs` + `rest_timers(state='running')` satırlarından `hydrate()` edilir; bellekte türetilmemiş hiçbir durum yoktur (R90.3, R90.7).

**Yerleşim (yukarıdan aşağıya):** başlık (şablon adı, `started_at_utc`'den türetilen geçen süre, **Antrenmanı Bitir**, taşma menüsü: "Antrenmanı İptal Et", "Not ekle"); hareket listesi (durum rozetli daraltılmış kartlar, sürükle-bırak → `reorderExercises`); odaktaki hareket kartı: set tablosu (warmup/working), yük `NumericStepper`, tekrar `NumericStepper`, RIR segmenti, prefill kaynağı rozeti, **Seti Tamamla**; altta kalıcı rest timer çubuğu.

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | `findActive()` = `null` (örn. başka yerde iptal edildi) | Ekran render edilmez; Ana ekrana yönlendirme + kısa bilgi "Aktif antrenman yok." (öneri). |
| Yükleniyor | İlk `hydrate` / bildirim deep-link ile açılış | Başlık + skeleton; rest timer çubuğu DB'deki `rest_timers(state='running')` satırından anında hesaplanır (R91.8). |
| Hata · yazma | `completeSet`/`editSet` vb. `DbWriteError` | Set satırında kırmızı "Kaydedilemedi. Boş alanı kontrol et." + Yeniden dene; stepper değerleri korunur (`draft_*` kolonlarında). |
| Hata · render | Bileşen hatası | Ekran `ErrorBoundary`: "Bir şeyler ters gitti." + Yeniden yükle (→ `hydrate()`); hiçbir set kaybolmaz (R90.2). |
| Normal · set girişi | Odaktaki hareket `status ∈ {'pending','inProgress'}` | Stepper'lar prefill ile dolu, "Seti Tamamla" aktif. |
| Normal · dinlenme sürüyor | `rest_timers.state='running'`, kalan > 0 | Çubukta `mm:ss` (formül: `rest_duration_seconds − (now − rest_started_at_utc)`), "Dinlenmeyi atla". Set girişi engellenmez. |
| Normal · dinlenme bitti | Kalan = 0 | Çubuk "Dinlenme bitti" (R91.7) + haptik; `state='completed'` tembel yazılır (02 §7.2). |
| Normal · hareket tamamlandı | Working set sayısı ≥ `planned_working_sets` → `session_exercises.status='done'` | Kart daraltılır, sıradaki `pending` hareket odağa alınır. Ek set eklenebilir ("Ek set" — `set_type='working'|'dropset'|'backoff'`). |
| Normal · hepsi bitti | Tüm `session_exercises.status ∈ {'done','skipped'}` | "Antrenmanı Bitir" vurgulanır; A.4 tam-antrenman yolu. |

**Yük alanının `load_progression_type`'a göre biçimi (R101):**

| `exercises.load_progression_type` | Alan etiketi (öneri) | Yazılan kolon | Not |
|---|---|---|---|
| `externalLoadHigherIsHarder` | Ağırlık (kg) | `set_logs.load_kg` | `[−step] 80 [+step]` |
| `assistanceLowerIsHarder` | Yardım (kg) | `set_logs.assistance_kg` | Yardımcı metin "Daha az yardım = daha zor"; "+" butonu **yardımı artırır**, ilerleme önerisi yardımı azaltır (R101.3). |
| `bodyweight` | — (yalnızca tekrar) | `bodyweight_kg_snapshot` | Kilo bilinmiyorsa `NULL`; kıyas tekrar üzerinden. |
| `bodyweightPlusExternalLoad` | Ek yük (kg) | `load_kg` + `bodyweight_kg_snapshot` | |
| `machineLevel` | Seviye | `machine_level` | `step=1` |
| `distanceOrBand` | Band / Mesafe (cm) | `band_rank` / `distance_cm` | Band listesi seed'den (ordinal). |

**Prefill kaynağı rozeti (02 §7.3 sırası):**

| Sıra | Kaynak | Rozet metni | Kaynak |
|---|---|---|---|
| 1 | Aynı oturumda önceki set (`set_logs`, aynı `session_exercise_id`, aynı `side`) | önceki set | (öneri) |
| 2 | Son oturumda aynı `set_index` (`set_logs` JOIN `workout_sessions` son `completed`/`partial`, aynı `exercise_id` veya `original_exercise_id` ailesi) | son antrenman | (öneri) |
| 3 | Açık/kabul edilmiş `recommendations.proposed_json` (`kind ∈ {'loadIncrease','holdLoad','loadDecrease','repIncrease','deload'}`) | önerilen | 02 §7.3 |
| 4 | Şablon hedefi (`rep_min`, `target_rir`) | hedef | (öneri) |

Bu belge, hareketin **ilk working set'i** için kullanıcı kararı `accepted`/`modified` olan bir öneriyi (3) kaynağı (2)'nin önüne alır; aksi halde öneri hiçbir zaman prefill'e yansımaz (bkz. Tutarsızlık #4). Prefill değeri `IncrementResolver.forExercise(exerciseId)` adımıyla `roundToAvailable` üzerinden geçer; imkânsız değer gösterilmez (R100.3, R100.4).

**Akış — set loglama (mutlu yol, ≤ 3 dokunuş):**

1. Ekran açılır; odaktaki hareketin sıradaki set satırı prefill ile dolu, rozet görünür.
2. Kullanıcı gerekirse `NumericStepper` ile düzeltir (`[-2.5] 80 [+2.5]`, `[-] 11 [+]`; basılı tutunca hızlanır; dokununca klavye). Her değişiklik `draftInput` komutuyla `session_exercises.draft_load_json/draft_reps/draft_rir`'e yazılır (≤ 300 ms debounce; `AppState → background` anında `flushDraftInputs()`) (R90.1).
3. RIR segmenti `0 1 2 3 4+` (`4+` → `rir=4`).
4. **Seti Tamamla** → `completeSet` komutu (tek transaction, aşağıda). Yanıt < 10 ms; satır "tamamlandı" görünümüne geçer, sonraki setin prefill'i hazırdır, rest timer çubuğu başlar (R90.6, R108.3).
5. PR tespit edildiyse A.6 kutlaması (bloklamaz).
6. Working set sayısı `planned_working_sets`'e ulaşınca hareket `done`; odak sıradaki harekete geçer.

**Akış — set düzenleme / işaretleme:** Tamamlanmış sete dokunma → satır içi düzenleyici (aynı stepper'lar) + bayraklar: **Exclude from PR** (`exclude_from_pr`), "Ağrı" (`pain_flag`), "Form bozuldu" (`form_breakdown_flag`), set notu → **Kaydet** → `editSet` (`set_logs` UPDATE + `set_log_revisions` INSERT `before_json/after_json`) (R107.3). "Ağrı" veya "Form bozuldu" işaretlenince **Exclude from PR** önerilir (varsayılan açık, kullanıcı kapatabilir).

**Akış — rest timer:**

1. `completeSet` transaction'ı içinde `RestTimerService.start(rest_seconds)`: varsa `running` timer kapatılır (`state='skipped'`, bildirim iptal), yeni satır INSERT (`rest_started_at_utc = now`, `rest_duration_seconds = session_exercises.rest_seconds`, `state='running'`, `set_log_id`).
2. Transaction sonrası `LocalNotificationScheduler.schedule(at = rest_started_at_utc + rest_duration_seconds, body: 'Dinlenme bitti – sıradaki set')` → `notification_id` UPDATE. Bildirim izni yoksa sessizce atlanır; sayaç yine çalışır (R91.5).
3. Çubuk her saniye **yalnızca ekranı yeniler**; kalan süre formülden hesaplanır (R91.1, R91.3). Ekran kilidi / arka plan / yeniden başlatma sonrası `AppState → active` veya `hydrate()` ile yeniden hesaplanır (R91.4, R91.7, R91.8, AT-03).
4. **Dinlenmeyi atla** → `skipRest`: `state='skipped'` + `cancelNotification(notification_id)` (R91.6). Sonraki set tamamlanınca da aynı kapatma uygulanır.
5. Manuel başlatma: çubuk boştayken "Dinlenme başlat" → `startRest` (örn. ısınma sonrası).
6. Rest timer `DAY_CHANGED`'e abone **değildir** (02 §5.4).

**Akış — Hareketi Değiştir (alt sayfa):**

1. Hareket kartı menüsü → **Hareketi Değiştir** → modal alt sayfa.
2. `SubstitutionEngine.alternatives(exerciseId, ctx)` (ctx: `equipment_profiles.available_json`, `training_profiles.pain_areas_json`, `experience`, geçmiş) → ilk 5 aday, her satırda ad (`name_tr`), ekipman etiketleri, gerekçe ("Aynı kas, aynı hareket kalıbı, ekipmanın var"), "Daha önce yaptın" etiketi; altta "Farklı amaç" listesi (movement pattern farklı olanlar, ayrı başlık); en altta `ExerciseCatalog.available()` üzerinde arama. Ekipmanı olmayan hareketler listelenmez; "Ekipman profilini düzenle" bağlantısı (R98.4, R99.2, R99.4).
3. Seçim → isteğe bağlı sebep çipleri ("Ekipman dolu", "Ağrı", "Tercih") → **Değiştir** → `substituteExercise`: `session_exercises.exercise_id = <yeni>`, `original_exercise_id = COALESCE(original_exercise_id, <eski>)`, `substitution_reason`; şablon hedefleri (`rep_min/rep_max/target_rir/rest_seconds`) korunur; prefill yeni hareketin geçmişinden (`exercise_id` + `original_exercise_id` ailesi) gelir, geçmiş kaybolmaz (R99.5, R99.7).
4. Kural: bu `session_exercise` için henüz `set_logs` yoksa yerinde değiştirme; varsa mevcut satır `status='skipped'` bırakılır ve yeni hareket `order_index + 1` ile yeni `session_exercises` satırı olarak eklenir (bkz. Tutarsızlık #10).

**Akış — Unilateral (Both Same / Track Separately):**

1. `exercises.is_unilateral=1` ise hareket başlığında segment: **Both Same** | **Track Separately** (R102.2). Varsayılan: `user_exercise_settings.default_tracking_mode ?? 'bothSame'`.
2. Geçiş → `session_exercises.tracking_mode` UPDATE (`'bothSame'` / `'separate'`) + `user_exercise_settings.default_tracking_mode` UPDATE (hatırlanır). Geçiş yalnızca **sonraki** set indekslerini etkiler; loglanmış satırların `side` değeri değişmez.
3. `separate`: set satırı **Sol** / **Sağ** olarak ikiye bölünür; stepper aktif tarafa uygulanır; her taraf için ayrı **Seti Tamamla** → `set_logs` satırı `side='left'` / `side='right'`, aynı `set_index` (`UNIQUE (session_exercise_id, set_index, side)`). Prefill taraf bazında (kaynak 1–2 aynı `side` ile). Rest timer ikinci taraf tamamlanınca başlar. Set sayacı `COUNT(DISTINCT set_index)` — çift sayım yok (R102.4).
4. `bothSame`: tek satır `side='both'`.
5. PR ve öneriler `separate`'ta taraf bazında (`personal_records.side`, `plateau_insights.side`); en zayıf taraf öneriyi belirler (R102.3).

**Akış — hareket atla ve not:**

- Hareket menüsü → "Hareketi Atla" → `skipExercise`: `session_exercises.status='skipped'`; kart daraltılır, 5 sn "Geri al" (aynı transaction'ın tersi: `status='pending'`). Atlanan hareket için progression önerisi üretilmez (R103.5). Not: kalan tüm hareketler açıkça atlanırsa bitirme ekranı **tam** yolunu izler (02 §7.5).
- "Not ekle" → hareket notu `session_exercises.note`, oturum notu `workout_sessions.note`; `setNote` komutu blur'da ve 1 sn debounce ile yazar (R90.1).
- "Teknik" → `ExerciseVideo` (manifest + fallback; §114, bu bölümün kapsamı dışında).

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `active.finish` | Antrenmanı Bitir | 01 R90.5 |
| `active.cancel` | Antrenmanı İptal Et | 01 R90.5 |
| `active.completeSet` | Seti Tamamla | 02 §7.3 |
| `active.load` | Ağırlık (kg) | (öneri) |
| `active.assistance` | Yardım (kg) | (öneri) |
| `active.assistance.hint` | Daha az yardım = daha zor | (öneri; R101.3) |
| `active.reps` | Tekrar | 01 R108.2 |
| `active.rir` | RIR | 01 R108.2 |
| `active.rir.options` | 0 · 1 · 2 · 3 · 4+ | 01 R108.2 |
| `active.prefill.prevSet` | önceki set | (öneri) |
| `active.prefill.lastSession` | son antrenman | (öneri) |
| `active.prefill.recommended` | önerilen | 02 §7.3 |
| `active.prefill.target` | hedef | (öneri) |
| `active.rest.remaining` | Dinlenme {mm:ss} | (öneri) |
| `active.rest.done` | Dinlenme bitti | 01 R91.7 |
| `active.rest.skip` | Dinlenmeyi atla | (öneri) |
| `active.rest.start` | Dinlenme başlat | (öneri) |
| `active.rest.notification` | Dinlenme bitti – sıradaki set | 02 §7.2 |
| `active.substitute` | Hareketi Değiştir | 01 R99.1 |
| `active.substitute.rationale` | Aynı kas, aynı hareket kalıbı, ekipmanın var | 02 §8.3 |
| `active.substitute.otherIntent` | Farklı amaç | 02 §8.3 |
| `active.substitute.doneBefore` | Daha önce yaptın | (öneri) |
| `active.substitute.editEquipment` | Ekipman profilini düzenle | (öneri) |
| `active.substitute.reason.*` | Ekipman dolu · Ağrı · Tercih | (öneri) |
| `active.unilateral.bothSame` | Both Same | 01 R102.2 |
| `active.unilateral.separate` | Track Separately | 01 R102.2 |
| `active.side.left` / `.right` | Sol / Sağ | (öneri) |
| `active.skipExercise` | Hareketi Atla | (öneri) |
| `active.undo` | Geri al | (öneri) |
| `active.note.add` | Not ekle | (öneri) |
| `active.set.excludeFromPr` | Exclude from PR | 01 R107.3 |
| `active.set.pain` | Ağrı | (öneri) |
| `active.set.formBreakdown` | Form bozuldu | (öneri) |
| `active.set.extra` | Ek set | (öneri) |
| `active.set.save` | Kaydet | (öneri) |
| `active.noSession` | Aktif antrenman yok. | (öneri) |
| `error.write` | Kaydedilemedi. Boş alanı kontrol et. | 02 §15 |
| `error.retry` | Yeniden dene | 02 §15 |

**Servis / DB etkileri (komut → transaction)**

| Komut | Servis | Yazılan |
|---|---|---|
| `completeSet` | `SetLogService` + `PrDetector` + `RestTimerService` | `set_logs` INSERT (`command_id`, `session_id`, `session_exercise_id`, `exercise_id`, `set_index`, `set_type`, `side`, ham yük kolonu, `bodyweight_kg_snapshot`, `reps`, `rir`, `completed_at_utc`, `local_date_key`, `time_zone`); `personal_records` INSERT (`loadPr`/`repPrAtLoad`/`estimatedPerformancePr`; öncekinin `superseded_by_id` set edilir); önceki `rest_timers(running)` → `skipped`; yeni `rest_timers` INSERT `running`; `session_exercises.status` (`'inProgress'` → `'done'`), `draft_*` = NULL; `command_log` INSERT. Tx sonrası bildirim planlanır → `rest_timers.notification_id`. |
| `editSet` | `SetLogService` | `set_logs` UPDATE + `set_log_revisions` INSERT. |
| `draftInput` / `flushDraftInputs` | `ActiveSessionService` | `session_exercises.draft_load_json`, `draft_reps`, `draft_rir`. |
| `startRest` / `skipRest` | `RestTimerService` | `rest_timers` INSERT/UPDATE (`state`, `notification_id`); `LocalNotificationScheduler.schedule/cancelNotification`. |
| `substituteExercise` | `SubstitutionEngine` + `ActiveSessionService` | `session_exercises.exercise_id`, `original_exercise_id`, `substitution_reason` (veya yeni satır, kural 4). |
| `skipExercise` / `reorderExercises` | `ActiveSessionService` | `session_exercises.status='skipped'` / `order_index`. |
| Unilateral geçiş | `ActiveSessionService` | `session_exercises.tracking_mode`; `user_exercise_settings.default_tracking_mode`. |
| `setNote` | `ActiveSessionService` | `session_exercises.note` / `workout_sessions.note`. |
| Antrenmanı İptal Et (taşma menüsü) | `ActiveSessionService.cancelSession()` | A.5 ile aynı, `ended_reason='userCancel'`. |

Dayanıklılık: `journal_mode=WAL`, `synchronous=FULL`; yarım kalan `completeSet` atomik geri alınır, `command_id` ile güvenle tekrarlanır (R90.2, R90.6, AT-01, AT-02).

**Gereksinimler:** R90.1–R90.3, R90.6, R90.7, R91.1–R91.8, R98.4, R99.1, R99.2, R99.4, R99.5, R99.7, R100.1, R100.3, R100.4, R101.1–R101.3, R102.1–R102.4, R103.5, R107.2, R107.3, R108.1–R108.5, R112.2, R117.3, R117.5, AT-01, AT-02, AT-03, AT-08, AT-09, AT-18.

---

### A.4 Bitirme ekranı (oturum özeti)

**Amaç:** Oturumu doğru duruma (`completed` / `partial`) kapatmak, kısmi antrenmanda kullanıcıdan açık karar almak (R103.1–R103.3), antrenman tarihini düzeltme imkânı vermek (R113.4) ve sırayı yalnızca izin verilen nedenlerle ilerletmek (R88.6).

**Tam / kısmi kuralı (02 §7.5):**

- **Tam:** her `session_exercises` satırı `status ∈ {'done','skipped'}` (yani `status='done'` olanlarda `COUNT(DISTINCT set_index WHERE set_type='working') ≥ planned_working_sets`; kalan hareketler açıkça atlanmış). Başlık **"Antrenman tamamlandı"** (öneri), çıkış: `completed`.
- **Kısmi:** herhangi bir satır `status ∈ {'pending','inProgress'}` (yapılmamış veya eksik setli hareket var). Başlık **"Bugün burada bitir"** (R103.3); oturum otomatik `completed` **olmaz** (R103.1); durum `partiallyCompleted` (R103.2) ve kullanıcı iki karar arasından birini seçmek zorundadır.

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | Hiç `set_logs` yok (oturum açıldı, set loglanmadı) | Özet yerine bilgi: "Henüz set kaydetmedin." (öneri); seçenekler yalnızca **Antrenmanı İptal Et** (A.5 onayı) ve **Vazgeç**. Kısmi kararı gösterilmez (boş kısmi antrenman üretilmez). |
| Yükleniyor | Özet hesaplanıyor / bitirme komutu yazılıyor | Karar butonları `disabled`. |
| Hata | `DbWriteError` | "Kaydedilemedi. Boş alanı kontrol et." + Yeniden dene; oturum `active` kalır, hiçbir set kaybolmaz. |
| Normal · tam | Tam kuralı sağlandı | Özet (süre, hareket/set sayısı, toplam hacim, PR listesi, `sessionVolumePr` varsa), tarih satırı, oturum notu, **Bitir**. |
| Normal · kısmi | Kısmi kuralı sağlandı | Başlık "Bugün burada bitir"; hareket bazında yapılan/planlanan tablo; soru "Kalan hareketler ne olsun?"; **Bitmiş say** / **Kalanı sonraki güne taşı**; tarih satırı; **Vazgeç**. |
| Normal · resume kartından | `ended_reason` adayı `'resumeCardFinish'` | Aynı ekran; üstte bilgi bandı "Bu antrenman {date} tarihinde başlamıştı." (öneri). |

**Akış**

1. A.3 başlığındaki **Antrenmanı Bitir** (veya A.5 **Antrenmanı Bitir**) → ekran açılır; tam/kısmi kuralı DB'den hesaplanır.
2. Tarih satırı: "Antrenman tarihi: {calendar_date_key}" — varsayılan `localDateKey(started_at_utc, time_zone)`; 23:50'de başlayıp 00:10'da biten antrenman başlangıç gününde kalır (R113.1, R113.3). **Düzenle** → tarih seçici (izin verilen aralık: `started_at` yerel tarihi − 1 gün … bugün) → değişiklik `calendar_date_overridden=1` ile işaretlenir; "Tarih elle değiştirildi" rozeti (R113.4). `set_logs.local_date_key` değişmez; analitik `workout_sessions.calendar_date_key` kullanır (`v_weekly_direct_sets`).
3. **Tam yol → Bitir:** `finish(all done)` tek transaction: `workout_sessions.status='completed'`, `completed_at_utc`, `ended_reason='allDone'` (resume kartından geldiyse `'resumeCardFinish'`); `scheduled_workouts.status='completed'`, `resolved_at_utc`; `advanceSequence()` (`sequence_events.cause='completed'`); açık `rest_timers` → `skipped` + bildirim iptali; `PrDetector` `sessionVolumePr`; `ProgressionEngine` yalnızca `set_logs` bulunan hareketler için `recommendations` INSERT (R103.5); `PlateauEngine` → gerekiyorsa `plateau_insights` INSERT (`status='open'`). Ardından `Scheduler.ensurePlanned(today)`.
4. **Kısmi yol → Bitmiş say:** `finish(partial, "Bugün burada bitir")` + karar: `workout_sessions.status='partial'`, `ended_reason='finishHereToday'`; `scheduled_workouts.status='partiallyCompleted'`, `partial_decision='countAsDone'`, `resolved_at_utc`; `advanceSequence()` (`cause='partialCountedDone'`) (R88.6); adım 3'teki timer/PR/öneri işlemleri aynı.
5. **Kısmi yol → Kalanı sonraki güne taşı:** A.10 tarih seçici (varsayılan: ertesi ilk uygun gün) → tek transaction: `workout_sessions.status='partial'`, `ended_reason='finishHereToday'`; `scheduled_workouts` UPDATE: `status='partiallyCompleted'`, `partial_decision='continueLater'`, `remaining_exercise_ids_json = [status ∈ {'pending','inProgress'} olan session_exercises.exercise_id]`, `rescheduled_to_id=<yeni>`, `resolved_at_utc`; INSERT yeni `planned` (aynı `sequence_index`, aynı `workout_template_id`, `planned_date_key=<seçilen>`, `rescheduled_from_id`, `reschedule_reason='partialContinuation'`, `remaining_exercise_ids_json`). Sıra **ilerlemez** (R88.7). Devam planı başlatıldığında `ActiveSessionService.start` yalnızca `remaining_exercise_ids_json`'daki hareketleri şablon sırası ve hedefleriyle ekler.
6. **Vazgeç** → A.3'e dönüş; oturum `active` kalır.
7. Bitirme sonrası: kutlama/özet (A.6 `sessionVolumePr` dahil) → Ana ekran; haftalık adherence `AdherenceCalculator.week()` tam / kısmi / atlanmış / kaçırılmış olarak ayrı gösterir (R103.4, AT-06).

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `finish.title.full` | Antrenman tamamlandı | (öneri) |
| `finish.title.partial` | Bugün burada bitir | 01 R103.3 |
| `finish.partial.summary` | {planned} hareketten {done}'ı tamamlandı · {missing} hareket eksik | (öneri) |
| `finish.partial.question` | Kalan hareketler ne olsun? | (öneri) |
| `finish.partial.countDone` | Bitmiş say | 01 R88.6 / 02 §6.3 |
| `finish.partial.countDone.hint` | Bu antrenman "kısmi" olarak kaydedilir; sıra bir sonraki antrenmana geçer. | (öneri) |
| `finish.partial.continueLater` | Kalanı sonraki güne taşı | 02 §6.3 |
| `finish.partial.continueLater.hint` | Kalan {n} hareket için bir gün seçersin; sıra ilerlemez. | (öneri) |
| `finish.date.label` | Antrenman tarihi | (öneri) |
| `finish.date.edit` | Düzenle | (öneri) |
| `finish.date.overridden` | Tarih elle değiştirildi | (öneri) |
| `finish.note` | Oturum notu | (öneri) |
| `finish.confirm` | Bitir | (öneri) |
| `finish.back` | Vazgeç | (öneri) |
| `finish.empty` | Henüz set kaydetmedin. | (öneri) |
| `finish.fromResume` | Bu antrenman {date} tarihinde başlamıştı. | (öneri) |
| `finish.volumePr` | Oturum hacmi PR'ı | (öneri) |

**Servis / DB etkileri** — adım 3–5'te ayrıntılı; özet:

| Karar | `workout_sessions` | `scheduled_workouts` | Sıra | Diğer |
|---|---|---|---|---|
| Bitir (tam) | `status='completed'`, `ended_reason='allDone'` \| `'resumeCardFinish'`, `completed_at_utc` | `status='completed'` | `advanceSequence()` `cause='completed'` | `rest_timers` kapat, `personal_records` (`sessionVolumePr`), `recommendations`, `plateau_insights`, `Scheduler.ensurePlanned` |
| Bitmiş say | `status='partial'`, `ended_reason='finishHereToday'` | `status='partiallyCompleted'`, `partial_decision='countAsDone'` | `advanceSequence()` `cause='partialCountedDone'` | aynı |
| Kalanı sonraki güne taşı | `status='partial'`, `ended_reason='finishHereToday'` | `status='partiallyCompleted'`, `partial_decision='continueLater'`, `remaining_exercise_ids_json`, `rescheduled_to_id` + yeni `planned` (`reschedule_reason='partialContinuation'`) | **değişmez** | `rest_timers` kapat, öneriler yalnızca yapılan hareketler için |
| Tarih düzenle | `calendar_date_key`, `calendar_date_overridden=1` | — | — | — |

**Gereksinimler:** R88.6, R88.7, R103.1–R103.5, R107.1, R113.1–R113.4, R121.3, R122.1, AT-06, AT-07, AT-13.

---

### A.5 Devam eden antrenman kartı (resume) ve iptal onayı

**Amaç:** Uygulama kapanmış, çökmüş veya arka plana alınmış olsa da aktif oturumu DB'den geri yüklemek ve kullanıcıya üç net seçenek sunmak (R90.2–R90.5).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | `findActive()` = `null` | Kart render edilmez. |
| Yükleniyor | Kart komutu yazılıyor | Üç buton `disabled`. |
| Hata | `DbWriteError` | Kart içinde hata çubuğu + Yeniden dene; oturum `active` kalır. |
| Normal | Aktif oturum var | Başlık **"Devam eden antrenmanın var."**, şablon adı, başlangıç ("Başladı: Per 18:42"), ilerleme ("3/7 hareket · 12 set"), varsa "Dinlenme sürüyor {mm:ss}" / "Dinlenme bitti"; butonlar **Devam Et** (birincil) · **Antrenmanı Bitir** · **Antrenmanı İptal Et** (destructive). |
| Normal · iptal onayı | "Antrenmanı İptal Et"e basıldı | Diyalog (metin aşağıda) + [Antrenmanı İptal Et] / [Vazgeç]. |

**Akış**

1. `AppBootstrap` → `ActiveSessionService.findActive()` → Ana ekran öncelik 1 kartı. Rest timer bildirimi deep-link'i doğrudan A.3'ü açar (kart atlanır).
2. **Devam Et** → A.3; `hydrate()`; kalan dinlenme süresi `rest_timers` satırından yeniden hesaplanır (AT-01, AT-03).
3. **Antrenmanı Bitir** → A.4 (aynı tam/kısmi kuralı; `ended_reason='resumeCardFinish'`).
4. **Antrenmanı İptal Et** → onay diyaloğu → onay → `ActiveSessionService.cancelSession()` (aşağıda). Kart kaybolur; plan `planned`'a döndüğü için ertesi açılışta gerekiyorsa A.2 kaçırılan kartı görünür (sıra ilerlemez, R88.6).
5. Aynı diyalog A.3 taşma menüsündeki "Antrenmanı İptal Et" için de kullanılır (`ended_reason='userCancel'`).

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `resume.title` | Devam eden antrenmanın var. | 01 R90.4 |
| `resume.startedAt` | Başladı: {weekday} {HH:mm} | (öneri) |
| `resume.progress` | {doneExercises}/{plannedExercises} hareket · {sets} set | (öneri) |
| `resume.continue` | Devam Et | 01 R90.5 |
| `resume.finish` | Antrenmanı Bitir | 01 R90.5 |
| `resume.cancel` | Antrenmanı İptal Et | 01 R90.5 |
| `resume.cancel.confirm.body` | Bu antrenman iptal edilecek. Kaydettiğin setler silinmez ama geçmişte ve PR hesaplarında sayılmaz. Antrenman planı yeniden "planlandı" durumuna döner; sıra ilerlemez. | (öneri; 02 §7.1) |
| `resume.cancel.confirm.ok` | Antrenmanı İptal Et | 01 R90.5 |
| `resume.cancel.confirm.cancel` | Vazgeç | (öneri) |

**Servis / DB etkileri**

| Buton | Servis | Transaction içeriği |
|---|---|---|
| Devam Et | `ActiveSessionService.findActive()` | Yalnızca okuma. |
| Antrenmanı Bitir | A.4 | A.4 ile aynı; `ended_reason='resumeCardFinish'`. |
| Antrenmanı İptal Et | `ActiveSessionService.cancelSession()` | `workout_sessions.status='cancelled'`, `ended_reason='resumeCardCancel'` (A.3'ten: `'userCancel'`), `completed_at_utc`; `set_logs.discarded=1` (satırlar **silinmez**, R90.2 / 02 §7.1; `v_set_effective_load` ve `v_weekly_direct_sets` bunları dışlar); bu oturumdaki `personal_records` satırları geri alınır (silinir, önceki kaydın `superseded_by_id` NULL'a döner — bkz. Tutarsızlık #8); `rest_timers(running)` → `skipped` + `cancelNotification`; `scheduled_workouts.status='planned'` (aynı satır, `planned_date_key` korunur; 02 §6.3 FSM). Sıra değişmez. |

**Gereksinimler:** R88.6, R90.2–R90.5, R90.7, R91.6, R91.8, AT-01, AT-03.

---

### A.6 PR kutlaması

**Amaç:** Yalnızca ağırlığa dayanmayan PR türlerini (R107.1) set akışını bloklamadan kutlamak; tahmini olanları "tahmin" olarak etiketlemek (R123.4).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | `completeSet` transaction'ı PR döndürmedi | Hiçbir şey gösterilmez. |
| Yükleniyor | — | Yok (PR tespiti `completeSet` transaction'ının parçasıdır; ayrı yükleme yok). |
| Hata | — | PR tespiti hata verirse `completeSet` transaction'ı bütünüyle geri alınır ve A.3 yazma hatası gösterilir; "yarım PR" yoktur. |
| Normal · set PR'ı | `personal_records` INSERT (`loadPr` / `repPrAtLoad` / `estimatedPerformancePr`) | A.3 üst kısmında 4 sn'lik banner + haptik; birden fazla tür varsa tek banner'da birleşik; `estimatedPerformancePr` yanında "tahmin" rozeti; `separate` modunda taraf eki "(sol)"/"(sağ)". Dokunma → hareketin PR geçmişi. |
| Normal · oturum PR'ı | `sessionVolumePr` (bitirme transaction'ında) | A.4 özetinde satır "Oturum hacmi PR'ı". |

**Akış**

1. `completeSet` transaction'ı içinde `PrDetector` adayları değerlendirir: `set_type='working'`, `exclude_from_pr=0`, `discarded=0`; ısınma setleri asla PR üretmez (R107.2). Kıyas `v_set_effective_load.effective_load` üzerinden (tür-bilinçli; assisted türde daha az yardım daha iyidir, R101.4, R107.4).
2. Yeni kayıt → `personal_records` INSERT; eski kayıt `superseded_by_id=<yeni>`.
3. Transaction sonrası UI banner gösterir; kullanıcı sonraki sete devam edebilir (bloklama yok, R108.4).
4. Kullanıcı seti sonradan **Exclude from PR** olarak işaretlerse (`editSet`) ilgili `personal_records` satırı geri alınır ve önceki kayıt yeniden geçerli olur (bkz. Tutarsızlık #8).

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `pr.banner.title` | Yeni PR! | (öneri) |
| `pr.type.loadPr` | Yük PR'ı · {effectiveLoad} kg × {reps} | (öneri; `pr_type='loadPr'`) |
| `pr.type.repPrAtLoad` | Aynı yükte tekrar PR'ı · {effectiveLoad} kg × {reps} | (öneri; `'repPrAtLoad'`) |
| `pr.type.estimatedPerformancePr` | Tahmini performans PR'ı · e1RM {estimated_1rm} kg | (öneri; `'estimatedPerformancePr'`) |
| `pr.type.sessionVolumePr` | Oturum hacmi PR'ı · {session_volume} kg | (öneri; `'sessionVolumePr'`) |
| `pr.estimateBadge` | tahmin | 01 R123.4 |
| `pr.side.left` / `.right` | (sol) / (sağ) | (öneri) |
| `pr.excludeHint` | Bu set PR hesaplarına dahil edilmeyecek. | (öneri; R107.3) |

**Servis / DB etkileri:** `PrDetector` (`completeSet` ve bitirme transaction'ları içinde) → `personal_records` INSERT/UPDATE (`pr_type`, `side`, `set_log_id`, `session_id`, `effective_load`, `reps`, `estimated_1rm`, `session_volume`, `achieved_at_utc`, `local_date_key`, `superseded_by_id`). UI yalnızca okur.

**Gereksinimler:** R101.4, R102.3, R107.1–R107.4, R108.4, R123.4.

---

### A.7 Öneri kartı (Recommendation)

**Amaç:** Her öneriyi gerekçesiyle sunmak ve **Kabul / Değiştir / Yok say** ile kapatmak; kararı geçmişte saklamak (R121.1–R121.3, R122.1–R122.3). Kart `recommendations` satırının doğrudan görünümüdür.

**Nerede görünür:** (a) A.3 hareket başlığında, ilk working set'ten önce — `kind ∈ {'loadIncrease','holdLoad','loadDecrease','repIncrease','deload','substitution'}`; (b) Ana ekran sıradaki antrenman kartında sayaç ("{n} öneri hazır"); (c) Progress ekranında — `kind ∈ {'volumeIncrease','volumeHold'}` (`VolumeGuardrails`, R105); (d) beslenme türleri (`nutritionHold`, `nutritionAdjust`) Bölüm B'de.

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | Hareket için `decision_action IS NULL` ve süresi dolmamış öneri yok | Kart yok; prefill kaynak 1/2/4 kullanılır. |
| Yükleniyor | Karar komutu yazılıyor | Üç buton `disabled`. |
| Hata | `DbWriteError` | Kart içinde hata çubuğu + Yeniden dene. |
| Normal · açık | `decision_action IS NULL`, `expires_at_utc` geçmemiş | Başlık (tür), önerilen değer, **Neden önerildi?** (kapalı akordeon), **Kabul** · **Değiştir** · **Yok say**; `is_estimate=1` ise "tahmin" rozeti. |
| Normal · gerekçe açık | Akordeon açıldı | `rationale_tr` metni + `evidence_json` çipleri (örn. "Son 3 set: 12 · 12 · 12 @ RIR 2", "Artış adımı: 2.5 kg") + kanıt setlerine bağlantı (`evidence_json.setLogIds`) (R122.3). |
| Normal · değiştir | "Değiştir"e basıldı | Satır içi `NumericStepper` (adım `IncrementResolver.forExercise`, `roundToAvailable`) + **Kaydet**. |
| Normal · karar verildi | `decision_action` dolu | Kart daraltılır: "Kabul edildi · 82.5 kg" / "Değiştirildi · 80 kg" / "Yok sayıldı"; prefill buna göre güncellenir. |
| Süresi dolmuş | `expires_at_utc < now` | Kart gösterilmez; `decision_action` NULL kalır (bkz. Tutarsızlık #19). |

**Akış**

1. Öneri A.4 bitirme transaction'ında `ProgressionEngine` tarafından üretilir (yalnızca `set_logs` bulunan hareketler için, R103.5); `proposed_json` `roundToAvailable` ile kullanılabilir değere yuvarlanmıştır; yuvarlama mevcut yükle aynıysa `kind='repIncrease'` üretilir (R100.3–R100.5, AT-08). Assisted türde öneri `assistanceKg` azaltma olarak somutlaşır (R101.3, AT-09).
2. Sonraki oturumda hareket odağa geldiğinde kart görünür.
3. **Kabul** → `decision_action='accepted'`, `decision_value_json = proposed_json`, `decided_at_utc`, `applied_session_id=<aktif oturum>`; prefill "önerilen" rozetiyle önerilen değere geçer.
4. **Değiştir** → stepper → Kaydet → `decision_action='modified'`, `decision_value_json=<kullanıcı değeri>`; prefill kullanıcı değerine geçer, rozet "önerilen" yerine "senin değerin" (öneri).
5. **Yok say** → `decision_action='ignored'`; prefill kaynak 2'ye (son antrenman) döner.
6. Karar verilmeden ilk working set tamamlanırsa öneri `ignored` olarak kapanır ve `decision_value_json` loglanan değeri taşır (kullanıcı tercihini kaydeder, R121.3; bkz. Tutarsızlık #19).
7. Sonraki öneriler önceki kararları girdi olarak alır (sürekli "yok say" → daha muhafazakâr) (02 §9.6).

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `reco.kind.loadIncrease` | Ağırlığı artır | 01 R122.2 |
| `reco.kind.holdLoad` | Ağırlığı koru | (öneri) |
| `reco.kind.loadDecrease` | Ağırlığı azalt | (öneri) |
| `reco.kind.repIncrease` | Tekrar hedefini artır | (öneri; R100.5) |
| `reco.kind.deload` | Deload düşün | (öneri; R104.6) |
| `reco.kind.substitution` | Hareket değişikliği öner | (öneri) |
| `reco.kind.volumeIncrease` | Set ekle (+{delta}) | (öneri; R105.4) |
| `reco.kind.volumeHold` | Hacmi koru | (öneri) |
| `reco.kind.nutritionHold` | Kaloriyi değiştirme | 01 R122.2 |
| `reco.proposed.load` | Bir sonraki antrenmanda {load} kg öneriyoruz. | 01 R121.2 |
| `reco.proposed.assistance` | Yardımı {assistanceKg} kg'a düşür | (öneri; R101.3) |
| `reco.proposed.reps` | Hedef tekrar: {reps} | (öneri) |
| `reco.rationale.example` | Son antrenmanda 3/3 sette 12 tekrar yaptın ve RIR hedefinin içinde kaldın. | 01 R122.2 (`rationale_tr` örneği) |
| `reco.why` | Neden önerildi? | 01 R105.5 |
| `reco.accept` | Kabul | 02 §9.6 |
| `reco.modify` | Değiştir | 02 §9.6 |
| `reco.ignore` | Yok say | 02 §9.6 |
| `reco.modify.save` | Kaydet | (öneri) |
| `reco.decided.accepted` | Kabul edildi · {value} | (öneri) |
| `reco.decided.modified` | Değiştirildi · {value} | (öneri) |
| `reco.decided.ignored` | Yok sayıldı | (öneri) |
| `reco.estimateBadge` | tahmin | 01 R123.4 |
| `reco.userValueBadge` | senin değerin | (öneri) |

**Servis / DB etkileri**

| Eylem | Servis | Yazılan |
|---|---|---|
| Üretim | `ProgressionEngine`, `VolumeGuardrails`, `RecommendationService` | `recommendations` INSERT (`kind`, `exercise_id`/`muscle`/`session_exercise_id`, `proposed_json`, `rationale_tr`, `evidence_json`, `is_estimate`, `created_at_utc`, `expires_at_utc`). |
| Kabul / Değiştir / Yok say | `RecommendationService.decide()` | `recommendations.decision_action`, `decision_value_json`, `decided_at_utc`, `applied_session_id`; `command_log`. |
| Prefill | `ActiveSessionService` | Yalnızca okuma (`recommendations` → `draft_*` başlangıç değeri). |

**Gereksinimler:** R100.3–R100.5, R101.3, R103.5, R105.3–R105.5, R121.1–R121.3, R122.1–R122.3, R123.4, AT-07, AT-08, AT-09.

---

### A.8 Plateau insight ekranı

**Amaç:** 3 ardışık exposure boyunca ilerleme olmayan hareket için (R104.2) programı değiştirmeden, sıralı bir kontrol listesiyle **insight** vermek (R104.3, R104.4) ve her olası aksiyonu kullanıcı onayına bırakmak (R104.7).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | `plateau_insights(status='open')` yok | Giriş kartı gösterilmez (Ana ekran / A.4 özeti). Tek kötü antrenman insight üretmez (R104.1). |
| Yükleniyor | Checklist verileri (`sleep_logs`, `check_ins`, `meal_entries`, `rest_timers`) toplanıyor | Başlık + skeleton liste. |
| Hata | Okuma hatası | Ekran `ErrorBoundary`; insight satırı DB'de durur. |
| Normal · open | `status='open'` | Başlık, 3 exposure tablosu, sıralı checklist, öneriler, **Anladım** / **Yok say**. |
| Normal · acknowledged | `status='acknowledged'` | Aynı ekran; checklist işaretleri korunur; **Çözüldü olarak işaretle** görünür. |
| Normal · resolved / dismissed | `status ∈ {'resolved','dismissed'}` | Salt okunur geçmiş görünümü; `resolution_note`. |

**Akış**

1. A.4 bitirme transaction'ında `PlateauEngine` `exposures[-3..]` üzerinde koşulları sağlarsa `plateau_insights` INSERT (`exercise_id`, `side`, `exposure_session_ids_json`, `checklist_json`, `suggestions_json`, `status='open'`). Teknik/ağrı bayrağı olan exposure'lar plato saymaz (02 §9.2).
2. Giriş: A.4 özetinde ve Ana ekranda "Plato işareti: {exerciseNameTr}" kartı → bu ekran.
3. Üst blok: hareket adı, 3 exposure tarihi ve her biri için en iyi set (`effective_load × reps @ RIR`); açıklama metni "3 ardışık antrenmanda yük, tekrar ve RIR ilerlemedi. Tek kötü antrenman değil." (öneri).
4. **Sıralı checklist** (`checklist_json`, R104.4 sırası sabittir, yeniden sıralanamaz):

   | # | Anahtar | Etiket (öneri) | Veri kaynağı | Durum ikonu |
   |---|---|---|---|---|
   | 1 | `recovery` | Toparlanma | `check_ins` son 7 gün (`soreness`, `energy`, `stress`) | ok / dikkat / veri yok |
   | 2 | `sleep` | Uyku | `sleep_logs` son 7 gün ort. vs `training_profiles.sleep_target_hours` | |
   | 3 | `adherence` | Kalori / protein uyumu | `meal_entries` snapshot toplamları vs `nutrition_targets` (son 7 gün %) | |
   | 4 | `rirAccuracy` | RIR doğruluğu | Son 3 exposure `set_logs.rir` dağılımı vs `target_rir` | |
   | 5 | `technique` | Teknik | `form_breakdown_flag` / `pain_flag` sayısı, hareket notları | |
   | 6 | `rest` | Dinlenme süresi | `rest_timers` gerçek süre (`skipped` dahil) vs `session_exercises.rest_seconds` | |
   | 7 | `suitability` | Hareket uygunluğu | `SubstitutionEngine.alternatives()` ilk 3 aday + `pain_areas_json` cezası | |

   Her madde: ilgili veri özeti ("Son 7 gün uyku ort. 6 sa 20 dk / hedef 7,5 sa") ve kullanıcı için "Kontrol ettim" onay kutusu (`checklist_json[i].checked`). Veri yoksa "Veri yok — {kayıt ekranı}" bağlantısı.
5. **Öneriler** (`suggestions_json`, R104.6): `sameLoad`, `repTargetAdjust`, `substitution`, `deload`. Her biri gerekçeli; **Uygula** → aynı hareket için `recommendations` INSERT (`kind` eşlemesi: `sameLoad→'holdLoad'`, `repTargetAdjust→'repIncrease'`, `substitution→'substitution'`, `deload→'deload'`) — yani yalnızca A.7 kartı üretilir, hiçbir şey otomatik uygulanmaz (R104.3, R104.7). "+5 set" gibi agresif seçenek yoktur (R104.5); hacim önerisi haftada +1–2 set sınırına tabidir (R105.4).
6. **Anladım** → `status='acknowledged'`. **Yok say** → `status='dismissed'`, `resolved_at_utc`. **Çözüldü olarak işaretle** → `resolution_note` (opsiyonel) → `status='resolved'`. Sonraki exposure'da ilerleme görülürse `PlateauEngine` insight'ı otomatik `resolved` yapar (`resolution_note='autoProgress'`).

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `plateau.entry` | Plato işareti: {exerciseNameTr} | (öneri) |
| `plateau.title` | Plato incelemesi · {exerciseNameTr} | (öneri) |
| `plateau.explain` | 3 ardışık antrenmanda yük, tekrar ve RIR ilerlemedi. Tek kötü antrenman değil. | (öneri; R104.1, R104.2) |
| `plateau.checklist.title` | Sırayla kontrol et | (öneri; R104.4) |
| `plateau.checklist.checked` | Kontrol ettim | (öneri) |
| `plateau.checklist.noData` | Veri yok | (öneri) |
| `plateau.suggest.sameLoad` | Aynı yükle devam | (öneri; R104.6 "same load strategy") |
| `plateau.suggest.repTargetAdjust` | Tekrar hedefini ayarla | (öneri; "rep target adjustment") |
| `plateau.suggest.substitution` | Küçük hareket değişikliği | (öneri; "small exercise substitution") |
| `plateau.suggest.deload` | Deload düşün | (öneri; "deload consideration") |
| `plateau.suggest.apply` | Uygula (öneri olarak ekle) | (öneri) |
| `plateau.noAuto` | Program senin onayın olmadan değişmez. | (öneri; R104.7) |
| `plateau.ack` | Anladım | (öneri) |
| `plateau.dismiss` | Yok say | 02 §9.6 |
| `plateau.resolve` | Çözüldü olarak işaretle | (öneri) |

**Servis / DB etkileri**

| Eylem | Servis | Yazılan |
|---|---|---|
| Tespit | `PlateauEngine` (bitirme tx) | `plateau_insights` INSERT. |
| Checklist işareti | — | `plateau_insights.checklist_json` UPDATE. |
| Uygula | `RecommendationService` | `recommendations` INSERT (`kind` eşlemesi yukarıda, `rationale_tr` insight gerekçesi, `evidence_json.setLogIds` = 3 exposure'ın setleri). |
| Anladım / Yok say / Çözüldü | — | `plateau_insights.status`, `resolution_note`, `resolved_at_utc`. |

**Gereksinimler:** R99.4, R104.1–R104.7, R105.4, R122.1–R122.3.

---

### A.9 Program dondurma / devam ettirme (Program Settings)

**Amaç:** Hastalık, seyahat vb. durumlarda antrenman sırasını ve kaçırılan uyarılarını durdurmak, takvimi seçilen moda göre hesaplamak (R89.1–R89.8).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | Açık program yok | Ekran yalnızca "Programı başlat" gösterir. |
| Yükleniyor | `programs` + `program_pauses` okunuyor / komut yazılıyor | Butonlar `disabled`. |
| Hata | `DbWriteError` / `ux_programs_one_open` ihlali | Hata çubuğu + Yeniden dene. |
| Normal · active | `programs.status='active'` | Program adı, `start_date_key`, Day X / 90, takvim modu seçici, **Programı Dondur**. Aktif `workout_sessions` varsa buton `disabled` + açıklama (bkz. Tutarsızlık #12). |
| Normal · dondur alt sayfası | "Programı Dondur"a basıldı | Sebep çipleri (opsiyonel): `illness` Hastalık · `travel` Seyahat · `injury` Sakatlık · `work` İş · `personal` Kişisel · `other` Diğer; not alanı; **Dondur**. |
| Normal · paused | `programs.status='paused'` | Band: "Program dondurulmuş · {reasonLabel} · {n} gündür"; **Programı Devam Ettir**; takvim modu seçici açık kalır. |
| Normal · completed / abandoned | `status ∈ {'completed','abandoned'}` | Salt okunur özet. |

**Akış — dondurma**

1. **Programı Dondur** → alt sayfa → (opsiyonel sebep, not) → **Dondur** → `PauseService.pause(reason?)`: tek transaction `programs.status='paused'`; `program_pauses` INSERT (`reason`, `note`, `started_at_utc`, `start_date_key=todayKey`, `time_zone`).
2. Etkiler: `Scheduler.ensurePlanned` hiçbir şey yapmaz; `missed` türetimi susar (`programs.status='active'` şartı); Ana ekran öncelik 2 bandı; açık `planned` satır `planned_date_key` korunarak bekler (02 §6.5). Beslenme/ölçüm/uyku girişleri serbesttir.
3. Takvim: `strictCalendar` modunda Day X ilerlemeye devam eder; `activeDays` modunda dondurma günleri düşülür (başlangıç günü dahil, devam günü hariç) (R89.5).

**Akış — devam ettirme**

1. **Programı Devam Ettir** → `PauseService.resume()`: tek transaction `programs.status='active'`; `program_pauses` UPDATE `ended_at_utc`, `end_date_key=todayKey`; açık `planned` satır `planned_date_key < today` ise `reschedule(today | ilk uygun gün)` (`reschedule_reason='resume'`, sıra aynı, R89.4); `Scheduler.ensurePlanned(today)`.
2. Ana ekran sıradaki antrenman kartına döner; hiçbir antrenman sessizce atlanmamıştır (R89.7).

**Akış — takvim modu**

1. Seçici: **Strict 90 calendar days** (varsayılan, R89.6) / **Active 90 days**; her seçeneğin altında kısa açıklama ve canlı önizleme "Bugün: Day {strict} → Day {active}".
2. Değişiklik → `programs.calendar_mode` UPDATE + `settings_history` INSERT (`key='program.calendarMode'`, `old_value_json`, `new_value_json`); Day X anında yeniden türetilir, geçmiş bozulmaz (R89.5, R89.8).

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `program.pause.button` | Programı Dondur | 01 R89.1 |
| `program.pause.reason.title` | Sebep (isteğe bağlı) | (öneri; R89.2) |
| `program.pause.reason.illness` | Hastalık | (öneri; `'illness'`) |
| `program.pause.reason.travel` | Seyahat | (öneri; `'travel'`) |
| `program.pause.reason.injury` | Sakatlık | (öneri; `'injury'`) |
| `program.pause.reason.work` | İş | (öneri; `'work'`) |
| `program.pause.reason.personal` | Kişisel | (öneri; `'personal'`) |
| `program.pause.reason.other` | Diğer | (öneri; `'other'`) |
| `program.pause.note` | Not | (öneri) |
| `program.pause.confirm` | Dondur | (öneri) |
| `program.pause.hint` | Dondurma süresince antrenman sırası ilerlemez ve kaçırılan antrenman uyarısı gösterilmez. | (öneri; R89.3) |
| `program.pause.blockedByActive` | Önce devam eden antrenmanı bitir veya iptal et. | (öneri) |
| `program.paused.banner` | Program dondurulmuş · {reasonLabel} · {n} gündür | (öneri) |
| `program.resume.button` | Programı Devam Ettir | (öneri; R89.4) |
| `program.mode.title` | Takvim modu | (öneri) |
| `program.mode.strict` | Strict 90 calendar days | 01 R89.5 |
| `program.mode.strict.hint` | Dondurma günleri de sayılır. | (öneri; R89.5 A) |
| `program.mode.active` | Active 90 days | 01 R89.5 |
| `program.mode.active.hint` | Dondurma günleri sayılmaz. | (öneri; R89.5 B) |
| `program.mode.preview` | Bugün: Day {strict} → Day {active} | (öneri) |

**Servis / DB etkileri**

| Eylem | Servis | Yazılan |
|---|---|---|
| Dondur | `PauseService.pause(reason?)` | `programs.status='paused'`, `updated_at_utc`; `program_pauses` INSERT. |
| Devam ettir | `PauseService.resume()` | `programs.status='active'`; `program_pauses.ended_at_utc`, `end_date_key`; gerekiyorsa `scheduled_workouts` reschedule çifti (`reschedule_reason='resume'`); `Scheduler.ensurePlanned`. |
| Mod değişimi | Program repository | `programs.calendar_mode`; `settings_history` INSERT. |
| Day X hesabı | `ChallengeCalendar.challengeDay(clock)` | Yalnızca okuma (`program_pauses` aralıklarından `pausedDays`). |

**Gereksinimler:** R88.2, R88.8, R89.1–R89.8, AT-04, AT-05.

---

### A.10 Reschedule tarih seçici

**Amaç:** Planlanan antrenmanın tarihini sırayı değiştirmeden taşımak ve taşıma geçmişini saklamak (R88.5, R88.7). Kullanan akışlar: A.2 **Başka güne taşı** (`'moveToDate'`), A.4 **Kalanı sonraki güne taşı** (`'partialContinuation'`), sıradaki antrenman kartı "Tarihi değiştir" (öneri; `'moveToDate'`). `resume()` taşıması UI'sız otomatiktir (`'resume'`).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|---|---|---|
| Boş | Taşınacak açık plan yok | Modal açılmaz. |
| Yükleniyor | Reschedule komutu yazılıyor | **Taşı** `disabled`. |
| Hata | `DbWriteError` / `ux_sched_one_open` ihlali (eski satır önce `rescheduled` yapılmadıysa) | Hata çubuğu + Yeniden dene; plan değişmemiştir. |
| Normal | Açık plan var | Ay görünümü takvim: bugün vurgulu; `preferred_workout_days_json` günleri işaretli; geçmiş günler `disabled` (bugün hariç); dondurma aralıkları gölgeli ve `disabled`; program bitişinden (`start_date_key + duration_days`, `activeDays` modunda dondurma günleri eklenerek) sonraki günler uyarılı; gelecek antrenmanlar **öngörü** olarak gri gösterilir. Altında seçilen tarih ve **Taşı** / **Vazgeç**. |

**Akış**

1. Modal açılır; varsayılan seçim: A.2'de bugünden sonraki ilk tercih edilen gün, A.4'te yarından itibaren ilk tercih edilen gün.
2. Kullanıcı gün seçer; alt bilgi "Bu antrenman {date} tarihine taşınacak; sıra değişmeyecek." (öneri).
3. **Taşı** → `reschedule(date)`: tek transaction, **önce** eski satır `status='rescheduled'`, `rescheduled_to_id`, `reschedule_reason`, `resolved_at_utc`; **sonra** yeni satır `status='planned'`, aynı `sequence_index`, aynı `workout_template_id`, `planned_date_key=<date>`, `rescheduled_from_id`, `remaining_exercise_ids_json` (varsa) (03 §1.5 sıra notu). `programs.training_sequence_index` değişmez (R88.7).
4. Modal kapanır; çağıran ekran güncellenir (A.2 kartı kaybolur, A.4 bitirme tamamlanır).
5. Taşıma geçmişi program takviminde zincir olarak görünür ("2 kez taşındı": `rescheduled_from_id` zinciri) (R88.7, AT-05).

**Türkçe metinler**

| Anahtar | Metin | Kaynak |
|---|---|---|
| `reschedule.title` | Tarih seç | (öneri) |
| `reschedule.hint` | Bu antrenman {date} tarihine taşınacak; sıra değişmeyecek. | (öneri; R88.7) |
| `reschedule.preferredDay` | Tercih ettiğin gün | (öneri) |
| `reschedule.pausedDay` | Program dondurulmuş | (öneri) |
| `reschedule.afterEnd` | 90 günlük takvimin dışında | (öneri) |
| `reschedule.forecast` | öngörü | 02 §6.2 |
| `reschedule.confirm` | Taşı | (öneri) |
| `reschedule.cancel` | Vazgeç | (öneri) |
| `reschedule.historyCount` | {n} kez taşındı | (öneri) |

**Servis / DB etkileri**

| Eylem | Servis | Yazılan |
|---|---|---|
| Taşı | `Scheduler` / `MissedWorkoutResolver` → `reschedule(date)` | `scheduled_workouts` UPDATE (eski) + INSERT (yeni), `reschedule_reason ∈ {'moveToToday','moveToDate','resume','partialContinuation'}`; `command_log`. Sıra ve `sequence_events` **dokunulmaz**. |
| Takvim çizimi | `ChallengeCalendar`, `program_pauses`, `training_profiles.preferred_workout_days_json` | Yalnızca okuma. |

**Gereksinimler:** R88.5, R88.7, R89.3, R103.3, R112.3, AT-05.

---

### Tutarsızlık / açık nokta

1. **`set_logs.set_index` × UNIQUE kısıtı (03 §1.6):** Kolon yorumu "warmup ve working ayrı sayılır" (her biri 1'den başlar) derken `UNIQUE (session_exercise_id, set_index, side)` `set_type` içermiyor → warmup #1 ile working #1 çakışır. Bu belge `set_index`'i hareket içinde tek artan sayaç kabul etti; ya yorum düzeltilmeli ya UNIQUE'e `set_type` eklenmeli.
2. **`cancelSession()` sonucu:** 02 §6.3 FSM aynı `scheduled_workouts` satırını `planned`'a döndürüyor; 03 ise `reschedule_reason='cancelSession'` değeriyle "eski satır rescheduled + yeni planned" çiftini ima ediyor. Belge 02'yi izledi (yerinde UPDATE); enum değeri ya kullanılmalı ya kaldırılmalı.
3. **`ended_reason='resumeCardFinish'` × `allDone`/`finishHereToday`:** Resume kartından bitirmede hangi değerin yazılacağı 02'de belirtilmemiş. Belge `resumeCardFinish` yazıp tam/kısmi ayrımını `workout_sessions.status`'a bıraktı; onay gerekir.
4. **Prefill sırası (02 §7.3):** (2) "son oturumda aynı set indeksi" (3) `Recommendation`'dan önce geliyor → kabul edilen 82.5 kg önerisi ilk sette her zaman son oturumun 80 kg değeriyle gölgelenir (R121.2 ile çelişir). Belge ilk working set için kararı `accepted`/`modified` olan öneriyi öne aldı; 02 güncellenmeli.
5. **Durum adları:** `workout_sessions.status='partial'` ile `scheduled_workouts.status='partiallyCompleted'` aynı kavram için iki yazım. Bilinçliyse belgelenmeli; değilse birleştirilmeli.
6. **`Scheduler.ensurePlanned(today)` "bugünden itibaren":** Antrenman bitirilir bitirilmez sıradaki plan yine bugüne düşebilir (bugün tercih edilen günse). Belge Ana ekranda "Bugün tamamlandı + öngörü" gösterdi; `ensurePlanned` aynı gün `completed`/`partial` oturum varsa en erken yarını seçmeli (02 §6.2 netleştirilmeli).
7. **Kaçırılan kart "kapatılabilir" (02 §6.4):** Gizleme bilgisinin nerede saklanacağı tanımsız. Belge `settings` anahtarı `missedCard.dismissedDateKey` önerdi.
8. **PR geri alma:** İptal edilen oturumda `set_logs.discarded=1` yapılıyor ama o oturumda yazılmış `personal_records` satırları için geri alma tanımlı değil; aynı boşluk sonradan **Exclude from PR** işaretleme ve `editSet` (değer küçültme) için de geçerli. `PrDetector` yalnızca commit anında çalışıyor (02 §9.5). Bir `revokePr()` adımı ve `superseded_by_id` zincirinin onarımı tanımlanmalı.
9. **`plateau_insights.suggestions_json` × `recommendations.kind`:** `sameLoad | repTargetAdjust | substitution | deload` ile `kind` listesi birebir örtüşmüyor (`repTargetAdjust` karşılığı yok; `plateauReview` türünün ne zaman üretileceği tanımsız). Belge bir eşleme önerdi (A.8 adım 5).
10. **Set loglandıktan sonra Hareketi Değiştir:** 02 §7.1 `session_exercises.exercise_id` UPDATE diyor; ancak mevcut `set_logs.exercise_id` eski hareketi gösterdiğinden geçmiş tutarsızlaşır. Belge "set yoksa yerinde, varsa yeni `session_exercises` satırı + eski `skipped`" kuralını koydu; karar 02'ye işlenmeli.
11. **Hareket ortasında `tracking_mode` geçişi:** Aynı `session_exercise` altında `side='both'` ve `side='left'/'right'` satırları karışabilir; taraf bazlı PR/plateau bunu nasıl ele alır tanımsız. Belge geçişi yalnızca sonraki set indekslerine uyguladı; motorlar `both`'u iki taraf için de saymalı.
12. **Aktif oturum varken dondurma:** 02 §6.5 `pause()` aktif `workout_sessions` durumunu ele almıyor (`scheduled_workouts.status='inProgress'` dondurma sırasında ne olur?). Belge "Programı Dondur"u aktif oturum varken devre dışı bıraktı.
13. **Program tamamlanması:** `challengeDay` 90'a ulaştığında `programs.status='completed'` / `completed_at_utc` yazan bir bileşen 02/03'te yok (AT-20 Day 90 raporu buna dayanır). Tetikleyici (gün geçişi mi, son antrenman mı, kullanıcı onayı mı) tanımlanmalı.
14. **`calendar_mode` → `settings_history`:** `calendar_mode` `programs` kolonu, `settings` anahtarı değil; `settings_history.key` için sözleşme yok. Belge `key='program.calendarMode'` önerdi.
15. **`sequence_events.cause='manualAdjust'`:** 03'te var, 02'de buna karşılık gelen bir UI/servis (sıra düzeltme) tanımlı değil.
16. **Kısmi devam zinciri ve adherence:** Devam planı (`partialContinuation`) tekrar kısmi bitebilir (sınırsız zincir); ayrıca aynı `sequence_index` için iki `workout_sessions` (`partial` + `completed`) oluşur — `AdherenceCalculator.week` sayımının oturum mu plan (`scheduled_workouts`) bazında mı olduğu netleştirilmeli (R103.4, AT-06).
17. **`remaining_exercise_ids_json` tüketimi:** 02 §7.1 `session_exercises` satırlarının "şablondan" oluşturulduğunu söylüyor; devam planında yalnızca kalan hareketlerin (şablon sırası/hedefleriyle) ekleneceği belirtilmemiş. Belge bunu A.1/A.4'te tanımladı.
18. **`calendar_date_key` düzenleme aralığı (R113.4):** 02 sınır vermiyor. Belge `started_at` yerel tarihi − 1 … bugün aralığını önerdi.
19. **Öneri süresi dolması ve örtük karar:** `recommendations.expires_at_utc` dolduğunda veya kullanıcı karar vermeden set tamamladığında ne yazılacağı 02'de yok. Belge "karar verilmeden ilk working set → `ignored` + loglanan değer" kuralını önerdi.
20. **"Neden?" × "Neden önerildi?":** Görev özeti "Neden?" derken 01 R105.5 metni "Neden önerildi?"; belge 01'i kullandı.
21. **`separate` modda rest timer başlangıcı:** Her taraftan sonra mı, iki taraf bitince mi tanımsız; belge "ikinci taraf tamamlanınca" dedi.
22. **`workout_sessions.bodyweight_kg_snapshot` kaynağı:** Oturum başında hangi `weight_logs` kaydının alınacağı (en güncel? kaç gün eski olabilir?) 02'de yok; belge "en güncel `weight_logs`" varsaydı.


---

## B. Ayarlar, ölçüm, beslenme, veri ve hata akışları

> **Kapsam:** Bu bölüm aktif antrenman, program takvimi ve kaçırılan antrenman akışları dışındaki ekranları tanımlar (bunlar Bölüm A'dadır). Tablo/kolon/servis/enum isimleri `02-architecture.md` ve `03-data-model.md` ile birebirdir; UI metinleri `01-specification.md` ve `02-architecture.md`'de geçenlerle aynen kullanılır. Her ekran için durumlar **boş / yükleniyor / hata / normal** sırasıyla verilir; ekranın gerektirdiği ek durumlar tabloya eklenir.

### B.0 Bölüm geneli kurallar

| Kural | Uygulama | Kaynak |
|-------|----------|--------|
| Bilinmeyen değer `0` değildir | `NULL` olan her ölçüm/sağlık değeri için sayı yerine "ekle" CTA'sı gösterilir; `0 cm` / `0 kg` hiçbir kartta basılmaz. | R119.3, R96.3, AT-12 |
| Her kullanıcı eylemi tek transaction | Bu bölümdeki her kaydetme `db.withTransaction(async tx => …)` içinde, `command_id` ile (`command_log`) idempotent yazılır; "Yeniden dene" aynı `commandId`'yi tekrar gönderir, çift kayıt oluşmaz. | R90.7, R117.4, 02 §3, §15 |
| Yükleniyor durumu kısa sürer | SQLite yereldir; skeleton yalnızca ilk `hydrate()` sırasında gösterilir, spinner'lı ekran bekletmesi yoktur. | 02 §7.1 |
| Yazma hatası tek metinle | `DbWriteError` → satır içi/toast: **"Kaydedilemedi. Boş alanı kontrol et."** + **Yeniden dene**. Form içeriği korunur. | R117.3, 02 §15 |
| Tahmini metrik rozeti | `isEstimate: true` taşıyan her değer bileşen tarafından otomatik **"tahmin"** rozetiyle basılır. | R123.4, 02 §9.7 |
| Türkçe ve anlaşılır | Teknik ayrıntı (hata sınıfı, kod) yalnızca **"Ayrıntılar"** açılır alanında gösterilir. | R117.5 |
| Beyaz ekran yok | Her ekran, ekran düzeyi `ErrorBoundary` ile sarılır; kök `ErrorBoundary` DB/ağ bağımlılığı olmadan render edilir. | R117.1, R117.2 |
| Gün geçişi | Dashboard ve beslenme günlüğü `DayRolloverObserver`'ın `DAY_CHANGED` olayına abonedir; gece yarısı açık kalan ekran yeni güne geçer. | R112.5, 02 §5.4 |

**Settings ana menüsü ve bu belgede karşılığı**

| Settings girişi | Nerede |
|-----------------|--------|
| Program Settings (**"Programı Dondur"**, `calendar_mode`) | Bölüm A |
| **Gym Equipment** | B.5 |
| **Face ID / Touch ID / Biometric Lock** ve Gizlilik | B.6 |
| Yedekleme (dışa aktar / içe aktar / geri al) | B.7, B.8 |
| Bildirimler (`notifications.restTimer`) | Bölüm A (rest timer) |
| Birimler (`units.weight`) | v1'de yalnızca `kg`; ekran yok |

---

### B.1 Onboarding – Training Profile

**Amaç:** R120.1'deki bilgileri toplamak. Bu bilgiler V90 program şablonunu **değiştirmez**; yalnızca ekipman ön-seçimi, substitution filtresi, planlama günü, bildirim saati ve recovery yorumunu iyileştirir (R120.2, 02 §11.4).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | `profiles` satırı yok veya `onboarding_completed = 0` ve `training_profiles` yok | Adım 1'den başlar; ilerleme çubuğu "1 / 6". |
| Yükleniyor | Uygulama açılışında `Onboarding.resume()` DB'den kaldığı adımı okur | Splash'ta beklenir, ayrı ekran yoktur (< 100 ms). |
| Hata | `DbWriteError` (adım kaydı yazılamadı) | Adım ekranında kalınır; "Kaydedilemedi. Boş alanı kontrol et." + Yeniden dene (aynı `commandId`). |
| Normal | Adımlar sırayla | İleri/Geri; her adım kaydedildikten sonra ilerlenir. |
| Yarım kalmış | `profiles.onboarding_completed = 0` ve `training_profiles` var | Uygulama yeniden açıldığında ilk doldurulmamış adımdan devam edilir; hiçbir adım yeniden sorulmaz. |

**Akış**

1. `profiles` INSERT (`id`, `created_at_utc`, `updated_at_utc`, `onboarding_completed = 0`).
2. **Adım 1 – Deneyim:** `experience ∈ {'beginner','intermediate','advanced'}` (tek seçim, zorunlu).
3. **Adım 2 – Salon tipi:** `gym_type ∈ {'fullCommercialGym','homeGym','limitedGym'}` (tek seçim, zorunlu). Bu adım tamamlanınca `training_profiles` satırı ilk kez yazılır (`experience` ve `gym_type` `NOT NULL` olduğundan daha önce yazılamaz).
4. **Adım 3 – Tipik antrenman süresi:** `typical_workout_minutes` (15–240, `NumericStepper`, adım 5, varsayılan 60). Boş bırakılabilir → `NULL`.
5. **Adım 4 – Tercih edilen antrenman günleri:** 0–6 gün chip'leri (0 = Pazar … 6 = Cumartesi) → `preferred_workout_days_json`. En az bir gün önerilir; hiç seçilmezse `[]` yazılır ve `Scheduler` her günü uygun sayar.
6. **Adım 5 – Uyku hedefi:** `sleep_target_hours` (4–12, adım 0.5, varsayılan 8). Boş → `NULL`.
7. **Adım 6 – Ağrı / sakatlık bölgeleri (opsiyonel):** `Joint` chip'leri (`shoulder`, `elbow`, `wrist`, `lowerBack`, `hip`, `knee`, `ankle`) → `pain_areas_json`. "Yok" varsayılan.
8. Her adımda "İleri" → `training_profiles` UPSERT (tek transaction) → sonraki adım. Ardından B.2'ye geçilir.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `onboarding.training.title` | Antrenman profilin |
| `onboarding.training.subtitle` | Bu bilgiler programı değiştirmez; önerileri ve planlamayı sana göre ayarlar. |
| `onboarding.training.experience.title` | Antrenman deneyimin |
| `onboarding.training.experience.beginner` | Yeni başlayan |
| `onboarding.training.experience.intermediate` | Orta seviye |
| `onboarding.training.experience.advanced` | İleri seviye |
| `onboarding.training.gymType.title` | Nerede antrenman yapıyorsun? |
| `onboarding.training.gymType.fullCommercialGym` | Tam donanımlı salon |
| `onboarding.training.gymType.homeGym` | Ev salonu |
| `onboarding.training.gymType.limitedGym` | Sınırlı ekipmanlı salon |
| `onboarding.training.minutes.title` | Bir antrenmana genelde kaç dakika ayırıyorsun? |
| `onboarding.training.minutes.hint` | 15–240 dakika. Program şablonu bundan uzunsa uyarı alırsın. |
| `onboarding.training.days.title` | Hangi günler antrenman yapmak istersin? |
| `onboarding.training.days.hint` | Sıradaki antrenman bu günlerden ilk uygun olana planlanır. |
| `onboarding.training.sleep.title` | Uyku hedefin (saat) |
| `onboarding.training.pain.title` | Şu an ağrı ya da sakatlığın olan bölge var mı? |
| `onboarding.training.pain.none` | Yok |
| `onboarding.training.pain.hint` | Seçtiğin bölgeleri zorlayan hareketler alternatif listesinde geriye alınır. |
| `common.next` | İleri |
| `common.back` | Geri |
| `common.skip` | Atla |
| `error.dbWrite` | Kaydedilemedi. Boş alanı kontrol et. |
| `common.retry` | Yeniden dene |

**Servis / DB etkileri**

- `domain/profile/Onboarding`, `TrainingProfile`.
- `profiles` INSERT; `training_profiles` UPSERT (`experience`, `gym_type`, `typical_workout_minutes`, `preferred_workout_days_json`, `sleep_target_hours`, `pain_areas_json`, `updated_at_utc`).
- Tüketiciler (02 §11.4): `gym_type → EquipmentProfile preset` (B.4), `preferred_workout_days_json → Scheduler.ensurePlanned`, `pain_areas_json → SubstitutionEngine` (−25 · jointStress cezası), `sleep_target_hours → recovery değerlendirmesi`, `typical_workout_minutes → workout_templates.estimated_minutes` ile süre uyarısı.

**Gereksinimler:** R120.1, R120.2, R98.3, R117.3.

---

### B.2 Onboarding – Başlangıç değerleri onayı

**Amaç:** `data/initial-profile.json` içindeki Bölüm I değerlerini (R119.1) kullanıcıya göstermek; yalnızca **onaylarsa** ve yalnızca **ilk çalıştırmada** `seedInitialProfile()` ile yazmak (02 §11.3). Bilinmeyen alanlar `NULL` kalır; `0` asla yazılmaz (R119.3).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | İlk çalıştırma, `body_measurements` ve `weight_logs` boş, `profiles.height_cm IS NULL` | İki seçenekli giriş: "Önceden girilmiş değerleri kullan" / "Kendim gireceğim". |
| Yükleniyor | `initial-profile.json` bundle'dan okunur | Anlık; ekran yok. |
| Hata | Zod reddi (0, negatif, > 300 cm, > 400 kg) | Alan altında hata; "İleri" pasif. `DbWriteError` → B.0 kuralı. |
| Normal | Değerler tabloda düzenlenebilir | Biceps satırı "Bilinmiyor – sonraki adımda" olarak kilitli gösterilir. |
| Tekrar ziyaret | `seedInitialProfile()` daha önce çalıştı | Bu adım bir daha gösterilmez; değerler Ölçüm ekleme (B.9) üzerinden düzenlenir. |

**Akış**

1. Ekran açılır; `initial-profile.json` değerleri tabloda listelenir: Boy 187 cm, Kilo 107 kg, Bel 95 cm, Karın 114 cm, Omuz 137 cm, Kalça 119 cm, Göğüs 110 cm, Ön kol 37 cm. Flexed biceps satırı: **UNKNOWN** → "Bilinmiyor – sonraki adımda" (R119.2).
2. **"Önceden girilmiş değerleri kullan"** → tablo düzenlenebilir hâlde onay bekler; her hücre `NumericStepper`, silinen hücre `NULL` olur.
3. **"Kendim gireceğim"** → tablo boş açılır; her alan opsiyoneldir. Boş bırakılan alan **yazılmaz** (`NULL`), `0` girişi Zod tarafından reddedilir (`cm: z.number().positive().max(300).nullable()`, R119.4).
4. "Onayla ve devam et" → tek transaction:
   - `profiles.height_cm = 187`.
   - `weight_logs` INSERT (`weight_kg = 107`, `measured_at_utc = now`, `local_date_key = clock.todayKey()`, `time_zone`, `note = 'onboarding'`).
   - Her cm değeri için `body_measurements` INSERT: `site ∈ {'waist','abdomen','shoulder','hip','chest','forearm'}`, `final_value_cm`, `aggregation = 'single'`, `is_baseline = 1`, `local_date_key = todayKey`, `note = 'onboarding'`. `measurement_samples`'a `sample_index = 1` ile tek örnek yazılır (R97.5).
   - Biceps için hiçbir satır yazılmaz.
5. B.3'e geçilir.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `onboarding.initial.title` | Başlangıç değerlerin |
| `onboarding.initial.subtitle` | Bu değerler Day 90 raporunda başlangıç olarak kullanılır. Kontrol et, gerekirse düzelt. |
| `onboarding.initial.usePrefilled` | Önceden girilmiş değerleri kullan |
| `onboarding.initial.enterMyself` | Kendim gireceğim |
| `onboarding.initial.row.height` | Boy (cm) |
| `onboarding.initial.row.weight` | Kilo (kg) |
| `onboarding.initial.row.waist` | Bel (cm) |
| `onboarding.initial.row.abdomen` | Karın (cm) |
| `onboarding.initial.row.shoulder` | Omuz (cm) |
| `onboarding.initial.row.hip` | Kalça (cm) |
| `onboarding.initial.row.chest` | Göğüs (cm) |
| `onboarding.initial.row.forearm` | Ön kol (cm) |
| `onboarding.initial.row.bicepsFlexed` | Bükülü üst kol (cm) |
| `onboarding.initial.bicepsUnknown` | Bilinmiyor – sonraki adımda |
| `onboarding.initial.emptyHint` | Bilmediğin değeri boş bırak; sıfır girme. |
| `validation.zeroNotAllowed` | 0 geçerli bir değer değil. Ölçmediysen boş bırak. |
| `validation.outOfRange.cm` | 1–300 cm arasında bir değer gir. |
| `validation.outOfRange.kg` | 1–400 kg arasında bir değer gir. |
| `onboarding.initial.confirm` | Onayla ve devam et |

**Servis / DB etkileri**

- `seedInitialProfile()` (02 §11.3): yalnızca ilk çalıştırma ve kullanıcı onayıyla.
- `profiles.height_cm`; `weight_logs`; `body_measurements` + `measurement_samples` (`is_baseline = 1`).
- `BaselineResolver` ve Day 90 raporu (AT-20) bu kayıtları başlangıç olarak kullanır.

**Gereksinimler:** R119.1, R119.2, R119.3, R119.4, R97.5, AT-20.

---

### B.3 Onboarding – Flexed Biceps

**Amaç:** Bükülü üst kol çevresini onboarding'de **özellikle** istemek (R96.1); sol/sağ ayrı ya da tek değer olarak saklamak (R96.2); ölçmemişse "sonra" seçeneğiyle geçmek ve dashboard CTA'sına bırakmak (R96.4).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | Biceps sitelerinde kayıt yok | Rehber + üç seçenek: "Sol ve sağ ayrı", "Tek değer", "Sonra ölçeceğim". |
| Yükleniyor | — | Yok. |
| Hata | Zod reddi / `DbWriteError` | B.2 ile aynı metinler. |
| Normal | Bir mod seçildi | B.9'daki örnek (sample) giriş bileşeni satır içi açılır (1–3 örnek, üçüncü ölçüm önerisi). |
| Sonra | "Sonra ölçeceğim" | Hiçbir satır yazılmaz; B.4'e geçilir. Dashboard **"Başlangıç kol ölçümünü ekle."** CTA'sı gösterir (B.10). |

**Akış**

1. `MeasurementGuide('bicepsFlexed')` gösterilir: kol bükülü (flexed), her seferinde aynı pozisyon, en kalın nokta; çizim asset'i (R97.1, R97.2).
2. Mod seçimi:
   - **Sol ve sağ ayrı** → iki ölçüm bloğu: `site = 'bicepsLeftFlexed'` ve `site = 'bicepsRightFlexed'`.
   - **Tek değer** → tek blok: `site = 'bicepsFlexed'`.
   - **Sonra ölçeceğim** → adım atlanır (yazma yok).
3. Her blok B.9'daki kalite akışını uygular (2 örnek önerilir; fark `> max(0.8 cm, %1.5)` ise üçüncü önerilir; tek örnekle devam serbest).
4. "Kaydet ve devam et" → her site için `body_measurements` INSERT (`aggregation`, `is_baseline = 1`, `local_date_key = todayKey`) + `measurement_samples` INSERT; tek transaction.
5. B.4'e geçilir.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `onboarding.biceps.title` | Bükülü üst kol ölçümü |
| `onboarding.biceps.why` | Kol gelişimini takip etmek için başlangıç değeri gerekli. Sonradan da ekleyebilirsin. |
| `onboarding.biceps.mode.separate` | Sol ve sağ ayrı |
| `onboarding.biceps.mode.single` | Tek değer |
| `onboarding.biceps.mode.later` | Sonra ölçeceğim |
| `onboarding.biceps.left` | Sol kol (bükülü) |
| `onboarding.biceps.right` | Sağ kol (bükülü) |
| `onboarding.biceps.single` | Üst kol (bükülü) |
| `onboarding.biceps.laterHint` | Ölçene kadar ana ekranda "Başlangıç kol ölçümünü ekle." kartı görünür. |
| `onboarding.biceps.save` | Kaydet ve devam et |

**Servis / DB etkileri**

- `MeasurementService.create(site, samples, dateKey, { isBaseline: true })`, `MeasurementQuality.evaluate(samples, site)`.
- `body_measurements` (`site ∈ {'bicepsLeftFlexed','bicepsRightFlexed','bicepsFlexed'}`), `measurement_samples`.
- `BaselineResolver.biceps()` = program başlangıcına en yakın (±7 gün) ilk kayıt; yoksa `null` (02 §11.2).

**Gereksinimler:** R96.1, R96.2, R96.4, R97.1–R97.5, R119.2, AT-12.

---

### B.4 Onboarding – Ekipman preset

**Amaç:** B.1'deki `gym_type` ile ekipman profilini ön-seçmek (R120.2) ve kullanıcıya düzenleme fırsatı vermek; varsayılan **Full commercial gym** (R98.3).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | `equipment_profiles` satırı yok | `gym_type`'a göre preset ön-seçili liste. |
| Yükleniyor | — | Yok. |
| Hata | `DbWriteError` | B.0 kuralı. |
| Normal | Liste görünür | Her `EquipmentTag` için anahtar; preset'ten sapma → `preset = 'custom'`. |

**Akış**

1. Ön-seçim: `fullCommercialGym → preset 'fullCommercialGym'` (tüm etiketler işaretli); `homeGym → 'homeGym'`; `limitedGym → 'limitedGym'`. Preset içerikleri `data/` seed'inde tanımlıdır.
2. Kullanıcı anahtarları değiştirirse başlık "Özel" olur (`preset = 'custom'`).
3. "Bitir" → tek transaction: `equipment_profiles` INSERT (`preset`, `available_json`, `updated_at_utc`); `profiles.onboarding_completed = 1`.
4. Program oluşturma / Day 1 seçimi Bölüm A'da devam eder.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `onboarding.equipment.title` | Salonunda hangi ekipman var? |
| `onboarding.equipment.presetHint` | Salon tipine göre ön-seçtik. Sonradan Ayarlar > Gym Equipment'tan değiştirebilirsin. |
| `onboarding.equipment.customBadge` | Özel |
| `onboarding.equipment.finish` | Bitir |

**Servis / DB etkileri:** `EquipmentProfile` (`domain/profile`), `equipment_profiles`, `profiles.onboarding_completed`.

**Gereksinimler:** R98.3, R120.2.

---

### B.5 Settings > Gym Equipment

**Amaç:** Kullanıcının erişebildiği ekipmanı yönetmek (R98.1, R98.2). `ExerciseCatalog.available()` = `exercise.equipment ⊆ profile.available`; antrenman oluşturma ve **"Hareketi Değiştir"** yalnızca mevcut ekipmanla yapılabilen alternatifleri gösterir (R98.4, 02 §8.2, §8.3).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | `equipment_profiles` yok (onboarding tamamlanmadan ayarlara girilemez; savunma) | Varsayılan `fullCommercialGym` ile oluşturulur ve gösterilir. |
| Yükleniyor | `equipment_profiles` + etkilenen `template_exercises` sayımı | İlk açılışta skeleton (< 100 ms). |
| Hata | `DbWriteError` | B.0 kuralı; anahtarlar eski değerine döner. |
| Normal | Liste + preset segmenti | Etki önizlemesi: "Programdaki N hareket bu ekipmanla yapılamıyor; antrenmanda alternatif önerilecek." |

**Akış**

1. Üstte preset segmenti: Tam donanımlı / Ev / Sınırlı / Özel (`preset`). Preset seçmek listeyi seed'deki kümeyle değiştirir; onay diyaloğu ("Mevcut seçimlerin preset ile değiştirilecek.").
2. Liste: her `EquipmentTag` için satır + anahtar. Türkçe etiketler:

| `EquipmentTag` | Etiket |
|----------------|--------|
| `cableStation` | Kablo istasyonu |
| `latPulldown` | Lat pulldown |
| `chestSupportedRow` | Göğüs destekli row |
| `plateLoadedMachine` | Plakalı makineler |
| `selectorizedMachine` | Ağırlık bloklu makineler |
| `dumbbells` | Dambıl |
| `barbells` | Halter |
| `smithMachine` | Smith makinesi |
| `hackSquat` | Hack squat |
| `legPress` | Leg press |
| `legExtension` | Leg extension |
| `legCurl` | Leg curl |
| `pecDeck` | Pec deck |
| `preacherBench` | Preacher bench |
| `adjustableBench` | Ayarlanabilir bench |
| `pullupBar` | Barfiks barı |
| `dipStation` | Dip istasyonu |
| `assistedPullupMachine` | Destekli barfiks makinesi |
| `resistanceBands` | Direnç bandı |
| `bodyweightOnly` | Vücut ağırlığı (her zaman mevcut) |

3. Bir anahtar değişince `preset = 'custom'`; "Tümünü seç" → `fullCommercialGym`.
4. Etki önizlemesi: aktif programın `template_exercises` içinde `equipment_json ⊄ available` olan hareket sayısı; satıra dokununca liste ve her biri için `SubstitutionEngine.alternatives()` ilk adayı ("Aynı kas, aynı hareket kalıbı, ekipmanın var").
5. "Kaydet" → tek transaction: `equipment_profiles` UPDATE (`preset`, `available_json`, `updated_at_utc`). Aktif oturum (`workout_sessions.status = 'active'`) varsa değişiklik o oturumu **etkilemez**; bir sonraki antrenman oluşturulurken uygulanır.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `settings.equipment.title` | Gym Equipment |
| `settings.equipment.preset.fullCommercialGym` | Tam donanımlı |
| `settings.equipment.preset.homeGym` | Ev |
| `settings.equipment.preset.limitedGym` | Sınırlı |
| `settings.equipment.preset.custom` | Özel |
| `settings.equipment.presetReplaceConfirm` | Mevcut seçimlerin preset ile değiştirilecek. |
| `settings.equipment.selectAll` | Tümünü seç |
| `settings.equipment.impact` | Programdaki {n} hareket bu ekipmanla yapılamıyor; antrenmanda alternatif önerilecek. |
| `settings.equipment.impactNone` | Programdaki tüm hareketler bu ekipmanla yapılabiliyor. |
| `settings.equipment.activeSessionNote` | Devam eden antrenman etkilenmez; değişiklik sonraki antrenmanda uygulanır. |
| `common.save` | Kaydet |

**Servis / DB etkileri:** `EquipmentProfile`, `ExerciseCatalog.available()`, `SubstitutionEngine.alternatives(exerciseId, ctx)`; `equipment_profiles` UPDATE.

**Gereksinimler:** R98.1–R98.4, R99.4, R120.2.

---

### B.6 Settings > Face ID / Touch ID / Biometric Lock (ve Gizlilik)

**Amaç:** Opsiyonel uygulama kilidini yönetmek (R94.1, varsayılan kapalı); açılış ve ön plana dönüşte biyometrik doğrulama, yapılandırılabilir grace süresi (R94.2); cihaz parolası fallback'i (R94.3); platformun güvenilir desteklemediği özelliği **vaat etmemek** (R94.6, R116.5).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | `settings['appLock.enabled']` yok | Kapalı kabul edilir; anahtar kapalı görünür. |
| Yükleniyor | `LocalAuthentication.hasHardwareAsync()` + `isEnrolledAsync()` çalışıyor | Anahtar geçici pasif, "Kontrol ediliyor…". |
| Uygun değil | `hasHardwareAsync = false` veya `isEnrolledAsync = false` | Anahtar gri (pasif) + açıklama metni; grace seçici gizli. |
| Hata | Doğrulama başarısız / iptal (etkinleştirme sırasında) | Anahtar eski konumda kalır; "Doğrulama yapılamadı; kilit açılmadı." |
| Normal | Uygun cihaz | Anahtar + "Yeniden kilitleme gecikmesi" seçici + fallback açıklaması + Gizlilik bölümü. |

**Akış (etkinleştirme)**

1. Ekran açılır → uygunluk kontrolü (`hasHardwareAsync && isEnrolledAsync`). Uygun değilse anahtar gri, açıklama gösterilir ve akış biter (02 §13.1).
2. Kullanıcı anahtarı açar → `LocalAuthentication.authenticateAsync({ disableDeviceFallback: false, promptMessage: 'V90 kilidini aç' })` ile bir kez doğrulama (kullanıcının kendini kilitlememesi için).
3. Başarı → tek transaction: `settings` UPSERT `'appLock.enabled' = true`, `'appLock.graceSeconds'` (varsayılan 30) + `settings_history` INSERT. `AppLockService.lastUnlockedAtUtc = now`.
4. Grace seçici: **Hemen** (0) / **30 saniye** (30) / **5 dakika** (300) → `'appLock.graceSeconds'` + `settings_history`.
5. Kapatma: anahtar kapatılırken de doğrulama istenir; başarı → `'appLock.enabled' = false` + `settings_history`.

**Akış (Gizlilik bölümü)**

6. **Android:** "Fotoğraf ve Labs ekranlarında ekran görüntüsünü engelle" anahtarı → `settings['privacy.androidFlagSecure']`. Açıkken `PhotosScreen` ve `LabsScreen` `preventScreenCaptureAsync()` çağırır (R116.5).
7. **iOS:** Anahtar **gösterilmez**; yalnızca bilgi metni: iOS ekran görüntüsü engellemeyi güvenilir biçimde desteklemez, V90 bunu vaat etmez; arka plana geçişte içerik gizlilik perdesiyle örtülür (R94.5, R94.6).
8. Bilgi satırı: Progress Photos ve Labs ekranları gizlilik hassas görünümdür; arka plana geçince perdeyle kapatılır (R94.4, R94.5).

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `settings.appLock.title` | Face ID / Touch ID / Biometric Lock |
| `settings.appLock.toggle` | Uygulama kilidi |
| `settings.appLock.description` | Açıkken uygulamayı her açtığında ve ön plana getirdiğinde kimlik doğrulaması istenir. |
| `settings.appLock.checking` | Kontrol ediliyor… |
| `settings.appLock.unavailable` | Bu cihazda biyometrik doğrulama yok ya da kayıtlı değil. Cihaz ayarlarından Face ID / parmak izi ekleyip tekrar dene. |
| `settings.appLock.fallbackNote` | Biyometri çalışmazsa cihaz parolan kullanılır (platform destekliyorsa). |
| `settings.appLock.grace.title` | Yeniden kilitleme gecikmesi |
| `settings.appLock.grace.0` | Hemen |
| `settings.appLock.grace.30` | 30 saniye |
| `settings.appLock.grace.300` | 5 dakika |
| `settings.appLock.grace.hint` | Uygulamadan bu süreden kısa ayrılırsan tekrar doğrulama istenmez. |
| `settings.appLock.prompt` | V90 kilidini aç |
| `settings.appLock.enableFailed` | Doğrulama yapılamadı; kilit açılmadı. |
| `settings.appLock.disableFailed` | Doğrulama yapılamadı; kilit açık kalmaya devam ediyor. |
| `settings.privacy.title` | Gizlilik |
| `settings.privacy.sensitiveScreens` | Progress Photos ve Labs ekranları gizlilik hassas görünümdür; uygulama arka plana geçince içerik perdeyle kapatılır. |
| `settings.privacy.androidFlagSecure` | Fotoğraf ve Labs ekranlarında ekran görüntüsünü engelle |
| `settings.privacy.androidFlagSecureHint` | Yalnızca Android. Bu ekranlarda ekran görüntüsü ve ekran kaydı engellenir. |
| `settings.privacy.iosNoScreenshotBlock` | iOS ekran görüntüsünü engellemeye güvenilir biçimde izin vermez; V90 bunu vaat etmez. Arka plana geçişte içerik gizlenir. |
| `settings.privacy.noCloud` | Tüm veri yalnızca bu cihazda saklanır. |

**Servis / DB etkileri**

- `AppLockService` (`enabled`, `graceSeconds`, `lastUnlockedAtUtc` bellekte), `PrivacyShield`, `expo-local-authentication`, `expo-screen-capture` (yalnızca Android).
- `settings` anahtarları: `'appLock.enabled'`, `'appLock.graceSeconds'`, `'privacy.androidFlagSecure'`; her değişiklik `settings_history`'ye yazılır.
- `settings.cloudSync` alanı `false`; UI'da "yakında" dahil hiçbir cloud ifadesi yoktur (R116.3).

**Gereksinimler:** R94.1–R94.6, R116.5, R116.3, AT-19.

---

### B.7 Settings > Yedekleme – Dışa aktar (Export)

**Amaç:** Tüm kullanıcı verisini (R95.1) `manifest.json` + `data.json` + `photos/` içeren tek ZIP'e (R95.2–R95.5) yazmak ve kullanıcıya paylaşım/kaydetme sunmak (02 §12.3).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | Daha önce hiç dışa aktarılmamış | "Henüz yedek almadın." + uyarı + **Yedeği dışa aktar**. |
| Yükleniyor | `BackupExporter.run()` çalışıyor | Adımlı ilerleme: Veriler okunuyor → ZIP oluşturuluyor → Fotoğraflar kopyalanıyor → Manifest yazılıyor. Ekran kilitlenir, iptal yok. |
| Hata | Disk dolu / ZIP yazılamadı / paylaşım iptal | "Yedek oluşturulamadı. Boş alanı kontrol et." + Yeniden dene. Paylaşım iptali hata değildir; dosya uygulama sandbox'ında kalır ve "Tekrar paylaş" sunulur. |
| Normal | Son yedek bilgisi | "Son yedek: {tarih}" + boyut + **Yedeği dışa aktar** + aylık hatırlatma anahtarı. |
| Uyarı | Aktif oturum var | Export yine yapılır (tek okuma transaction'ı tutarlıdır); bilgi notu gösterilir. |

**Akış**

1. Ekran açılır; şifresiz ZIP uyarısı görünür (02 §12.2). Arşivleyici destekliyorsa "Parola ile şifrele (ZIP AES)" anahtarı ve parola alanı sunulur; desteklemiyorsa anahtar hiç gösterilmez (vaat yok).
2. **Yedeği dışa aktar** → `BackupExporter.run()`:
   - Tek okuma transaction'ı (`BEGIN … COMMIT`): `TableRegistry` içindeki **tüm** tablolar → `data.json` (`schemaVersion`, `tables: {…}`).
   - `photos/<photoId>.<ext>`: `progress_photos` satırlarındaki dosyalar `documentDirectory/photos/` içinden kopyalanır; dosyası eksik satır atlanır ve sayısı sonuçta bildirilir.
   - `manifest.json`: `formatVersion: 1`, `schemaVersion`, `appVersion`, `createdAtUtc`, `timeZone`, `tables: { <table>: rowCount }`, `photos: { count, totalBytes }`, `dataSha256`, `photoShas`.
   - Dosya adı `v90-backup-<yyyyMMdd-HHmm>.zip`.
3. `expo-sharing` ile paylaşım sayfası; kullanıcı Dosyalar/Drive vb. seçer.
4. Başarı ekranı: dosya adı, boyut, tablo ve fotoğraf sayıları; "Tamam".
5. Aylık hatırlatma: "Ayda bir yedek hatırlat" anahtarı (kapatılabilir, 02 §12.2). Hatırlatma dashboard'da sessiz kart olarak görünür; push bildirimi kullanılmaz.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `settings.backup.title` | Yedekleme |
| `settings.backup.export.button` | Yedeği dışa aktar |
| `settings.backup.export.none` | Henüz yedek almadın. |
| `settings.backup.export.last` | Son yedek: {date} · {size} |
| `settings.backup.export.unencryptedWarning` | Yedek dosyası şifresizdir; içinde ölçümlerin, kan sonuçların ve fotoğrafların bulunur. Güvenli bir yerde sakla. |
| `settings.backup.export.passwordToggle` | Parola ile şifrele (ZIP AES) |
| `settings.backup.export.passwordHint` | Parolayı unutursan yedek açılamaz. |
| `settings.backup.export.step.read` | Veriler okunuyor… |
| `settings.backup.export.step.zip` | ZIP oluşturuluyor… |
| `settings.backup.export.step.photos` | Fotoğraflar kopyalanıyor… |
| `settings.backup.export.step.manifest` | Manifest yazılıyor… |
| `settings.backup.export.activeSessionNote` | Devam eden antrenmanın da yedeğe dahil edilir. |
| `settings.backup.export.success` | Yedek hazır: {fileName} ({size}). {tables} tablo, {photos} fotoğraf. |
| `settings.backup.export.missingPhotos` | {n} fotoğraf dosyası bulunamadı ve yedeğe eklenmedi. |
| `settings.backup.export.failed` | Yedek oluşturulamadı. Boş alanı kontrol et. |
| `settings.backup.export.reshare` | Tekrar paylaş |
| `settings.backup.reminder.toggle` | Ayda bir yedek hatırlat |
| `settings.backup.reminder.card` | Son yedeğin üzerinden bir aydan uzun süre geçti. Yedek almak ister misin? |
| `settings.backup.keyLossWarning` | Cihaz sıfırlanırsa veritabanı anahtarı kaybolur ve veriler açılamaz. Düzenli yedek al. |

**Servis / DB etkileri**

- `BackupExporter`, `BackupArchiver` (`react-native-zip-archive`, alternatif `fflate`), `TableRegistry`, `expo-sharing`.
- Yalnızca okuma; DB'ye yazma yoktur. Şifreleme anahtarı yedeğe **dahil edilmez** (R93.5).
- Son yedek zamanı ve hatırlatma tercihi `settings` tablosunda tutulur (anahtar adları için bkz. Tutarsızlık / açık nokta).

**Gereksinimler:** R95.1–R95.5, R93.5, R116.3, AT-14.

---

### B.8 Settings > Yedekleme – İçe aktar (Import) ve "Geri al"

**Amaç:** Yedeği doğrulayıp (Zod, şema uyumluluğu, sha) **staging DB** üzerinde hazırlamak ve atomik dosya değişimiyle devreye almak; herhangi bir hatada mevcut veriye **dokunmamak** (R95.6, R95.7, AT-15); eski yedekleri migration zinciriyle yükseltmek, yeni sürüm yedeği reddetmek (R95.8); başarıdan sonra 7 gün **"Geri al"** sunmak (02 §12.3).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | Dosya seçilmedi | **Yedekten geri yükle** butonu + açıklama + (varsa) "Geri al" kartı. |
| Yükleniyor – doğrulama | Adım 1–3 | "Yedek doğrulanıyor…" ilerleme; iptal edilebilir (temp dizin silinir). |
| Önizleme | Doğrulama geçti | Manifest sayıları (aşağıda) + mevcut veri karşılaştırması + mod: **Değiştir**. |
| Yükleniyor – değişim | Adım 4–6 | "Veriler yazılıyor…" → "Fotoğraflar kopyalanıyor…" → "Değiştiriliyor…"; ekran kilitli, iptal yok. |
| Hata | `ImportError` (herhangi bir adımda) | **"İçe aktarma başarısız; mevcut verin değişmedi."** + **Ayrıntılar** + **Tekrar dene**. |
| Reddedildi | `schemaVersion > current` | **"Bu yedek daha yeni bir sürümle alınmış"** + "Uygulamayı güncelle" açıklaması; Tekrar dene yok. |
| Normal – başarı | Değişim tamamlandı | Özet + "Geri al" (7 gün) bilgisi + uygulama yeniden başlatılır (bootstrap). |
| Engelli | `workout_sessions.status = 'active'` var | İçe aktarma başlatılamaz: "Önce devam eden antrenmanı bitir ya da iptal et." |

**Akış**

1. **Yedekten geri yükle** → dosya seçici (ZIP). Seçim iptali durumu değiştirmez.
2. **Doğrulama** (`BackupImporter.import(zipUri)` adım 1–3):
   1. ZIP temp dizine açılır; `manifest.json` Zod ile doğrulanır; `dataSha256` `data.json` ile karşılaştırılır.
   2. `manifest.schemaVersion > current` → reddet. `<` → `backupMigrators[v]` zinciriyle `data.json` güncel şemaya yükseltilir (R95.8).
   3. `data.json` tüm tablolar için `TableRegistry` Zod şemalarıyla doğrulanır (R95.6).
3. **Önizleme** ekranı (manifest'ten):
   - Alınma zamanı (`createdAtUtc`, yerel biçim), `appVersion`, `schemaVersion` → "Şema {v} (güncel {cur})" ya da "Şema {v} → {cur} olarak yükseltilecek".
   - Tablo sayıları: `tables.workout_sessions`, `tables.set_logs`, `tables.meal_logs`, `tables.body_measurements`, `tables.weight_logs`, `tables.lab_results`, `tables.recipes`; `photos.count` ve `photos.totalBytes`. "Tümünü göster" ile tam tablo listesi.
   - Karşılaştırma sütunu: aynı tabloların **mevcut** DB'deki satır sayıları; yedek daha azsa satır sarı vurgulanır.
   - Mod: **Değiştir** (tek seçenek; **Birleştir** v1'de yoktur ve UI'da gösterilmez).
4. **Onay** diyaloğu: "Mevcut verin bu yedekle değiştirilecek. 7 gün içinde geri alabilirsin." → **Değiştir** / **Vazgeç**.
5. **Değişim** (adım 4–6):
   4. Staging: yeni şifreli DB dosyası `v90.import.sqlite` oluşturulur, `MIGRATIONS` çalıştırılır, tüm satırlar tek transaction'da yazılır, `PRAGMA integrity_check` ve `foreign_key_check`.
   5. Fotoğraflar `photos.import/` altına kopyalanır, `photoShas` ile doğrulanır.
   6. Atomik değişim: mevcut DB kapatılır → `v90.sqlite → v90.pre-import.sqlite` → `v90.import.sqlite → v90.sqlite` → `photos/ ↔ photos.import/` swap. Herhangi bir adım başarısız olursa ters işlemler uygulanır; mevcut veri dokunulmamış kalır (R95.7).
6. **Başarı:** `pre-import` kopyaları 7 gün saklanır; ekranda "Geri al" kartı görünür. Uygulama `AppBootstrap`'ı yeniden çalıştırır (DB aç → migration no-op → `OrphanSweeper` → store'lar `hydrate()`). İçe aktarılan `settings` içindeki `'appLock.enabled'` değeri geçerli olur; açıksa `LockScreen` gösterilir.
7. **Geri al** (7 gün içinde): onay diyaloğu → mevcut DB kapat → `v90.sqlite → v90.undo-discard.sqlite` → `v90.pre-import.sqlite → v90.sqlite` → fotoğraf dizinleri geri swap → bootstrap. Başarıdan sonra `undo-discard` kopyası hemen silinir. 7 gün dolduğunda kart kaybolur ve `pre-import` kopyaları silinir.

**Hata mesajları (`ImportError` alt kodları — "Ayrıntılar" altında)**

| Kod | Ne oldu | Ayrıntılar metni |
|-----|---------|------------------|
| `zipUnreadable` | ZIP açılamadı / bozuk | Dosya açılamadı ya da bozuk. |
| `manifestInvalid` | `manifest.json` Zod reddi / eksik | manifest.json geçersiz. Bu dosya bir V90 yedeği olmayabilir. |
| `checksumMismatch` | `dataSha256` uyuşmadı | Veri bütünlüğü doğrulanamadı (sha256 uyuşmuyor). |
| `schemaTooNew` | `schemaVersion > current` | Bu yedek daha yeni bir sürümle alınmış |
| `dataInvalid` | `data.json` Zod reddi | {table} tablosunda geçersiz satır: {detay} |
| `stagingFailed` | Staging DB migration / yazma / `integrity_check` hatası | Geçici veritabanı oluşturulamadı. |
| `photoChecksumMismatch` | Fotoğraf sha uyuşmadı | {n} fotoğraf doğrulanamadı. |
| `diskFull` | Staging için alan yok | Yeterli boş alan yok. Yer açıp tekrar dene. |
| `swapFailed` | Dosya değişimi başarısız, geri alındı | Dosyalar değiştirilemedi; eski veri geri yüklendi. |

Tüm kodlar için başlık aynıdır: **"İçe aktarma başarısız; mevcut verin değişmedi."**

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `settings.backup.import.button` | Yedekten geri yükle |
| `settings.backup.import.description` | Bir V90 yedek dosyası (.zip) seç. Mevcut verin yedekle değiştirilir; 7 gün içinde geri alabilirsin. |
| `settings.backup.import.blockedActiveSession` | Önce devam eden antrenmanı bitir ya da iptal et. |
| `settings.backup.import.validating` | Yedek doğrulanıyor… |
| `settings.backup.import.preview.title` | Yedek önizlemesi |
| `settings.backup.import.preview.createdAt` | Alınma zamanı: {date} |
| `settings.backup.import.preview.appVersion` | Uygulama sürümü: {v} |
| `settings.backup.import.preview.schemaSame` | Şema {v} (güncel) |
| `settings.backup.import.preview.schemaUpgrade` | Şema {v} → {cur} olarak yükseltilecek |
| `settings.backup.import.preview.columns` | Tablo · Yedek · Mevcut |
| `settings.backup.import.preview.photos` | Fotoğraflar: {count} ({size}) |
| `settings.backup.import.preview.showAll` | Tümünü göster |
| `settings.backup.import.preview.fewerWarning` | Yedekte mevcut verinden daha az kayıt var. |
| `settings.backup.import.mode.replace` | Değiştir |
| `settings.backup.import.confirm` | Mevcut verin bu yedekle değiştirilecek. 7 gün içinde geri alabilirsin. |
| `common.cancel` | Vazgeç |
| `settings.backup.import.step.write` | Veriler yazılıyor… |
| `settings.backup.import.step.photos` | Fotoğraflar kopyalanıyor… |
| `settings.backup.import.step.swap` | Değiştiriliyor… |
| `settings.backup.import.success` | Yedek geri yüklendi: {tables} tablo, {rows} kayıt, {photos} fotoğraf. |
| `settings.backup.import.failed` | İçe aktarma başarısız; mevcut verin değişmedi. |
| `settings.backup.import.tooNew` | Bu yedek daha yeni bir sürümle alınmış |
| `settings.backup.import.tooNewHint` | Uygulamayı güncelleyip tekrar dene. |
| `common.details` | Ayrıntılar |
| `common.tryAgain` | Tekrar dene |
| `settings.backup.undo.card` | İçe aktarma {date} tarihinde yapıldı. {days} gün içinde geri alabilirsin. |
| `settings.backup.undo.button` | Geri al |
| `settings.backup.undo.confirm` | İçe aktarmadan sonra girdiğin her şey silinecek; önceki verin geri gelecek. |
| `settings.backup.undo.success` | Önceki verin geri yüklendi. |

**Servis / DB etkileri**

- `BackupImporter`, `BackupArchiver`, `backupMigrators` (`core/backup/migrators/00k.ts`), `MigrationRunner` (staging DB), `DbKeyManager` (staging DB aynı anahtarla şifrelenir), `OrphanSweeper`, `AppBootstrap`.
- Mevcut DB'ye hiçbir yazma yapılmaz; tüm yazma `v90.import.sqlite` üzerindedir. Değişim dosya sistemi düzeyindedir.
- Başarılı içe aktarma sonrası bellekteki tüm Zustand store'ları geçersizdir; bootstrap yeniden `hydrate()` eder (R90.7).

**Gereksinimler:** R95.6, R95.7, R95.8, R117.3, R117.4, AT-14, AT-15.

---

### B.9 Ölçüm ekleme

**Amaç:** Her vücut ölçümü için nasıl ölçüleceğini göstermek (R97.1, R97.2); 1–3 örnek almak, eşik aşımında üçüncü ölçüm önermek (R97.3); final değeri `mean`/`median` ile türetip ham örneklerle birlikte saklamak (R97.4, R97.5); `0`/negatif değeri reddetmek (R119.3, R119.4).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | Site seçilmedi | Site listesi (gruplu: Gövde / Kollar / Bacaklar); her satırda son değer ve tarih, yoksa "—". |
| Yükleniyor | Site için son 3 kayıt okunuyor (bağlam) | Skeleton (< 100 ms). |
| Hata | Zod reddi / `DbWriteError` | Alan hatası ya da B.0 kuralı; girilen örnekler korunur. |
| Normal – 1 örnek | Yalnızca `sample 1` girildi | "İkinci ölçüm öner" ipucu; "Tek ölçümle kaydet" aktif (`aggregation = 'single'`). |
| Normal – 2 örnek, uyumlu | `|s1 − s2| ≤ max(0.8 cm, %1.5)` | Final = ortalama, `aggregation = 'mean'`; "Kaydet". |
| Üçüncü önerilir | `|s1 − s2| > max(0.8 cm, %1.5)` | Sarı uyarı "Üçüncü ölçüm önerilir"; `sample 3` alanı açılır; "Yine de ikisinin ortalamasıyla kaydet" ikincil buton. |
| Normal – 3 örnek | `sample 3` girildi | Final = medyan, `aggregation = 'median'`; "Kaydet". |

**Akış**

1. Site seç (`site` enum'u; kollarda **Sol / Sağ / Tek değer** seçimi → `bicepsLeftFlexed` / `bicepsRightFlexed` / `bicepsFlexed`, `forearmLeft` / `forearmRight` / `forearm`, uyluk ve baldırda aynı örüntü).
2. `MeasurementGuide(site)` kartı: kısa metin + çizim (R97.1, R97.2). Metinler:

| `site` | Rehber metni |
|--------|--------------|
| `waist` | Her seferinde aynı anatomik noktadan; nefes verip rahat durarak, mezurayı sıkmadan. |
| `abdomen` | Göbek deliği hizasından, yatay. |
| `shoulder` | Omuzların en geniş çevresi; kollar yanda, gevşek. |
| `chest` | Meme ucu hizası, nefes verilmiş, kollar yanda. |
| `hip` | Kalçanın en geniş noktası. |
| `bicepsFlexed` / `bicepsLeftFlexed` / `bicepsRightFlexed` | Kol bükülü (flexed), her seferinde aynı pozisyon; en kalın nokta. |
| `forearm*` | Dirsekten 2–3 parmak aşağıda, yumruk sıkılı, en kalın nokta. |
| `thigh*` | Kasıktan bir karış aşağıda, ayakta, ağırlık iki ayakta. |
| `calf*` | Baldırın en kalın noktası, ayakta. |
| `neck` | Gırtlak altından, başı dik tutarak. |

3. Tarih: varsayılan `clock.todayKey()`; "Dün" kısayolu ve tarih seçici `local_date_key`'i açıkça ayarlar (02 §5.3). Gelecek tarih seçilemez.
4. `sample 1` gir (`NumericStepper`, adım 0.5 cm, ondalık klavye). `MeasurementQuality.evaluate(samples, site)` her girişte çalışır.
5. `sample 2` gir → fark eşiği kontrolü; eşik aşılırsa **Üçüncü ölçüm önerilir**; kullanıcı isterse `sample 3` girer, istemezse "Yine de ikisinin ortalamasıyla kaydet".
6. Final değer önizlemesi: "{value} cm · {ortalama|medyan|tek ölçüm}" ve önceki kayda göre fark ("Son ölçüme göre −0.5 cm").
7. "Kaydet" → tek transaction: `body_measurements` INSERT (`measured_at_utc`, `local_date_key`, `time_zone`, `site`, `final_value_cm`, `aggregation`, `is_baseline`, `note`) + `measurement_samples` INSERT × n (`sample_index` 1..3, `value_cm`). `is_baseline = 1` yalnızca site için ilk kayıt ve `local_date_key` program başlangıcına ±7 gün içindeyse.
8. Kaydettikten sonra ilgili KPI kartı (B.10) ve trend güncellenir; biceps baseline yeni eklendiyse CTA kaybolur.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `measurement.title` | Ölçüm ekle |
| `measurement.site.pick` | Neyi ölçüyorsun? |
| `measurement.group.torso` | Gövde |
| `measurement.group.arms` | Kollar |
| `measurement.group.legs` | Bacaklar |
| `measurement.side.left` | Sol |
| `measurement.side.right` | Sağ |
| `measurement.side.single` | Tek değer |
| `measurement.site.waist` | Bel |
| `measurement.site.abdomen` | Karın |
| `measurement.site.shoulder` | Omuz |
| `measurement.site.chest` | Göğüs |
| `measurement.site.hip` | Kalça |
| `measurement.site.bicepsFlexed` | Üst kol (bükülü) |
| `measurement.site.forearm` | Ön kol |
| `measurement.site.thigh` | Uyluk |
| `measurement.site.calf` | Baldır |
| `measurement.site.neck` | Boyun |
| `measurement.guide.title` | Nasıl ölçülür? |
| `measurement.date.today` | Bugün |
| `measurement.date.yesterday` | Dün |
| `measurement.sample.1` | 1. ölçüm |
| `measurement.sample.2` | 2. ölçüm (önerilir) |
| `measurement.sample.3` | 3. ölçüm |
| `measurement.hint.second` | Mümkünse ikinci bir ölçüm al; gürültüyü azaltır. |
| `measurement.thirdSuggested` | Üçüncü ölçüm önerilir |
| `measurement.thirdSuggestedHint` | İki ölçüm arasındaki fark {diff} cm. Üçüncü ölçümle medyan alınır. |
| `measurement.saveWithTwoAnyway` | Yine de ikisinin ortalamasıyla kaydet |
| `measurement.saveSingle` | Tek ölçümle kaydet |
| `measurement.final.mean` | {value} cm · ortalama |
| `measurement.final.median` | {value} cm · medyan |
| `measurement.final.single` | {value} cm · tek ölçüm |
| `measurement.deltaPrev` | Son ölçüme göre {delta} cm |
| `measurement.noPrev` | Bu bölge için ilk kayıt. |
| `measurement.baselineBadge` | Başlangıç |
| `validation.zeroNotAllowed` | 0 geçerli bir değer değil. Ölçmediysen boş bırak. |
| `validation.outOfRange.cm` | 1–300 cm arasında bir değer gir. |
| `common.save` | Kaydet |

**Servis / DB etkileri**

- `MeasurementService`, `MeasurementQuality.evaluate(samples, site)` (eşik `> max(0.8 cm, %1.5)`), `MeasurementGuide`, `BaselineResolver`, `TrendCalculator` (son 3 ölçümün medyanı).
- `body_measurements` (`CHECK final_value_cm > 0 AND < 300`), `measurement_samples` (`ON DELETE CASCADE`, `sample_index BETWEEN 1 AND 3`).

**Gereksinimler:** R97.1–R97.5, R96.2, R119.3, R119.4, R123.2, AT-11.

---

### B.10 Dashboard KPI kartları

**Amaç:** Kilo ve ölçümleri gürültülü kabul ederek **trend** öncelikli göstermek (R123.2, R123.3); biceps baseline yokken `0 cm` yerine CTA (R96.3–R96.5, AT-12); tahmini değerleri "tahmin" rozetiyle etiketlemek (R123.4).

**Kartlar**

| Kart | Veri | Ana değer | Alt satır |
|------|------|-----------|-----------|
| Kilo | `weight_logs`, `TrendCalculator` | 7 günlük hareketli ortalama (AT-10) | 28 günlük eğim "−0.4 kg/hafta" + trend etiketi; "Son: {kg} ({gün})" |
| Bel | `body_measurements.site='waist'` | Son 3 ölçümün medyanı | Başlangıca göre fark + trend etiketi |
| Bel / Omuz oranı | `waist` ve `shoulder` medyanları | oran (2 ondalık, AT-11) | Başlangıç oranı ve fark |
| Kol (bükülü) | `bicepsLeftFlexed` / `bicepsRightFlexed` / `bicepsFlexed`, `BaselineResolver.biceps()` | Son medyan (sol/sağ ayrıysa ikisi + ortalama) | Baseline'a göre fark; baseline yoksa CTA |
| Kalori hedefi | `nutrition_targets` (en son `effective_from_date_key`) | `{kcal} kcal` ±100 bandı | **"tahmin"** rozeti + `rationale_tr` |

**Trend etiketleri** (`TrendCalculator` çıktısına göre; eşikler motorun sorumluluğudur, `04-domain-engines.md`): `up` → "↑ yükseliyor", `down` → "↓ düşüyor", `stable` → "→ stabil", `insufficient` → "yetersiz veri". Etiket metni asla "kas kazandın" gibi mutlak ifade içermez (R123.1).

**Durumlar (kart bazında)**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş – baseline yok (Kol) | `BaselineResolver.biceps() === null` | Kart `disabled`; sayı yerine **"Başlangıç kol ölçümünü ekle."** CTA'sı → B.9 (site biceps, `isBaseline` önerilir). `0 cm` hiçbir koşulda basılmaz. |
| Boş – hiç kayıt yok (diğer kartlar) | İlgili tabloda satır yok | "Henüz ölçüm yok" + "Ölçüm ekle" bağlantısı. |
| Yetersiz veri | Son 7 günde < 3 kilo kaydı / site'ta < 2 ölçüm | Ana değer son tek kayıt (bağlamıyla: "tek ölçüm"), trend "yetersiz veri". |
| Yükleniyor | İlk `hydrate()` | Kart skeleton. |
| Hata | Okuma hatası (`DbOpenError` dışındaki nadir durum) | Kart yerine "Yüklenemedi" + Yeniden dene; diğer kartlar etkilenmez. |
| Normal | Yeterli veri | Ana değer + trend etiketi + sparkline (7g / 28g). |
| Baseline var, yeni ölçüm yok (Kol) | Yalnızca baseline kaydı | "Başlangıç: {cm} · henüz yeni ölçüm yok" + "Ölçüm ekle". |

**Akış**

1. Dashboard `hydrate()`: `weight_logs` (son 35 gün), `body_measurements` (site başına son 3 + baseline), `nutrition_targets` (son), `BaselineResolver.biceps()`.
2. Her kart kendi durumunu hesaplar; `null` → CTA.
3. CTA dokunuşu → B.9 (site ve baseline önerisiyle önceden seçili). Kayıt sonrası dashboard `DAY_CHANGED`'e benzer bir `MEASUREMENT_ADDED` olayıyla yeniden hydrate olur.
4. Kart dokunuşu → Progress ekranındaki ilgili grafik (7 günlük ve çok haftalık trend, R123.3).

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `dashboard.kpi.weight.title` | Kilo |
| `dashboard.kpi.weight.avg7` | 7 günlük ortalama |
| `dashboard.kpi.weight.slope28` | {delta} kg/hafta (28 gün) |
| `dashboard.kpi.weight.last` | Son: {kg} kg ({day}) |
| `dashboard.kpi.waist.title` | Bel |
| `dashboard.kpi.ratio.title` | Bel / Omuz oranı |
| `dashboard.kpi.ratio.baseline` | Başlangıç: {ratio} |
| `dashboard.kpi.biceps.title` | Kol (bükülü) |
| `dashboard.kpi.biceps.cta` | Başlangıç kol ölçümünü ekle. |
| `dashboard.kpi.biceps.baselineOnly` | Başlangıç: {cm} cm · henüz yeni ölçüm yok |
| `dashboard.kpi.biceps.leftRight` | Sol {l} · Sağ {r} |
| `dashboard.kpi.delta.sinceBaseline` | Başlangıca göre {delta} cm |
| `dashboard.kpi.median3` | Son 3 ölçümün medyanı |
| `dashboard.kpi.singleValue` | tek ölçüm |
| `dashboard.kpi.trend.up` | ↑ yükseliyor |
| `dashboard.kpi.trend.down` | ↓ düşüyor |
| `dashboard.kpi.trend.stable` | → stabil |
| `dashboard.kpi.trend.insufficient` | yetersiz veri |
| `dashboard.kpi.empty` | Henüz ölçüm yok |
| `dashboard.kpi.addMeasurement` | Ölçüm ekle |
| `dashboard.kpi.kcal.title` | Kalori hedefi |
| `dashboard.kpi.kcal.band` | {kcal} kcal (±100) |
| `badge.estimate` | tahmin |
| `dashboard.kpi.loadFailed` | Yüklenemedi |

**Servis / DB etkileri:** `TrendCalculator` (7d/28d), `BaselineResolver`, `AdherenceCalculator` (Bölüm A), `DayRolloverObserver`; salt okuma.

**Gereksinimler:** R96.3–R96.5, R123.1–R123.4, R119.3, AT-10, AT-11, AT-12, AT-20.

---

### B.11 Progress > Weekly Sets by Muscle

**Amaç:** Haftalık **direct/primary working set** sayısını kas bazında göstermek (R106.1, R106.2); compound hareketlerin dolaylı katkısını "1 tam set" kesinliğiyle **toplamamak** (R106.3); secondary katkıyı ayrı sekmede, tahmin olduğu açıkça belirtilerek sunmak (R106.4); unilateral setleri çift saymamak (R102.4).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | Seçili haftada `completed`/`partial` oturum yok | "Bu hafta tamamlanmış antrenman yok." + hafta oku. |
| Yükleniyor | `VolumeAnalytics.weekly(weekKey)` | Çubuk skeleton'ları. |
| Hata | Okuma hatası | "Yüklenemedi" + Yeniden dene. |
| Normal – Direkt sekmesi | Veri var | Kas başına yatay çubuk: `directSets`; referans işaretleri `baseline_weekly_direct_sets` ve `max_recommended_weekly_sets`; `is_priority = 1` kaslar yıldızlı. |
| Normal – İkincil sekmesi | Veri var | `secondarySetsEstimate` çubukları, açık renk/kesikli; başlıkta ve her çubukta **"tahmin"** rozeti; referans işaretleri **yok**. |
| Devam eden antrenman | `workout_sessions.status = 'active'` bu haftada | Bilgi satırı: "Devam eden antrenman dahil değil." (görünüm yalnızca `completed`/`partial` oturumları sayar). |

**Akış**

1. Hafta seçici (Pazartesi–Pazar, `calendar_date_key` üzerinden; varsayılan bu hafta).
2. Sekme **Direkt**: `v_weekly_direct_sets` görünümü hafta içinde `muscle` bazında toplanır. Sayım `COUNT(DISTINCT session_exercise_id || ':' || set_index)` olduğundan `separate` modundaki sol+sağ = 1 set (R102.4). Örnek görünüm: Lateral Delts 12, Biceps 13, Triceps 13, Lats/Back 15, Chest 10, Quads 7, Hamstrings 8 (R106.1).
3. Sekme **İkincil (tahmin)**: `VolumeAnalytics.weekly()` → `secondarySetsEstimate = 0.5 × secondary working set sayısı` (02 §9.4). Üst açıklama: compound hareketlerin dolaylı katkısı tahmindir, 1 tam set sayılmaz. Bu sekme toplam çizgisi ya da "hedef" göstermez.
4. Çubuğa dokununca hareket kırılımı: o kas için haftadaki hareketler ve set sayıları (`set_type = 'working'`, `discarded = 0`).
5. `muscle_volume_targets` üzerinden öneri varsa (Bölüm A, `VolumeGuardrails`) çubuk altında "Neden önerildi?" bağlantısı; bu ekran öneri üretmez, yalnızca gösterir.

**Kas etiketleri (`MuscleGroup` → Türkçe)**

| `MuscleGroup` | Etiket |
|---------------|--------|
| `chest` | Göğüs |
| `lats` | Lats |
| `upperBack` | Üst sırt |
| `rearDelts` | Arka omuz |
| `lateralDelts` | Yan omuz |
| `frontDelts` | Ön omuz |
| `biceps` | Biceps |
| `triceps` | Triceps |
| `forearms` | Ön kol |
| `quads` | Quadriceps |
| `hamstrings` | Hamstring |
| `glutes` | Kalça |
| `calves` | Baldır |
| `abs` | Karın |
| `lowerBack` | Bel |
| `neck` | Boyun |

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `progress.volume.title` | Weekly Sets by Muscle |
| `progress.volume.tab.direct` | Direkt setler |
| `progress.volume.tab.secondary` | İkincil (tahmin) |
| `progress.volume.directHint` | Hareketin ana kasına yapılan working set'ler. Sol/sağ ayrı setler bir set sayılır. |
| `progress.volume.secondaryHint` | Compound hareketlerin dolaylı katkısı tahmindir; her set 0,5 olarak sayılır ve 1 tam set olarak toplanmaz. |
| `progress.volume.empty` | Bu hafta tamamlanmış antrenman yok. |
| `progress.volume.activeExcluded` | Devam eden antrenman dahil değil. |
| `progress.volume.baselineMark` | Program hedefi |
| `progress.volume.maxMark` | Üst sınır |
| `progress.volume.priority` | Öncelikli kas |
| `progress.volume.setsUnit` | {n} set |
| `progress.volume.estimateUnit` | ~{n} set |
| `badge.estimate` | tahmin |
| `progress.volume.whyRecommended` | Neden önerildi? |

**Servis / DB etkileri:** `VolumeAnalytics.weekly(weekKey)` → `{ muscle, directSets, secondarySetsEstimate }`; `v_weekly_direct_sets`; `exercises.secondary_muscles_json`; `muscle_volume_targets`; salt okuma. `secondarySetsEstimate` `isEstimate: true` ile döner.

**Gereksinimler:** R106.1–R106.4, R102.4, R105.5, R123.4.

---

### B.12 Beslenme – Günlük log ve kopyalama

**Amaç:** Kullanıcının aynı 4–5 öğünü sıfırdan girmemesini sağlamak (R109.2): **Copy Yesterday**, **Copy Meal**, **Repeat Breakfast**, **Saved Meal**, **Favorite Food**, **Recent Food** (R109.1). Gün aidiyeti `local_date_key` ile, timezone değişse bile kaymaz (R112.4).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş – gün | Seçili günde `meal_logs` yok | Slot başlıkları boş; üstte hızlı eylemler: **Copy Yesterday** (dün doluysa), **Repeat Breakfast** (son 7 günde kahvaltı varsa). |
| Boş – slot | Slot'ta entry yok | "+ Besin ekle" + slot eylemleri: **Copy Meal**, **Saved Meal**. |
| Yükleniyor | Gün okunuyor | Skeleton. |
| Hata | `DbWriteError` | B.0 kuralı; kopyalama işlemi tek transaction olduğundan yarım öğün oluşmaz. |
| Normal | Entry'ler var | Slot başına kcal/protein/karb/yağ toplamı (`*_snapshot` toplamı), gün toplamı, `nutrition_targets` hedefine göre ilerleme (hedef "tahmin" rozetli). |
| Hedef geçmişe ait | Seçili gün `effective_from_date_key`'den önce | Hedef çubuğu gizlenir. |

**Akış – gün görünümü**

1. Tarih şeridi (varsayılan `clock.todayKey()`; geçmiş gün seçilebilir; `DAY_CHANGED` ile bugün kayar).
2. Slot listesi `meal_slot` sırasıyla: `breakfast`, `lunch`, `dinner`, `snack`, `preWorkout`, `postWorkout`.
3. Slot içindeki her entry: ad (`food_items.name` / `recipes.name`), `grams`, kcal ve makro snapshot'ları; kaydırarak sil/düzenle (gram değişince snapshot yeniden hesaplanır).

**Akış – kopyalama eylemleri**

| Eylem | Tetik | `CopyService` | Yazılan |
|-------|-------|---------------|---------|
| **Copy Yesterday** | Gün üstündeki buton | `copyDay(fromKey = dün, toKey = seçili gün)` | Dünün her `meal_logs` satırı için yeni `meal_logs` (`copied_from_id` = kaynak) + `meal_entries` (gram korunur, snapshot **güncel** `food_items`/`recipes` değerlerinden yeniden hesaplanır). Hedef günde aynı slot doluysa entry'ler **eklenir**; onay diyaloğu bunu söyler. |
| **Copy Meal** | Slot menüsü → "Başka günden kopyala" → tarih + slot seçici | `copyMeal(mealLogId, toKey, slot)` | Tek `meal_logs` + entry'leri; `copied_from_id`. |
| **Repeat Breakfast** | Gün üstündeki buton (yalnızca `breakfast` boşsa görünür); slot menüsünde "Son {slot}'u tekrarla" tüm slotlar için | `repeatSlot(slot)` → son 7 gün içindeki aynı slot'un en yeni kaydı | `copyMeal` ile aynı. |
| **Saved Meal – kaydet** | Slot menüsü → "Öğün olarak kaydet" → ad | `MealLogService.saveAsMeal(mealLogId, name)` | `saved_meals` + `saved_meal_entries` (food/recipe + gram). |
| **Saved Meal – ekle** | Besin arama sayfası → "Kayıtlı Öğünler" sekmesi | `CopyService.insertSavedMeal(savedMealId, toKey, slot)` | `meal_logs` (yoksa) + `meal_entries` (snapshot güncel değerlerden). |
| **Favorite Food** | Besin satırında yıldız | `food_favorites` INSERT/DELETE | Arama sayfasında "Favoriler" sekmesi. |
| **Recent Food** | Arama sayfası açılışı | `meal_entries` son 30 gün, sıklık sıralı (02 §10) | Salt okuma; "Son" sekmesi varsayılan. |

**Besin arama sayfası (bottom sheet)**

Sekmeler: **Son** · **Favoriler** · **Kayıtlı Öğünler** · **Tarifler** · **Tümü**. Arama `food_items.name` (`ix_food_name`) ve `recipes.name` üzerinde; `is_deleted = 0`. Satırda `source` rozeti: `seed:usda` → "USDA", `seed:tr-label` → "TR etiket", `user` → "Kullanıcı", `label-override` → "Etiketten düzenlendi" (R111.2). Seçim → gram girişi (`serving_unit` ≠ `'g'` ise porsiyon × `serving_size_g` dönüştürücü) → "Ekle" → `meal_logs` (slot için yoksa INSERT) + `meal_entries` INSERT, tek transaction.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `nutrition.title` | Beslenme |
| `nutrition.slot.breakfast` | Kahvaltı |
| `nutrition.slot.lunch` | Öğle |
| `nutrition.slot.dinner` | Akşam |
| `nutrition.slot.snack` | Ara öğün |
| `nutrition.slot.preWorkout` | Antrenman öncesi |
| `nutrition.slot.postWorkout` | Antrenman sonrası |
| `nutrition.addFood` | + Besin ekle |
| `nutrition.copyYesterday` | Copy Yesterday |
| `nutrition.copyYesterday.confirmAppend` | Dünün öğünleri bugüne eklenecek. Bugün girdiklerin silinmez. |
| `nutrition.copyYesterday.emptySource` | Dün için kayıt yok. |
| `nutrition.copyMeal` | Copy Meal |
| `nutrition.copyMeal.pickSource` | Hangi günün hangi öğünü? |
| `nutrition.repeatBreakfast` | Repeat Breakfast |
| `nutrition.repeatSlot` | Son {slot} öğününü tekrarla |
| `nutrition.repeatSlot.none` | Son 7 günde bu öğün için kayıt yok. |
| `nutrition.savedMeal.saveAs` | Öğün olarak kaydet |
| `nutrition.savedMeal.namePrompt` | Kayıtlı öğün adı |
| `nutrition.savedMeal.tab` | Kayıtlı Öğünler |
| `nutrition.favorite.add` | Favorilere ekle |
| `nutrition.favorite.remove` | Favorilerden çıkar |
| `nutrition.search.tab.recent` | Son |
| `nutrition.search.tab.favorites` | Favoriler |
| `nutrition.search.tab.recipes` | Tarifler |
| `nutrition.search.tab.all` | Tümü |
| `nutrition.search.placeholder` | Besin ya da tarif ara |
| `nutrition.search.empty` | Sonuç yok. Yeni besin ekleyebilirsin. |
| `nutrition.grams` | Gram |
| `nutrition.servings` | Porsiyon ({unit}, {g} g) |
| `nutrition.source.seedUsda` | USDA |
| `nutrition.source.seedTrLabel` | TR etiket |
| `nutrition.source.user` | Kullanıcı |
| `nutrition.source.labelOverride` | Etiketten düzenlendi |
| `nutrition.dayTotal` | Gün toplamı |
| `nutrition.target` | Hedef {kcal} kcal · P {p} g |
| `nutrition.copiedFrom` | {date} tarihinden kopyalandı |
| `nutrition.entry.delete` | Sil |
| `nutrition.entry.edit` | Düzenle |
| `common.add` | Ekle |

**Servis / DB etkileri**

- `MealLogService`, `CopyService` (`copyDay`, `copyMeal`, `repeatSlot`, `insertSavedMeal`), `FoodCatalog`.
- `meal_logs` (`local_date_key`, `time_zone`, `logged_at_utc`, `meal_slot`, `copied_from_id`), `meal_entries` (`grams`, `kcal_snapshot`, `protein_g_snapshot`, `carb_g_snapshot`, `fat_g_snapshot`, `order_index`; `CHECK ((food_id IS NULL) <> (recipe_id IS NULL))`), `saved_meals`, `saved_meal_entries`, `food_favorites`, `nutrition_targets` (okuma).
- Her kopyalama tek transaction; kısmi öğün oluşmaz.

**Gereksinimler:** R109.1, R109.2, R111.2, R112.4, R112.5, R123.4.

---

### B.13 Beslenme – Tarif oluşturucu, porsiyon ve besin override

**Amaç:** "Tavuklu Pilav" gibi tarifi malzemelerle oluşturmak (R110.1), toplamı otomatik hesaplamak (R110.2), pişmiş ağırlığı (cooked yield) girmek (R110.3), porsiyonu pişmiş ağırlık oranıyla hesaplamak (R110.4), cooked yield yoksa ham toplamı kullanıp bunu belirtmek (R110.5). Besin değerlerini etiketten override etmek ve seed güncellemesinde korumak (R111.3).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | Malzeme yok | Ad alanı + "Malzeme ekle"; toplam 0 olarak değil "—" olarak gösterilir. |
| Yükleniyor | Düzenleme için tarif okunuyor | Skeleton. |
| Hata | Zod reddi (gram ≤ 0, cooked yield ≤ 0) / `DbWriteError` | Alan hatası / B.0 kuralı. |
| Normal – cooked yield yok | `cooked_yield_g IS NULL` | Toplam + 100 g başına değerler ham toplam üzerinden; bilgi satırı **"pişmiş ağırlık girilmedi, ham toplam kullanılıyor"**. |
| Normal – cooked yield var | `cooked_yield_g > 0` | 100 g pişmiş başına değerler; porsiyon hesaplayıcı aktif. |
| Uyarı | `cooked_yield_g > 2 × rawTotalG` veya `< 0.3 × rawTotalG` | "Pişmiş ağırlık ham toplama göre olağandışı görünüyor." (kaydetmeyi engellemez). |

**Akış – tarif**

1. Ad gir ("Tavuklu Pilav").
2. "Malzeme ekle" → besin arama sayfası (B.12) → gram (örn. 500 g chicken, 300 g rice, 20 g oil) → satır eklenir. `RecipeBuilder` her değişiklikte `Σ(ingredient nutrition)` ve `rawTotalG` hesaplar.
3. Opsiyonel "Pişmiş toplam ağırlık (g)" (örn. 1050). Boşsa `NULL`.
4. Özet kartı: toplam kcal/P/K/Y; `per100gCooked = Σ / (cookedYieldG ?? rawTotalG) × 100`; hangi taban kullanıldığı açıkça yazılır.
5. Porsiyon hesaplayıcı: "Porsiyon (g)" (örn. 350) → `portionG × per100gCooked / 100` anlık gösterilir.
6. "Kaydet" → tek transaction: `recipes` INSERT/UPDATE (`name`, `cooked_yield_g`, `note`), `recipe_ingredients` (`food_id`, `grams`, `order_index`; düzenlemede satırlar silinip yeniden yazılır, `ON DELETE CASCADE`).
7. Tarifi öğüne eklemek: B.12 arama → "Tarifler" sekmesi → porsiyon gramı → `meal_entries` (`recipe_id`, `grams`, snapshot'lar `per100gCooked` ile). Geçmiş entry'ler tarif sonradan değişse de snapshot sayesinde değişmez.

**Akış – besin override**

8. Besin detayı → "Etiketteki değerlerle düzenle" → 100 g başına alanlar (`kcal_per_100g`, `protein_g_per_100g`, `carb_g_per_100g`, `fat_g_per_100g`, `fiber_g_per_100g`), `serving_unit`, `serving_size_g`, `brand`.
9. "Kaydet" → `food_items` UPDATE: `source = 'label-override'`, `custom_edited = 1`, `last_updated = now`. Seed güncellemesi `custom_edited = 1` satırlarını atlar (R111.3). Bilgi satırı: "Bu değerler seed güncellemelerinde korunur."
10. Yeni besin: `source = 'user'`, `custom_edited = 1`.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `recipe.title` | Tarif oluştur |
| `recipe.name` | Tarif adı |
| `recipe.addIngredient` | Malzeme ekle |
| `recipe.rawTotal` | Ham toplam: {g} g |
| `recipe.cookedYield` | Pişmiş toplam ağırlık (g) |
| `recipe.cookedYield.hint` | Piştikten sonraki toplam ağırlık. Porsiyon hesabı buna göre yapılır. |
| `recipe.noCookedYield` | pişmiş ağırlık girilmedi, ham toplam kullanılıyor |
| `recipe.cookedYield.unusual` | Pişmiş ağırlık ham toplama göre olağandışı görünüyor. |
| `recipe.per100.cooked` | 100 g pişmiş başına |
| `recipe.per100.raw` | 100 g ham başına |
| `recipe.total` | Toplam: {kcal} kcal · P {p} g · K {c} g · Y {f} g |
| `recipe.portion` | Porsiyon (g) |
| `recipe.portionResult` | {g} g porsiyon: {kcal} kcal · P {p} g · K {c} g · Y {f} g |
| `recipe.save` | Tarifi kaydet |
| `recipe.addToMeal` | Öğüne ekle |
| `food.override.title` | Etiketteki değerlerle düzenle |
| `food.override.per100` | 100 g başına |
| `food.override.servingUnit` | Porsiyon birimi |
| `food.override.servingSize` | Porsiyon ağırlığı (g) |
| `food.override.preserved` | Bu değerler seed güncellemelerinde korunur. |
| `food.override.sourceNote` | Kaynak: {source} · Son güncelleme {date} |
| `food.new.title` | Yeni besin |
| `validation.positiveGrams` | Gram 0'dan büyük olmalı. |

**Servis / DB etkileri:** `RecipeBuilder`, `FoodCatalog`, `MealLogService`; `recipes`, `recipe_ingredients`, `food_items` (`source`, `custom_edited`, `last_updated`, `seed_version`), `meal_entries`.

**Gereksinimler:** R110.1–R110.5, R111.1–R111.3, R123.4.

---

### B.14 Progress fotoğrafları (PhotosScreen)

**Amaç:** Fotoğrafları app-private depoda tutmak (R116.1), albüme yazmamak (R116.2), cloud sync sunmamak (R116.3), silmede dosyayı da temizlemek (R116.4), ekran görüntüsü engellemeyi yalnızca Android'de opsiyonel sunmak (R116.5); ekranı privacy-sensitive view olarak ele almak (R94.4, R94.5).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | `progress_photos` boş | Açıklama + "Fotoğraf ekle"; gizlilik notu. |
| Yükleniyor | Satırlar + thumbnail'lar | Grid skeleton. |
| Hata | Dosya okunamadı (orphan satır) | Kart "Dosya bulunamadı" + "Kaldır" (satırı sil); `OrphanSweeper` bir sonraki açılışta zaten temizler. |
| Normal | Grid | Tarihe göre gruplu; `pose` rozeti; dokununca tam ekran görüntüleyici; iki fotoğrafı yan yana karşılaştırma. |
| Silme bekliyor | `pending_delete = 1` | Grid'de gösterilmez. |
| Arka plan | `AppState → inactive|background` | `PrivacyOverlay` tüm ekranı kapatır (B.18). |

**Akış – ekleme**

1. "Fotoğraf ekle" → kaynak: Kamera / Galeri (`ImagePicker`; `saveToPhotos: false`).
2. `pose` seç: `front`, `back`, `sideLeft`, `sideRight`, `frontFlexed`, `backFlexed`, `other`; tarih varsayılan bugün (geçmiş seçilebilir); opsiyonel not.
3. "Kaydet" → `PhotoStore.save()`: dosya `documentDirectory/photos/<uuid>.jpg`'ye kopyalanır (`sha256`, `bytes`, `width`, `height` hesaplanır) → tek transaction `progress_photos` INSERT (`taken_at_utc`, `local_date_key`, `time_zone`, `pose`, `file_name`, `bytes`, `sha256`, `width`, `height`, `note`). Galeri'den seçilen orijinal dosya **dokunulmaz**; kamera geçici dosyası silinir.

**Akış – silme**

4. Görüntüleyicide "Sil" → onay diyaloğu.
5. `PhotoStore.delete(id)`: (a) tx: `progress_photos.pending_delete = 1`; (b) dosya silinir; (c) tx: satır silinir. (b)/(c) arasında kesinti olursa `OrphanSweeper` açılışta `pending_delete = 1` satırlarını tamamlar (R116.4).

**Gizlilik**

6. `PrivacyShield` arka planda perde basar (R94.5). Android'de `settings['privacy.androidFlagSecure'] = true` ise ekran açılışında `preventScreenCaptureAsync()`, çıkışta serbest bırakılır. iOS'ta engelleme **sunulmaz**; ekranda kısa bilgi satırı (R94.6, R116.5).
7. Cloud sync ile ilgili hiçbir metin, anahtar ya da "yakında" ifadesi yoktur (R116.3). Fotoğraflar yalnızca yedek ZIP'inin `photos/` dizinine girer (R95.3).

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `photos.title` | Progress Photos |
| `photos.empty` | Henüz fotoğraf yok. Aynı ışık ve pozla düzenli çekim karşılaştırmayı kolaylaştırır. |
| `photos.add` | Fotoğraf ekle |
| `photos.source.camera` | Kamera |
| `photos.source.library` | Galeri |
| `photos.pose.front` | Ön |
| `photos.pose.back` | Arka |
| `photos.pose.sideLeft` | Sol yan |
| `photos.pose.sideRight` | Sağ yan |
| `photos.pose.frontFlexed` | Ön (kaslı) |
| `photos.pose.backFlexed` | Arka (kaslı) |
| `photos.pose.other` | Diğer |
| `photos.privacyNote` | Fotoğraflar yalnızca uygulamanın özel alanında saklanır; galeriye eklenmez ve buluta gönderilmez. |
| `photos.iosScreenshotNote` | iOS'ta ekran görüntüsü engellenemez. Arka plana geçince görüntü gizlenir. |
| `photos.androidSecureActive` | Ekran görüntüsü engelleme açık. |
| `photos.compare` | Karşılaştır |
| `photos.delete` | Sil |
| `photos.delete.confirm` | Fotoğraf kalıcı olarak silinecek; dosya da cihazdan kaldırılır. |
| `photos.fileMissing` | Dosya bulunamadı |
| `photos.removeRecord` | Kaydı kaldır |
| `photos.note` | Not |

**Servis / DB etkileri:** `PhotoStore` (`save`, `delete`), `OrphanSweeper` (açılışta), `PrivacyShield`, `expo-image-picker`, `expo-file-system` (`documentDirectory/photos/`), `expo-screen-capture` (Android); `progress_photos`.

**Gereksinimler:** R116.1–R116.5, R94.4–R94.6, R95.3, R93.1.

---

### B.15 Video fallback görünümü (ExerciseVideo / VideoFallback)

**Amaç:** Küratörlü manifest'ten (R114.1, R114.2) video oynatmak; video kaldırılmışsa veya ağ yoksa çökmeden (R114.3) teknik ipuçları, thumbnail ve kaynak linkiyle çalışmaya devam etmek (R114.4, AT-17); videoyu indirip yeniden host etmemek (R114.5).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş | Hareketin manifest'te kaydı yok (`video` yok) | Player alanı yerine yalnızca `cues[]` kartı; "Video yok" etiketi. |
| Yükleniyor | `react-native-youtube-iframe` yükleniyor; 8 s zaman aşımı | Thumbnail üzerine spinner. |
| Çevrimdışı | `NetInfo` bağlantı yok | Player hiç denenmez; doğrudan `VideoFallback`. |
| Hata / fallback | `onError` veya `onReady` 8 s içinde gelmedi (`VideoUnavailable`) | `VideoFallback`: thumbnail (`i.ytimg.com/vi/<videoId>/hqdefault.jpg`, yüklenemezse gri kutu), `cues[]` listesi, **"Kaynağa git"** (`fallbackUrl ?? sourceUrl`), `channelName`, `lastVerifiedAt`. |
| Normal | `onReady` | Gömülü resmi player; altında `cues[]` ve kaynak satırı her zaman görünür. |

**Akış**

1. Hareket sayfası açılır → `VideoManifest.get(exerciseId)`.
2. Çevrimdışı → adım 5. Çevrimiçi → player mount, 8 s sayaç.
3. `onReady` → sayaç iptal, normal.
4. `onError` / zaman aşımı → `VideoUnavailable` (sessiz, log yok) → adım 5.
5. `VideoFallback` render; "Kaynağa git" harici tarayıcıda açar. Sayfanın geri kalanı (set loglama, geçmiş, öneri) etkilenmez.
6. "Tekrar dene" fallback'te görünür; player'ı yeniden mount eder (bir kez daha 8 s).

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `video.loading` | Video yükleniyor… |
| `video.unavailable.title` | Video şu an oynatılamıyor |
| `video.unavailable.body` | Teknik ipuçları ve kaynak bağlantısı aşağıda. |
| `video.offline` | Çevrimdışısın; video için bağlantı gerekir. |
| `video.none` | Bu hareket için video yok |
| `video.cues.title` | Teknik ipuçları |
| `video.goToSource` | Kaynağa git |
| `video.channel` | Kanal: {channelName} |
| `video.lastVerified` | Son doğrulama: {date} |
| `video.retry` | Tekrar dene |

**Servis / DB etkileri:** `VideoManifest` (`data/exercise-videos.json`), `ExerciseVideo`, `VideoFallback`, `exercises.cues_json`; DB yazması yok. Ağ yalnızca bu bileşende kullanılır (02 §2.2).

**Gereksinimler:** R114.1–R114.5, R117.1, R117.4, AT-17, AT-18.

---

### B.16 Hata ekranları

**Amaç:** Hiçbir DB/ağ/video hatasında beyaz ekran olmaması (R117.1); her hata sınıfı için Türkçe mesaj ve uygun aksiyon (R117.3, R117.5); import rollback ve güvenli retry (R117.4). Tüm hata ekranları DB'ye ve ağa bağımlı olmadan render edilir.

**Ortak yapı:** başlık (Türkçe), bir cümle açıklama, birincil/ikincil aksiyon, **"Ayrıntılar"** açılır alanı (hata sınıfı, kod, zaman; hassas veri yok, R118.2).

#### B.16.1 DbOpenError

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Hata | `AppBootstrap` → `EncryptedSqliteProvider.open()` başarısız (anahtar yok/uyuşmuyor, dosya bozuk, `DbIntegrityError`) | Tam ekran: **"Veritabanı açılamadı."** + **Yeniden dene** · **Yedekten geri yükle** · **Destek bilgisi**. |
| Yükleniyor | "Yeniden dene" sırasında | Buton spinner; ekran kalır. |
| Normal | Açılış başarılı | Bootstrap devam eder (migration → app lock → sweeper). |

Akış: (1) **Yeniden dene** → `open()` tekrar; (2) **Yedekten geri yükle** → B.8 akışı; mevcut dosya `v90.pre-import.sqlite` olarak korunur, staging DB yeni oluşturulur (bozuk DB'ye yazılmaz); (3) **Destek bilgisi** → cihaz/uygulama sürümü ve hata kodu (kopyalanabilir metin; DB içeriği yok).

#### B.16.2 MigrationFailedScreen

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Hata | `MigrationRunner.run()` `ROLLBACK` + `.bak` geri kopyalandı | Tam ekran: **"Veritabanı güncellenemedi. Verilerin güvende; uygulamayı güncelleyip tekrar dene."** + **Yeniden dene** · **Yedeği dışa aktar**. Uygulama eski şemayla çalışmaz (03 §2). |
| Alan yetersiz | `.bak` kopyası alınamadı; migration **başlamadı** | **"Alan yetersiz"** ekranı: "Güncelleme için yeterli boş alan yok. Yer açıp tekrar dene." + Yeniden dene. |
| Yükleniyor | Migration çalışıyor | Splash'ta "Veritabanı güncelleniyor…" (kısa). |
| Normal | Başarı | Devam; `.bak` 7 gün sonra silinir. |

Akış: **Yeniden dene** → runner baştan (idempotent). **Yedeği dışa aktar** → B.7 export akışı (bkz. Tutarsızlık / açık nokta: eski şemalı DB'den export).

#### B.16.3 Import başarısız (ImportError)

B.8'de ayrıntılı: **"İçe aktarma başarısız; mevcut verin değişmedi."** + **Ayrıntılar** · **Tekrar dene**. `schemaTooNew` için **"Bu yedek daha yeni bir sürümle alınmış"**, Tekrar dene yok.

#### B.16.4 DbWriteError (satır içi)

Tam ekran değildir. Kaydetmeyi deneyen form/karta bağlı: **"Kaydedilemedi. Boş alanı kontrol et."** + **Yeniden dene**. Retry aynı `commandId` ile gider; `command_log` sayesinde çift yazma yoktur. Form verisi ekranda korunur.

#### B.16.5 ErrorBoundary

| Seviye | Yakalar | Görünüm |
|--------|---------|---------|
| Ekran düzeyi | Tek ekranın render hatası | Ekran alanında **"Bir şeyler ters gitti."** + **Yeniden yükle** · **Ana ekrana dön**; tab bar çalışır durumda kalır. |
| Kök | Her şey | Minimal tam ekran (yalnızca metin ve iki buton; DB/ağ/tema bağımlılığı yok): **"Bir şeyler ters gitti."** + **Yeniden yükle** · **Ana ekrana dön** + Ayrıntılar. |

Aktif antrenman ekranında boundary tetiklenirse veri kaybı yoktur (her şey zaten DB'de, R90); "Yeniden yükle" `useActiveWorkoutStore.hydrate()` ile aynı oturuma döner.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `error.dbOpen.title` | Veritabanı açılamadı. |
| `error.dbOpen.body` | Verilerin cihazda duruyor ama şu an açılamıyor. Yeniden dene ya da bir yedekten geri yükle. |
| `error.dbOpen.retry` | Yeniden dene |
| `error.dbOpen.restore` | Yedekten geri yükle |
| `error.dbOpen.support` | Destek bilgisi |
| `error.migration.title` | Veritabanı güncellenemedi. Verilerin güvende; uygulamayı güncelleyip tekrar dene. |
| `error.migration.retry` | Yeniden dene |
| `error.migration.export` | Yedeği dışa aktar |
| `error.migration.inProgress` | Veritabanı güncelleniyor… |
| `error.diskSpace.title` | Alan yetersiz |
| `error.diskSpace.body` | Güncelleme için yeterli boş alan yok. Yer açıp tekrar dene. |
| `error.import.title` | İçe aktarma başarısız; mevcut verin değişmedi. |
| `error.import.tooNew` | Bu yedek daha yeni bir sürümle alınmış |
| `error.dbWrite` | Kaydedilemedi. Boş alanı kontrol et. |
| `error.boundary.title` | Bir şeyler ters gitti. |
| `error.boundary.reload` | Yeniden yükle |
| `error.boundary.home` | Ana ekrana dön |
| `common.details` | Ayrıntılar |
| `common.tryAgain` | Tekrar dene |
| `error.details.copy` | Kopyala |

**Servis / DB etkileri:** `AppBootstrap`, `MigrationRunner`, `BackupImporter`, `ErrorBoundary`, `core/errors` (AppError taksonomisi → Türkçe mesaj haritası), `command_log`, `schema_migrations`, `.bak` dosyaları.

**Gereksinimler:** R92.5, R92.6, R95.7, R117.1–R117.5, R118.2, AT-15, AT-16.

---

### B.17 App lock ekranı (LockScreen)

**Amaç:** `'appLock.enabled' = true` iken açılışta ve ön plana dönüşte, grace süresi dolmuşsa biyometrik doğrulama istemek (R94.2); altında hiçbir içerik render etmemek; cihaz parolası fallback'i (R94.3).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Boş / kapalı | `'appLock.enabled'` yok veya `false` | LockScreen hiç mount edilmez. |
| Yükleniyor | `authenticateAsync` sistem diyaloğu açık | Logo + "Kilidi aç" pasif. |
| Hata – başarısız | Kullanıcı iptal etti / doğrulama başarısız | "Doğrulama başarısız." + **Kilidi aç** (yeniden prompt). Deneme sayısı sınırlanmaz; platform kendi kilitlemesini uygular. |
| Hata – biyometri kullanılamıyor | Enrolled kayıt silinmiş | Platform fallback'i (cihaz parolası) devreye girer; o da yoksa "Cihaz ayarlarından kilit ekle" metni; uygulama kilitli kalır. |
| Normal – kilitli | `now − lastUnlockedAtUtc > graceSeconds` | Tam ekran LockScreen, otomatik prompt. |
| Normal – açık | Doğrulama başarılı | `lastUnlockedAtUtc = now`; LockScreen kaldırılır, önceki ekran olduğu gibi görünür. |

**Akış**

1. `AppBootstrap`: DB açılır → `settings` okunur → `'appLock.enabled'` ise LockScreen, aksi hâlde uygulama. Splash'ta hiçbir veri gösterilmediği için DB açılışından önce kilit gerekmez.
2. `AppState → active`: `AppLockService` `now − lastUnlockedAtUtc > graceSeconds` ise LockScreen'i en üste basar (altındaki ağaç render edilmez; `PrivacyOverlay` bu sırada kaldırılır).
3. Otomatik `LocalAuthentication.authenticateAsync({ disableDeviceFallback: false, promptMessage: 'V90 kilidini aç' })`.
4. Başarı → `lastUnlockedAtUtc = now`, ekran kaldırılır. Başarısızlık → durum "Hata – başarısız", **Kilidi aç** butonu.
5. Kilitliyken rest timer ve `DayRolloverObserver` çalışmaya devam eder (zaman damgasından türetilir); bildirimler etkilenmez.
6. iOS'ta sistem biyometri diyaloğu `AppState`'i `inactive` yapar; `PrivacyShield` LockScreen görünürken `inactive` geçişini yok sayar (perde titremesi olmaz).

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `lock.title` | V90 kilitli |
| `lock.prompt` | V90 kilidini aç |
| `lock.unlockButton` | Kilidi aç |
| `lock.failed` | Doğrulama başarısız. |
| `lock.fallbackHint` | Biyometri çalışmazsa cihaz parolanı kullanabilirsin. |
| `lock.noCredential` | Bu cihazda kilit tanımlı değil. Cihaz ayarlarından Face ID, parmak izi ya da parola ekle. |

**Servis / DB etkileri:** `AppLockService` (`enabled`, `graceSeconds`, `lastUnlockedAtUtc`), `settings['appLock.enabled']`, `settings['appLock.graceSeconds']` (okuma), `expo-local-authentication`. DB yazması yok.

**Gereksinimler:** R94.1–R94.3, AT-19.

---

### B.18 PrivacyOverlay

**Amaç:** Uygulama arka plana/inactive'e geçerken app switcher snapshot'ında hassas içeriğin görünmemesi için platformun sunduğu yaklaşımı uygulamak: tüm ekranların üstüne opak logo perdesi (R94.5). Bu, ekran görüntüsü engelleme **değildir** ve öyle sunulmaz (R94.6).

**Durumlar**

| Durum | Koşul | Görünüm / davranış |
|-------|-------|--------------------|
| Gizli (normal) | `AppState = 'active'` | Perde mount edilmez. |
| Görünür | `AppState → 'inactive' | 'background'` | Opak perde (marka rengi + logo), animasyonsuz (snapshot anında tam kaplama için). |
| Kilitle birlikte | `'appLock.enabled'` ve grace dolmuş | Ön plana dönüşte perde kaldırılır, yerine LockScreen gelir (B.17). |
| İstisna | LockScreen görünürken iOS biyometri diyaloğu (`inactive`) | Perde basılmaz. |
| İstisna | Paylaşım sayfası / dosya seçici (`inactive`) — B.7, B.8 | Perde basılır; kullanıcı geri dönünce kalkar. Zararsız. |

**Akış**

1. `PrivacyShield` kök düzeyde `AppState`'i dinler.
2. `inactive`/`background` → `PrivacyOverlay` en üst katmanda render edilir; tüm ekranlar (yalnızca Photos/Labs değil) kapatılır — basitlik ve tutarlılık için.
3. `active` → önce `AppLockService` kontrolü (B.17), sonra perde kaldırılır.
4. Perde hiçbir DB/ağ okuması yapmaz; `ErrorBoundary` dışında da render edilebilir.

**Türkçe metinler**

| Anahtar | Metin |
|---------|-------|
| `privacyOverlay.label` | V90 |
| `privacyOverlay.a11y` | İçerik gizlendi |

**Servis / DB etkileri:** `PrivacyShield`, `PrivacyOverlay` (`shared/`), `AppLockService`; DB etkisi yok.

**Gereksinimler:** R94.4, R94.5, R94.6, R116.5.

---

### Tutarsızlık / açık nokta

- **MigrationFailed metni ve aksiyon adları üç yerde farklı:** 02 §12.1 "Veritabanı güncellenemedi. Verilerin güvende; uygulamayı güncelleyip tekrar dene." + yalnızca "Yedeği dışa aktar"; 02 §15 tablosu "Veritabanı güncellenemedi; verilerin güvende." + "Yeniden dene · Yedeği dışa aktar"; 03 §2 "yalnızca 'Yedeği dışa aktar' ve 'Tekrar dene'". Bu belge §12.1 metnini ve "Yeniden dene" adını kullandı; tek bir kaynakta sabitlenmeli.
- **MigrationFailedScreen'de "Yedeği dışa aktar" ne export eder?** 03 §2'ye göre uygulama eski şemayla çalışmaz ve `TableRegistry` yeni şemanın Zod şemalarıdır; eski şemalı DB'den `data.json` üretmek doğrulamada başarısız olabilir. Alternatif (şifreli `.bak` dosyasının ham kopyası) `THIS_DEVICE_ONLY` anahtar nedeniyle başka cihazda açılamaz. Hangisinin kastedildiği 02/03'te tanımlı değil.
- **`DbIntegrityError` için kullanıcı mesajı yok:** 02 §12.1 adım 1 ve 03 §2 checksum uyuşmazlığında `DbIntegrityError` üretir, ancak 02 §15 hata tablosunda bu sınıf yer almaz. Bu belge onu `DbOpenError` ekranına eşledi.
- **Başlangıç değerlerinin hedef tabloları:** R119.1'deki Weight 107 kg için `profiles` tablosunda kolon yok; bu belge `weight_logs`'a, cm değerlerini `body_measurements`'a (`is_baseline = 1`) yazmayı varsaydı. 02 §11.3 `seedInitialProfile()`'ın hangi tablolara yazdığını belirtmiyor.
- **`body_measurements.is_baseline` kolonu 02'de kullanılmıyor:** `BaselineResolver.biceps()` "program başlangıcına en yakın (±7 gün) ilk kayıt" kuralıyla çalışır; `is_baseline` kolonunu kimin, ne zaman set ettiği tanımsız. Bu belge onboarding ve ±7 gün kuralını birleştirdi; Day 90 raporu (AT-20) hangisini kullanacak, netleşmeli.
- **Biceps alan adları:** R96.2 `leftBicepsCm`, `rightBicepsCm`, `bicepsCm` adlarını verir; 03 `site` enum'u `bicepsLeftFlexed`, `bicepsRightFlexed`, `bicepsFlexed` kullanır. Eşleme mantıklı ama açıkça belgelenmemiş.
- **Meal entry `servings` alanı:** 02 §10 `entries[{foodId|recipeId, grams|servings}]` der; 03 `meal_entries` yalnızca `grams` saklar. Bu belge porsiyon girişini gram'a çevirip `grams` yazdı; `servings` kalıcı alan değil.
- **Kopyalamada snapshot kaynağı tanımsız:** `copyDay`/`copyMeal`/`repeatSlot` yeni `meal_entries` yazarken `kcal_snapshot` vb. eski snapshot'tan mı, güncel `food_items` değerinden mi hesaplanır? 02 sessiz; bu belge güncel değeri varsaydı.
- **Copy Yesterday çakışma davranışı:** Hedef günde aynı slot doluysa ekleme mi, üzerine yazma mı? 02 tanımlamıyor; bu belge "ekle" + onay diyaloğu seçti.
- **`repeatSlot(slot)` anlamı:** 02 "son 7 günün aynı slot'u" der; en yeni kaydı mı, hepsini mi kopyaladığı belirsiz. Bu belge en yeni kaydı varsaydı.
- **Saved meal kökeni izlenemiyor:** `meal_logs.copied_from_id` yalnızca `meal_logs`'a referans verir; kayıtlı öğünden eklenen öğün için `saved_meal_id` benzeri bir alan yok.
- **`bodyweightOnly` ekipman etiketi:** `EquipmentTag` listesinde yer alır ama kullanıcının kapatabileceği bir ekipman gibi görünür; `ExerciseCatalog.available()` kuralı (`equipment ⊆ available`) gereği kapatılırsa vücut ağırlığı hareketleri elenir. Her zaman mevcut sayılması gerektiği 02/03'te belirtilmemiş; bu belge "her zaman mevcut" etiketiyle gösterdi.
- **Android `FLAG_SECURE` ayarla bağlanmamış:** 02 §13.1 `PhotosScreen`/`LabsScreen`'in Android'de `preventScreenCaptureAsync()` çağırdığını koşulsuz yazar; R116.5 "opsiyonel privacy mode" ister ve 03 `privacy.androidFlagSecure` anahtarını listeler. Bu belge çağrıyı ayara bağladı.
- **Import "Geri al" 7 gün süresi nerede tutulur?** `pre-import` kopyaları dosya sistemindedir; içe aktarma zamanı DB dışında saklanmalı (DB'nin kendisi değişir). 02 bir konum tanımlamıyor (sidecar dosya ya da dosya mtime gerekir).
- **Fotoğraf dizinlerinin pre-import adı yok:** 02 §12.3 `photos/ ↔ photos.import/` swap der ama eski fotoğrafların 7 gün boyunca hangi dizinde tutulacağını (`photos.pre-import/` benzeri) adlandırmaz.
- **Import sırasında aktif oturum:** 02 aktif `workout_sessions` varken import'un engellenip engellenmediğini belirtmiyor; bu belge engelledi (aktif oturum, `ux_sessions_single_active` ve rest timer dosya değişimiyle çelişir).
- **Import için dosya seçici kütüphanesi:** 02 §2 teknoloji tablosu export için `expo-sharing` listeler; ZIP seçmek için gereken picker (`expo-document-picker` vb.) listelenmemiş.
- **Yedekleme ayar anahtarları tanımsız:** "Son yedek" zamanı ve "ayda bir hatırlatma" tercihi için `settings` anahtar adları 03'te yok (liste "…" ile açık uçlu). Öneri: `backup.lastExportAtUtc`, `backup.reminderEnabled`.
- **`schemaVersion` çift kaynak:** Hem `manifest.json` hem `data.json` `schemaVersion` taşır; hangisinin otoriter olduğu ve uyuşmazlıkta ne yapılacağı tanımsız.
- **"Lats/Back" görüntü grubu:** R106.1 örneğinde "Lats/Back 15" tek satırdır; `MuscleGroup`'ta `lats` ve `upperBack` ayrıdır. Progress ekranında birleştirilip birleştirilmeyeceği tanımsız; bu belge ayrı gösterdi.
- **Trend etiketi eşikleri:** `TrendCalculator` "up/down/stable" eşikleri 02'de yok; `04-domain-engines.md`'ye atıfta bulunuluyor ancak bu belge repoda bulunmuyor.
- **App lock ayarı şifreli DB içinde:** `'appLock.enabled'` `settings` tablosundadır; DB açılmadan kilit durumu bilinemez. Splash'ta veri gösterilmediği için pratik sorun yok, ancak `DbOpenError` ekranı kilit olmadan görünür (hassas veri içermez). İsteğe bağlı olarak anahtarın SecureStore'a aynalanması değerlendirilebilir.
- **Onboarding "sonra" seçeneği ve hatırlatma:** R96 dashboard CTA'sını tanımlar; "sonra" seçildiğinde ek bildirim/hatırlatma olup olmayacağı tanımsız. Bu belge yalnızca kalıcı CTA kullandı.
