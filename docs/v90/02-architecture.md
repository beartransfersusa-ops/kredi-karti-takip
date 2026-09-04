# V90 – Mimari Tasarım (Architecture)

> Bu belge `01-specification.md` (§87–§124) gereksinimlerini karşılayan mimariyi tanımlar. Veri modeli `03-data-model.md`, algoritmalar `04-domain-engines.md`, kabul testleri `05-acceptance-tests.md`, kararlar `adr/` altındadır. Gereksinim kimlikleri `R<bölüm>.<sıra>` biçimindedir.

## İçindekiler

1. Amaç, kapsam, ilkeler
2. Teknoloji yığını ve build stratejisi
3. Katmanlı mimari ve modül haritası
4. Sözlük (Glossary)
5. Zaman, takvim ve gün sınırı (§112, §113)
6. Program takvimi, antrenman sırası ve dondurma (§88, §89, §103)
7. Aktif antrenman: autosave, rest timer, hızlı UX, unilateral, kısmi (§90, §91, §102, §103, §108)
8. Hareket kataloğu, ekipman, değiştirme, artış adımları, yük davranışı (§98–§101)
9. Karar motorları: progression, plateau, hacim, analitik, PR, açıklanabilirlik (§104–§107, §121–§123)
10. Beslenme (§109–§111)
11. Ölçümler ve onboarding (§96, §97, §119, §120)
12. Kalıcılık: migration, şifreleme, yedekleme (§92, §93, §95)
13. Güvenlik ve gizlilik: app lock, fotoğraflar, analytics (§94, §116, §118)
14. Medya: video manifest ve doğrulama (§114, §115)
15. Hata yönetimi (§117)
16. Test stratejisi (§124)
17. İzlenebilirlik matrisi

---

## 1. Amaç, kapsam, ilkeler

V90; 90 günlük hipertrofi odaklı bir challenge'ı yöneten, **offline-first**, **tek kullanıcılı**, **cihazda saklanan** bir mobil uygulamadır. Sunucu yoktur; tüm veri cihazdaki şifreli SQLite veritabanındadır.

Tasarım ilkeleri (gereksinimlerden türetilmiştir):

| İlke | Kaynak | Anlamı |
|------|--------|--------|
| **DB tek doğruluk kaynağıdır** | R90.7 | UI store'lar DB'nin türevidir; her kullanıcı eylemi önce DB'ye yazılır, sonra UI güncellenir. |
| **Zaman damgasından türet, sayaç tutma** | R91.3 | Süre/gün hesapları her zaman saklanan zaman damgalarından yeniden hesaplanır. |
| **Sessiz ilerleme yok** | R88.3, R89.7 | Antrenman sırası yalnızca açık kullanıcı kararıyla veya tamamlanmayla ilerler. |
| **Koç, diktatör değil** | R121, R122 | Her öneri gerekçeli, kabul/değiştir/yok say ile kapanır, karar geçmişte saklanır. |
| **Bilinmeyen = null** | R119.3 | Ölçülmemiş değer sıfır değildir; UI "ekle" CTA'sı gösterir. |
| **Veri asla kaybolmaz** | R90, R92, R95 | Autosave, transactional migration, rollback'li import. |
| **Gizlilik varsayılan** | R93, R94, R116, R118 | Şifreli DB, app-private medya, analytics OFF. |
| **Sahte kesinlik yok** | R123 | Tahminler etiketlenir, trendler öne çıkar. |
| **Beyaz ekran yok** | R117 | Her hata sınıfı için tanımlı fallback ve Türkçe mesaj. |

---

## 2. Teknoloji yığını ve build stratejisi

| Katman | Seçim | Gerekçe / Not |
|--------|-------|---------------|
| Uygulama | **React Native + Expo SDK (≥ 52)**, TypeScript `strict` | Bölüm I'deki ürün kararıyla uyumlu. |
| Yönlendirme | Expo Router | Dosya tabanlı; deep link'ler (bildirimden aktif antrenmana dönüş). |
| Veritabanı | **`expo-sqlite`** + **SQLCipher** (`useSQLCipher: true` config plugin) | R93.2. SQLCipher Expo Go'da çalışmaz → **Expo Development Build** zorunludur (R93.4). |
| Anahtar saklama | `expo-secure-store` (Keychain / Keystore) | R93.6 |
| Biyometri | `expo-local-authentication` | R94 |
| Bildirim | `expo-notifications` (yalnızca yerel bildirim) | R91.5 |
| Dosya sistemi | `expo-file-system` (`documentDirectory/photos/`) | R116.1 |
| Ekran yakalama | `expo-screen-capture` (yalnızca Android FLAG_SECURE için) | R116.5 |
| Doğrulama | **Zod** | R95.6, R119.4 |
| UI state | Zustand (ince, DB-türevi store'lar) | R90.7 |
| Tarih/saat | `date-fns` + `date-fns-tz`; IANA tz `Intl` üzerinden | §112 |
| ZIP | `react-native-zip-archive` (native) — soyutlama arkasında; alternatif `fflate` | R95.4 |
| Dosya seçici / paylaşım | `expo-document-picker` (import), `expo-sharing` (export) | R95 |
| Video | `react-native-youtube-iframe` (resmi IFrame Player API, WebView) | R114.5 |
| Test | Jest + `@testing-library/react-native`; DB testleri Node'da `better-sqlite3`/`@journeyapps/sqlcipher` ile aynı SQL üzerinden; E2E: Maestro | §124 |
| Analytics | **Yok** (v1). Eklenirse `analytics/` allowlist şeması zorunlu | R118 |

### 2.1 Build profilleri

| Profil | DB sağlayıcı | Hedef |
|--------|--------------|-------|
| `development` (dev client) | `EncryptedSqliteProvider` | Gerçek şifreleme ile geliştirme. |
| `expo-go` (yalnızca UI prototipleme) | `PlainSqliteProvider` | **Sadece** `__DEV__ && !isProductionBuild`. Production'da import edilmesi build-time hata (R93.7). |
| `preview` / `production` (EAS) | `EncryptedSqliteProvider` | `app.config.ts` içinde `useSQLCipher: true`; `PlainSqliteProvider` `babel`/`metro` alias ile boş modüle bağlanır ve `assertEncryptedProviderInProduction()` startup'ta çalışır. |

### 2.2 Offline garantisi (AT-18)

Uygulamanın hiçbir core workout özelliği ağ gerektirmez. Ağ yalnızca: video oynatma (fallback'li), opsiyonel harici besin araması (v1'de yok). `NetInfo` yalnızca video bileşenine bilgi verir; başka hiçbir yol ağı beklemez.

---

## 3. Katmanlı mimari ve modül haritası

```
app/                                   # expo-router rotaları (yalnızca kompozisyon)
src/
  core/
    clock/          Clock (now(), tz()) — test için enjekte edilebilir
    time/           localDateKey, dayBoundary, tz yardımcıları (§5)
    db/
      provider/     DatabaseProvider, EncryptedSqliteProvider, PlainSqliteProvider
      migrations/   001_initial.ts … + MigrationRunner
      repositories/ Tablolara erişim; her public metot transaction sınırı belirtir
      keys/         DbKeyManager (SecureStore)
    errors/         AppError taksonomisi, ErrorBoundary, hata → Türkçe mesaj haritası
    notifications/  LocalNotificationScheduler (rest timer)
    backup/         BackupExporter, BackupImporter, BackupArchiver, backup migrators
    security/       AppLockService, PrivacyShield
    media/          PhotoStore (app-private), OrphanSweeper, VideoManifest
  domain/           Saf TypeScript, React'e bağımsız, %100 unit test edilebilir
    program/        ChallengeCalendar, TrainingSequence, Scheduler, PauseService, MissedWorkoutResolver
    workout/        ActiveSessionService, SetLogService, RestTimerService, PrDetector
    exercise/       ExerciseCatalog, SubstitutionEngine, IncrementResolver, LoadBehavior
    progression/    ProgressionEngine, PlateauEngine, VolumeGuardrails, RecommendationService
    analytics/      VolumeAnalytics, AdherenceCalculator, TrendCalculator (7d/28d), ChallengeReportService (Day 90)
    nutrition/      FoodCatalog, RecipeBuilder, MealLogService, CopyService
    measurements/   MeasurementService, MeasurementQuality, BaselineResolver, MeasurementGuide
    profile/        Onboarding, TrainingProfile, EquipmentProfile
  features/         Ekran/bileşen düzeyinde React kodu (feature-sliced)
    active-workout/ program/ progress/ nutrition/ measurements/ settings/ …
  shared/           UI kit (NumericStepper, BigButton, PrivacyOverlay…)
data/
  exercises.json            Küratörlü hareket kataloğu (seed)
  exercise-videos.json      Video manifest (§114)
  foods.seed.json           Seed besinler (§111: source alanı zorunlu)
  programs/v90.json         V90 default program şablonu
scripts/
  verify-exercise-videos.ts # npm run verify:exercise-videos (§115)
```

**Bağımlılık yönü:** `features → domain → core`. `domain` React'e ve Expo'ya bağımlı değildir; yalnızca repository arayüzlerine (port) bağlıdır. Bu, algoritmaların (§104–§107) Node ortamında hızlı ve deterministik test edilmesini sağlar.

**Transaction kuralı:** Kullanıcıya görünen her eylem tek bir `db.withTransaction(async tx => …)` çağrısıyla atomik yazılır. Repository metotları `tx` parametresi alır; transaction sınırını servis belirler.

---

## 4. Sözlük (Glossary)

| Terim | Tanım |
|-------|-------|
| **challengeDay** | Program başlangıcına göre 1..90 arası takvim günü. `strictCalendar` modunda gerçek gün farkı; `activeDays` modunda dondurulmuş günler düşülür. Saklanmaz, türetilir. |
| **trainingSequenceIndex** | Program şablonundaki (`WorkoutTemplate[]`) bir sonraki yapılacak antrenmanın 0 tabanlı indeksi. Saklanır (`programs.training_sequence_index`). Yalnızca `advanceSequence()` ile artar. |
| **WorkoutTemplate** | Şablon antrenman (örn. "Day 5 – V-Taper Upper"): hareket listesi, set/rep/RIR hedefleri. |
| **ScheduledWorkout** | Belirli bir `plannedDateKey` için planlanmış şablon örneği. Durum makinesi §6.3. |
| **WorkoutSession** | Gerçekten yapılan (veya yapılmakta olan) antrenman; `startedAtUtc`, `completedAtUtc`, `calendarDateKey` ayrı. |
| **SetLog** | Tek bir set kaydı; her biri kendi transaction'ında yazılır. |
| **localDateKey** | `YYYY-MM-DD`, kaydın oluşturulduğu andaki cihaz timezone'una göre yerel tarih. |
| **exposure** | Bir hareketin bir oturumda en az bir working set ile yapılması. Plateau sayımı exposure üzerindendir. |
| **effectiveLoad** | `loadProgressionType`'a göre "daha yüksek = daha zor" olacak biçimde normalize edilmiş yük (§8.4). |
| **Recommendation** | Gerekçeli, kanıt referanslı, kullanıcı kararı bekleyen öneri nesnesi (§9.6). |
| **direct set** | Hareketin `primaryMuscle`'ı hedef kas olan working set. |

---

## 5. Zaman, takvim ve gün sınırı (§112, §113)

### 5.1 Saklama kuralı

Zaman içeren her kayıt üç bilgi taşır:

```ts
interface Timestamped {
  occurredAtUtc: string;   // ISO 8601, 'Z' sonlu — sıralama ve süre hesapları için
  localDateKey: string;    // 'YYYY-MM-DD' — "hangi güne ait" sorusu için, yazıldığı anda sabitlenir
  timeZone: string;        // IANA, örn. 'Europe/Istanbul' — denetim ve düzeltme için
  utcOffsetMinutes?: number; // yalnızca workout_sessions'ta saklanır; diğer tablolarda tz + utc'den türetilir
}
```

`localDateKey` **yazıldığı anda** hesaplanır ve daha sonra timezone değişse bile **yeniden hesaplanmaz** (R112.2, R112.4). Sorgular "bugünün logları" için `localDateKey = todayKey(clock)` kullanır; UTC aralığı kullanmaz.

**İstisna (oturuma bağlı kayıtlar):** `set_logs.local_date_key`, `rest_timers` ve `personal_records.local_date_key` yazıldıkları anın tarihini değil, ait oldukları oturumun `workout_sessions.calendar_date_key` değerini alır (R113.1: 00:10'da loglanan set, 23:50'de başlayan antrenmanın gününe aittir). `calendar_date_key` override edildiğinde bu kayıtlar aynı transaction'da birlikte taşınır.

### 5.2 `Clock` portu

```ts
interface Clock {
  nowUtc(): Date;
  timeZone(): string;                // cihazın güncel IANA tz'si
  todayKey(): string;                // localDateKey(nowUtc(), timeZone())
}
```

Tüm domain kodu `Clock` alır; testler `FakeClock` ile saat, gün ve timezone değiştirir (AT-03, AT-13).

### 5.3 Gün sınırı ve antrenman tarihi (§113)

- `WorkoutSession.calendarDateKey` varsayılanı `localDateKey(startedAtUtc, timeZoneAtStart)` (R113.3). 23:50'de başlayıp 00:10'da biten antrenman başlangıç gününe aittir.
- Kullanıcı oturum özetinde tarihi değiştirebilir (R113.4); değişiklik `calendar_date_overridden = 1` ile işaretlenir.
- Beslenme ve ölçüm kayıtları için gün, kaydın oluşturulduğu andaki yerel tarihtir; kullanıcı "dün" için giriş yapabilir (tarih seçici), bu da `localDateKey`'i açıkça ayarlar.

### 5.4 Gün geçişi (rollover)

`DayRolloverObserver`: uygulama ön plana geldiğinde ve dakikada bir `clock.todayKey()` ile son bilinen anahtarı karşılaştırır; değiştiyse `DAY_CHANGED` olayı yayar. Dashboard, aktif antrenman ekranı (rest timer hariç) ve program takvimi bu olaya abone olur. Böylece gece yarısı açık kalan ekranlar tutarlı güncellenir (R112.5).

### 5.5 Timezone değişimi

`clock.timeZone()` değiştiğinde (`TZ_CHANGED`): mevcut kayıtlar dokunulmaz; challengeDay yeni tz'deki `todayKey` ile hesaplanır. `Day X/90` en fazla bir gün ileri/geri görünebilir ve bu **beklenen** davranıştır; hiçbir kaydın günü kaymaz (AT-13). Aktif oturum başlangıç tz'sini saklar; kalan rest süresi UTC'den hesaplandığı için etkilenmez. Doğuya seyahatte yerel gün atladığı için bugünün planı anında `missed` görünebilir; kaçırılan antrenman kartı bu durumda "Saat dilimi değişti" alt metniyle gösterilir ve aynı üç seçeneği sunar (sessiz atlama yok).

---

## 6. Program takvimi, antrenman sırası ve dondurma (§88, §89, §103)

### 6.1 İki bağımsız state

```
Program
 ├─ startDateKey: '2026-09-07'
 ├─ calendarMode: 'strictCalendar' | 'activeDays'   (default strictCalendar, R89.6)
 ├─ trainingSequenceIndex: 4                          (→ sıradaki şablon: templates[4] "Day 5 – V-Taper Upper")
 └─ pauses: [{ startDateKey, endDateKey|null, reason }]

challengeDay(today) =
  strictCalendar: clamp(daysBetween(startDateKey, today) + 1, 1, 90)
  activeDays    : clamp(daysBetween(startDateKey, today) + 1 - pausedDays(startDateKey..today), 1, 90)
```

`pausedDays` dondurma aralıklarındaki tam yerel gün sayısıdır: aralık `[start_date_key, end_date_key)` (başlangıç günü dahil, devam günü hariç); hâlâ açık dondurma için geçici bitiş `end_date_key ?? today` alınır, böylece `challengeDay` dondurma boyunca monoton kalır. `challengeDay` hiçbir tabloda saklanmaz; `ChallengeCalendar.challengeDay(clock)` ile `{ day, phase }` olarak türetilir (R88.1, R88.2). `phase ∈ {'notStarted','active','finished'}`: `today < start_date_key` ise `notStarted` (Day 1 gibi gösterilmez, "Başlangıç: <tarih>" gösterilir); 90. gün geçildiyse `finished`.

### 6.2 Planlama (scheduling)

`Scheduler.ensurePlanned(today)`:
1. Program `active` değilse (paused/completed) hiçbir şey yapma (R89.3).
2. `trainingSequenceIndex` için açık (`planned`/`inProgress`) bir `ScheduledWorkout` yoksa ve karar bekleyen kısmi antrenman yoksa (`partiallyCompleted ∧ partial_decision IS NULL` → önce karar), kullanıcının tercih ettiği antrenman günlerine (`preferredWorkoutDays`) göre `earliest`'ten itibaren ilk uygun güne bir tane oluştur. `earliest = max(today, start_date_key)`; bir tamamlanma/`countAsDone` sonrasında `earliest = max(today, session.calendar_date_key + 1)` (aynı güne ikinci plan konmaz, ertesi gün sahte "kaçırıldı" üretilmez).
3. **Yalnızca sıradaki bir antrenman planlanır.** Gelecek antrenmanlar takvimde "öngörü" olarak (sanal, saklanmadan) gösterilir; böylece bir kaçırma tüm takvimi kaydırmaz ve sıra hiçbir zaman ileri atlamaz.

### 6.3 `ScheduledWorkout` durum makinesi

```
              ┌────────────┐  reschedule(newDate)   ┌─────────────┐
   create ───►│  planned   │───────────────────────►│ rescheduled │ (terminal; rescheduledToId → yeni planned)
              └─────┬──────┘                        └─────────────┘
                    │ startSession()
                    ▼
              ┌────────────┐ finish(all done)       ┌─────────────┐
              │ inProgress │───────────────────────►│  completed  │ ─► advanceSequence()
              └─────┬──────┘                        └─────────────┘
                    │ finish(partial, "Bugün burada bitir")
                    ▼
              ┌────────────────────┐  karar: "bitmiş say" ─► advanceSequence()
              │ partiallyCompleted │  karar: "kalanı sonraki güne taşı" ─► yeni planned (aynı sequenceIndex, remainingExerciseIds)
              └────────────────────┘
   planned ──skip("Gerçekten atla")──► skipped ─► advanceSequence()
   inProgress ──cancelSession()──► planned (oturum 'cancelled', plan geri açılır; sıra ilerlemez)
```

- **`missed`** saklanan bir durum değildir; `planned && plannedDateKey < today && program.active` koşuluyla türetilir (R88.4 uyumlu, ek durum eklemeden).
- `advanceSequence()` yalnızca üç geçişten çağrılır: `completed`, `skipped`, `partiallyCompleted + "bitmiş say"` (R88.6). Fonksiyon aynı transaction içinde `programs.training_sequence_index += 1` yapar ve `sequence_events` tablosuna denetim kaydı yazar.
- Şablon listesinin sonuna gelindiğinde: `program_templates.is_cyclic = 1` ise indeks `templates.length` modunda başa döner ve `programs.sequence_wraps` bir artar (V90 rotasyonu döngüseldir); `is_cyclic = 0` ise indeks `templates.length` nöbetçi değerinde kalır (`isExhausted`) ve program tamamlama akışı (§6.5) tetiklenir.
- **`cancelSession`** yerinde geri açar: `inProgress → planned` (aynı satır, yeni kayıt yok; `reschedule_reason` yazılmaz). Oturum `cancelled` olur, setleri `discarded=1` ile kalır, bu oturumda üretilmiş `personal_records` satırları `voided=1` olur.
- **Başlatma ve tarih:** `planned_date_key ≠ today` olan bir plan başlatılırken (kaçırılmış ya da erken) önce `reschedule(today, 'moveToToday')` uygulanır; değişmez: açık/tamamlanmış planın `planned_date_key` = oturumun `calendar_date_key` (override hariç).
- **Kısmi karar bekliyor:** bitirme ile karar arasında uygulama kapanırsa durum `partiallyCompleted ∧ partial_decision IS NULL` kalır; açılışta "Kısmi antrenman kararı bekliyor" kartı gösterilir ve karar verilmeden yeni plan oluşturulmaz/antrenman başlatılmaz. Kalan hareketler `remaining_exercise_ids_json`'a **bitirme transaction'ında** yazılır (hareket düzeyinde; yarım kalan hareket devamda tam `planned_working_sets` ile planlanır). "Kalanı sonraki güne taşı" varsayılan olarak `preferredWorkoutDays`'e göre ertesi ilk uygun günü seçer; kullanıcı tarih seçiciyle değiştirebilir (`moveToDate`).

### 6.4 Kaçırılan antrenman akışı (R88.3, R88.5)

Uygulama açıldığında / gün değiştiğinde `MissedWorkoutResolver.detect()` türetilmiş `missed` planları bulur ve ana ekranda **"Kaçırılan antrenman: Day 5 – V-Taper Upper (Perşembe)"** kartı gösterir:

| Buton | Etki |
|-------|------|
| **Bugüne taşı** | `reschedule(today)` → eski kayıt `rescheduled`, yeni `planned(today)`. Sıra değişmez. |
| **Başka güne taşı** | Tarih seçici → `reschedule(date)`; `date < today` reddedilir (`InvalidRescheduleDateError`, plan anında yeniden `missed` olurdu). Sıra değişmez. |
| **Gerçekten atla** | Onay diyaloğu ("Bu antrenman tamamen atlanacak, sıradaki antrenmana geçilecek.") → `skipped`, `advanceSequence()`. |

Karar verilmeden yeni antrenman başlatılamaz; ancak kullanıcı "Bugüne taşı" ile aynı ekrandan doğrudan başlayabilir. Kart kapatılabilir ama ertesi gün yeniden görünür (sessiz atlama yok); kapatma bilgisi `settings['missedCard.dismissedDateKey']` içinde tutulur ve `DAY_CHANGED`'de geçersizleşir.

### 6.5 Dondurma (§89)

```
Program.status: 'active' | 'paused' | 'completed' | 'abandoned'
pause(reason?) : status=paused; program_pauses INSERT(startedAtUtc, startDateKey, reason)
resume()       : status=active; program_pauses UPDATE endedAtUtc, endDateKey; Scheduler.ensurePlanned(today)
```

- Dondurma anında açık `planned` kayıt `plannedDateKey` korunarak kalır; `missed` türetimi `program.active` şartı nedeniyle susar (R89.3).
- Resume'da açık plan bugüne veya ilk uygun güne otomatik taşınır (`rescheduled` + yeni `planned`, `reason='resume'`), sıra aynı kalır (R89.4).
- `calendarMode` her an değiştirilebilir; challengeDay türetildiği için geçmiş bozulmaz (R89.5). Mod değişimi `settings_history`'ye yazılır.
- Dondurma sırasında beslenme/ölçüm/uyku logu serbesttir.
- **Guard'lar:** aktif oturum varken (`ActiveSessionExistsError`) veya karar bekleyen kısmi antrenman varken (`PendingPartialDecisionError`) dondurma reddedilir; dondurulmuş programda `advanceSequence()` `ProgramNotActiveError` fırlatır.
- **Sırayı düzelt (manuel):** Program Settings'te açık ve onaylı bir "Antrenman sırasını düzelt" eylemi vardır (yalnızca açık plan ve aktif oturum yokken). `advanceSequence()`'ten geçmez; doğrudan `programs.training_sequence_index` yazar ve `sequence_events.cause='manualAdjust'` kaydı bırakır. Bu, R88.6'nın "başka hiçbir yol" kuralının tek, kullanıcı-açık istisnasıdır ve hiçbir zaman otomatik tetiklenmez.
- **Program tamamlama:** `challengeDay.phase='finished'` (90. gün geçti) veya lineer şablonda `isExhausted` olduğunda ana ekranda "Day 90 tamamlandı — raporunu gör" kartı çıkar; kullanıcı **"Programı tamamla"** derse `programs.status='completed'`, `completed_at_utc` yazılır ve Day 90 raporu üretilir (§9.7). Otomatik kapatma yoktur; kullanıcı isterse dondurabilir veya devam edebilir (takvim `finished` gösterir, sıra çalışmaya devam eder).

### 6.6 Adherence (§103.4)

`AdherenceCalculator.week(weekStartKey)` → `{ completed, partial, skipped, missed, rescheduledOut, planned }`; UI dört ayrı renk/etiketle gösterir. Kısmi antrenmanlar `completed`'a **dahil edilmez**; ayrı sütunda tutulur ve isteğe bağlı olarak `tamamlanma oranı = yapılan working set / planlanan working set` ile gösterilir (R103.4).

**Sayım birimi `scheduled_workouts` satırıdır, oturum değil.** Bir kısmi antrenman ve onun devam planı (`partialContinuation`) aynı `sequence_index`'i paylaşan iki ayrı satırdır: ilki `partiallyCompleted`, ikincisi kendi sonucuyla sayılır. Böylece aynı antrenman iki kez "tamamlandı" sayılmaz. Devam planı yine kısmi bitebilir (zincir); zincir uzunluğu UI'da "2. devam" gibi gösterilir.

**Durum sözlüğü (bilinçli fark):** plan tarafında `scheduled_workouts.status='partiallyCompleted'`, oturum tarafında `workout_sessions.status='partial'` kullanılır; ikisi aynı olguyu farklı tablolarda adlandırır. Resume kartından bitirmede `ended_reason='resumeCardFinish'` yazılır; tam/kısmi ayrımı `workout_sessions.status` ile yapılır.

---

## 7. Aktif antrenman (§90, §91, §102, §103, §108)

### 7.1 Autosave modeli (§90)

- **Tek aktif oturum** kısıtı: `workout_sessions` üzerinde `UNIQUE INDEX WHERE status='active'`.
- `ActiveSessionService.start(scheduledWorkoutId | templateId)` tek transaction: `workout_sessions` INSERT (`status='active'`, `startedAtUtc`, `calendarDateKey`, `timeZone`, `bodyweight_kg_snapshot` = son 14 gün içindeki son `weight_logs` kaydı, yoksa `NULL`), `session_exercises` INSERT (şablondaki hedeflerle; prefill değerleri saklanmaz, `hydrate()` sırasında §7.3 sırasıyla hesaplanır), `scheduled_workouts.status='inProgress'` (gerekirse önce `reschedule(today)`, §6.3).
- Her kullanıcı eylemi bir **komut** olarak modellenir ve hemen DB'ye yazılır:

| Komut | Yazılan |
|-------|---------|
| `completeSet` | `set_logs` INSERT (tek transaction, R90.6) + PR tespiti (aynı tx) + rest timer başlat |
| `editSet` | `set_logs` UPDATE + `set_log_revisions` INSERT (denetim) |
| `substituteExercise` | `session_exercises.exercise_id` UPDATE, `original_exercise_id` korunur; harekete set loglanmışsa reddedilir (`SetAlreadyLoggedError`) — bunun yerine `addExercise` |
| `addExercise` / `setTrackingMode` | `session_exercises` INSERT (oturuma yeni hareket) / `tracking_mode` UPDATE (yalnızca set loglanmadan önce) |
| `finishSession` / `cancelSession` / `decidePartial` / `overrideCalendarDate` | §6.3 ve §7.5'teki geçişler; hepsi tek transaction |
| `skipExercise` / `reorderExercises` | `session_exercises` UPDATE |
| `startRest` / `skipRest` | `rest_timers` INSERT/UPDATE |
| `setNote` | `session_exercises.note` / `workout_sessions.note` |
| `draftInput` (klavye/stepper değeri) | `session_exercises.draft_load_json/draft_reps/draft_rir` — henüz tamamlanmamış setin taslağı da kaybolmaz |

- UI store (`useActiveWorkoutStore`) yalnızca DB'den `hydrate()` ile dolar; optimistic update yoktur, yazma bittikten sonra store güncellenir (< 10 ms; SQLite yerel).
- Uygulama açılışında (`AppBootstrap`) `ActiveSessionService.findActive()` → varsa **"Devam eden antrenmanın var."** kartı: **Devam Et** (ekrana git), **Antrenmanı Bitir** (özet → completed/partial kararı), **Antrenmanı İptal Et** (onay → `status='cancelled'`, set kayıtları **silinmez**, `discarded=1` ile işaretlenir; plan `planned`'a döner) (R90.4, R90.5).
- `AppState` `background`/`inactive` geçişlerinde ek bir şey yapılmaz; çünkü yazılacak hiçbir şey bellekte bekletilmez (R90.2). Sadece `flushDraftInputs()` çağrılır (stepper'da bekleyen ama commit edilmemiş değer).
- **Dayanıklılık:** DB `journal_mode=WAL` + `synchronous=FULL` ile açılır; her `COMMIT` fsync'lenir. Uygulama çökmesi (process ölümü) WAL sayesinde, ani güç kaybı/telefon restart'ı `synchronous=FULL` sayesinde son tamamlanan seti korur. Yarım kalan transaction (örn. `completeSet` sırasında crash) atomik olarak geri alınır; set ya tamamen vardır ya hiç yoktur ve `command_id` ile güvenle tekrarlanır.

### 7.2 Rest timer (§91)

```ts
interface RestTimer {
  id; sessionId; sessionExerciseId?; setLogId?;
  restStartedAtUtc: string; restDurationSeconds: number;
  state: 'running' | 'completed' | 'skipped';
  notificationId: string | null;
}
remaining = clamp(restDurationSeconds - floor((clock.nowUtc() - restStartedAtUtc)/1000), 0, restDurationSeconds)  // cihaz saati geri alınırsa süreden büyük çıkmaz
```

- `start(duration)`: INSERT `running`, sonra `LocalNotificationScheduler.schedule(at = restStartedAt + duration, body: 'Dinlenme bitti – sıradaki set')` → `notificationId` UPDATE (R91.5). Bildirim izni yoksa sessizce atlanır; timer yine çalışır.
- `skip()`: `state='skipped'`, `cancelNotification(notificationId)` (R91.6). Oturum bitişi/iptali: çalışan timer süresi dolmamışsa `skipped` + bildirim iptali, dolmuşsa `completed`.
- `setInterval` (1 s) yalnızca ekranı yeniler; kalan süre her tick'te formülden hesaplanır (R91.3). Ön plana dönüşte (`AppState → active`) bileşen yeniden hesaplar (R91.7); uygulama yeniden başlatılırsa `rest_timers WHERE state='running'` tek satırı okunur (R91.8).
- Süre dolmuşsa `state` tembel olarak `completed` yapılır (yazma, ilk okunuşta).
- Ekran uyku engelleme yok; timer ekran kapalıyken de doğru çalışır çünkü durum zamana bağlıdır (AT-03).

### 7.3 Hızlı UX (§108)

`NumericStepper` bileşeni: büyük değer, `−step` / `+step` butonları (`step = IncrementResolver.forExercise(exerciseId)`), basılı tutunca hızlanan artış, dokununca klavye. Reps `[-] 11 [+]`, RIR segment `0 1 2 3 4+`. Prefill sırası: (1) aynı oturumda önceki set, (2) **kabul edilmiş** `Recommendation` değeri ("önerilen" rozetiyle; ilk working set'te son oturumun değerini gölgelemez — R121.2), (3) son oturumda aynı set indeksi, (4) şablon hedefi. Karar verilmemiş öneri kullanıcı set'i tamamlarsa `ignored` olarak kapatılır ve loglanan değer `decision_value_json`'a yazılır. **"Seti Tamamla"** tek büyük buton; tamamlama sonrası sonraki setin prefill'i hazır. Hedef: ≤ 3 dokunuş / set (R108.4), Maestro testi ile ölçülür.

### 7.4 Unilateral (§102)

- `Exercise.isUnilateral = true` ise oturumda `session_exercises.tracking_mode ∈ {'bothSame','separate'}` (varsayılan: son kullanılan, ilk kez `bothSame`).
- `separate` modunda her set indeksi için iki `set_logs` satırı (`side='left'`, `side='right'`), aynı `set_index`. `bothSame` modunda tek satır `side='both'`.
- **Hacim sayımı:** set sayısı = `COUNT(DISTINCT set_index)`; hacim (kg·rep) `separate`'ta taraf toplamı, `bothSame`'de `load×reps×2` değil `load×reps` olarak **hareket tanımına göre** (`volumeMultiplier`, unilateral hareketler için 1) hesaplanır (R102.4).
- PR ve progression taraf bazında (`separate`) veya birlikte (`bothSame`) çalışır; en zayıf taraf öneriyi belirler (R102.3).

### 7.5 Kısmi antrenman (§103)

Bitirme ekranı kural: `doneExercises < plannedExercises` veya herhangi bir hareketin working set'leri planlananın altındaysa ekran **"Bugün burada bitir"** başlığıyla açılır ve durum `partiallyCompleted` olarak yazılır; `completed` yalnızca tüm planlanan working set'ler loglandığında (veya kullanıcı kalan hareketleri açıkça "atla" ile işaretlediğinde) verilir (R103.1–R103.3). Ardından §6.3'teki karar: "Bitmiş say" (sıra ilerler) / "Kalanı sonraki güne taşı". Progression engine yalnızca `set_logs` olan hareketler için öneri üretir (R103.5).

---

## 8. Hareket kataloğu, ekipman, değiştirme, artış, yük davranışı (§98–§101)

### 8.1 Exercise modeli (R99.3, R101.2)

```ts
interface Exercise {
  id: string; name: string; nameTr: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  movementPattern: MovementPattern;         // 'verticalPull' | 'horizontalPush' | 'lateralRaise' | 'kneeDominant' | …
  equipment: EquipmentTag[];                 // hareket için gerekli ekipman (hepsi gerekli)
  lengthenedBias: 0 | 1 | 2 | 3;             // 0 yok … 3 belirgin uzamış pozisyon vurgusu
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  jointStressProfile: Partial<Record<Joint, 0 | 1 | 2 | 3>>; // shoulder, elbow, wrist, lowerBack, knee, hip
  loadProgressionType: LoadProgressionType;
  isUnilateral: boolean;
  volumeMultiplier: 1;                       // unilateral çift sayım koruması
  defaultIncrementKg: number;                // ekipman varsayılanından türetilir, seed'de override edilebilir
  availableLoadsKg?: number[];               // opsiyonel ayrık yük seti (dumbbell rack, machine stack)
  video?: VideoRef;                          // manifest'ten
  cues: string[];                            // teknik metin ipuçları (video fallback)
}
```

Kullanıcı özelleştirmeleri ayrı tabloda (`user_exercise_settings`: `minIncrementKg`, `availableLoadsKg`, `notes`), seed güncellemelerinde korunur.

### 8.2 Ekipman profili (§98)

`equipment_profiles` (tek satır): `available: EquipmentTag[]`, `preset: 'fullCommercialGym' | 'homeGym' | 'limitedGym' | 'custom'`. Varsayılan `fullCommercialGym` = tüm etiketler (R98.3). Onboarding'deki `gymType` preset'i ön-seçer (R120.2). `ExerciseCatalog.available()` = `equipment ⊆ profile.available`.

### 8.3 Substitution engine (§99)

`SubstitutionEngine.alternatives(exerciseId, ctx)`; deterministik puanlama (R99.2):

```
aday ∈ katalog, aday ≠ orijinal, aday.equipment ⊆ profile.available
score =
  100 · [primaryMuscle eşit]
+  60 · [movementPattern eşit]         (aksi halde aday elenir, "farklı amaç" olarak ayrı listede)
+  20 · jaccard(secondaryMuscles)
+  10 · (3 - |lengthenedBias farkı|)
+   8 · [loadProgressionType eşit]
+   5 · [skillLevel ≤ kullanıcı seviyesi]
-  25 · Σ_joint [painAreas içeriyor] · aday.jointStressProfile[joint]
+  15 · [exercise_relations'ta explicit variant/substitute ilişkisi var]
+   3 · [kullanıcı bu hareketi daha önce yaptı]
```

Sıralama: score desc, sonra `id` asc (kararlı). İlk 5 gösterilir; her satırda kısa gerekçe ("Aynı kas, aynı hareket kalıbı, ekipmanın var"). Seed'deki `exercise_relations` (örn. `lat-pulldown → assisted-pullup, plate-loaded-pulldown`) öncelik verir (R99.4, R99.6). Oturumda değiştirme `session_exercises.original_exercise_id`'yi korur; geçmiş sorguları hem `exercise_id` hem `original_exercise_id` üzerinden yapılır ve aile (relation) bazında birleştirilebilir (R99.5, R99.7).

### 8.4 Yük davranışı ve effective load (§101)

| `loadProgressionType` | `effectiveLoad(set)` | Not |
|------------------------|----------------------|-----|
| `externalLoadHigherIsHarder` | `load` | Dumbbell, barbell, cable, çoğu makine |
| `assistanceLowerIsHarder` | `-assistance` (bodyweight biliniyorsa `bodyweight - assistance`) | Assisted pull-up/dip; 40 → 35 **ilerleme** (R101.3) |
| `bodyweight` | `bodyweight` (bilinmiyorsa `0`, karşılaştırma reps üzerinden) | Push-up; progression reps ile |
| `bodyweightPlusExternalLoad` | `bodyweight + load` (bodyweight bilinmiyorsa `load`) | Weighted pull-up |
| `machineLevel` | `level` (ordinal) | Seviye numaralı makineler |
| `distanceOrBand` | `bandRank` (ordinal, seed'de tanımlı) veya `distanceCm` | Band, sled |

`SetLog` ham girdiyi türüne uygun alanda saklar (`load_kg`, `assistance_kg`, `machine_level`, `band_rank`, `bodyweight_kg_snapshot`); `effectiveLoad` görünümü (`v_set_effective_load`) türetir. Progression/PR/plateau **yalnızca** `effectiveLoad` ve `reps` ile çalışır (R101.4). "Artır" önerisi assisted türde `assistance -= increment` olarak somutlaştırılır.

### 8.5 Artış adımları ve yuvarlama (§100)

```
IncrementResolver.forExercise(id) = user_exercise_settings.minIncrementKg
                                   ?? exercise.defaultIncrementKg
                                   ?? EQUIPMENT_DEFAULT[equipment[0]]   // dumbbell 2, machine 5, cable 2.5, barbell 2.5, plateLoaded 2.5

roundToAvailable(target, current, exercise):
  if availableLoadsKg: en yakın eleman (eşitlikte yukarı)
  else: round(target / inc) * inc
  if result == current and target > current: return { load: current, fallback: 'repProgression' }   // R100.5
```

Örnek: current 80, hedef +3 % = 82.4 → machine inc 5 → 80 (fallback → tekrar hedefini +1). Cable inc 2.5 → 82.5 ✔ (AT-08).

---

## 9. Karar motorları (§104–§107, §121–§123)

Ayrıntı ve sözde kod: `04-domain-engines.md`. Burada sorumluluklar ve sözleşmeler.

### 9.1 Progression engine (double progression)

Girdi: hareket için son N exposure'ın working set'leri (`effectiveLoad`, `reps`, `rir`), şablon hedefi (`repRange [min,max]`, `targetRir`), increment.
Kural özeti: tüm working set'ler `max` tekrara ulaştı **ve** `rir ≥ targetRir` → yükü artır (yuvarlanmış). Bazı setler `min`'in altında **veya** `rir < targetRir - 1` → yükü koru / düşürmeyi düşün. Aksi halde tekrar artır. Çıktı: `Recommendation` (R122). 12/12/12 @ hedef RIR → "+increment" (AT-07).

### 9.2 Plateau engine (§104)

`exposures[-3..]` üzerinde: `max effectiveLoad` artmadı **ve** `max reps @ eşit load` artmadı **ve** `rir` hedef bandında **ve** teknik/ağrı bayrağı yok → `PlateauInsight` (R104.2). Insight sıralı kontrol listesi (recovery, sleep, adherence, RIR accuracy, technique, rest, suitability) ile gelir; her madde ilgili veriyle (son 7 gün uyku ort., protein adherence %) doldurulur. Öneriler: same-load strategy, rep target adjustment, substitution (§8.3 ile), deload. **Hiçbiri otomatik uygulanmaz** (R104.3, R104.7).

### 9.3 Volume guardrails (§105)

`muscle_volume_targets`: `baselineWeeklyDirectSets` (programdan), `maxRecommendedWeeklySets` (Bölüm I'deki program tablosundan; yoksa baseline+6), `currentWeeklySets` (türetilir). Öneri koşulu: `recoveryOk(last7d)` **ve** `performanceTrend ∈ {stable, up}` **ve** `current + delta ≤ max` **ve** haftada tek öneri, `delta ∈ {1,2}` (R105.3, R105.4). Gerekçe zorunlu (R105.5).

### 9.4 Volume analytics (§106)

`VolumeAnalytics.weekly(weekKey)` → `{ muscle, directSets, secondarySetsEstimate }`. `directSets` = `COUNT(DISTINCT set_index)` of working sets where `exercise.primaryMuscle = muscle`. `secondarySetsEstimate` = `0.5 × secondary working set sayısı`, UI'da "tahmini, ayrı" olarak (R106.3, R106.4).

**Görüntü grupları:** R106.1'deki "Lats/Back" gibi birleşik satırlar için `MuscleDisplayGroup` haritası UI katmanındadır (`lats + upperBack → 'Sırt'`); analitik her zaman kas bazlı üretir, gruplama sunumda yapılır. `volumeHold` önerisi yalnızca `currentWeeklySets > maxRecommendedWeeklySets` olduğunda üretilir ("bu hafta set eklemeyi bırak" gerekçesiyle); azaltma otomatik önerilmez.

### 9.5 PR detector (§107)

Set commit transaction'ında çalışır. Adaylar: `set_type='working'`, `exclude_from_pr=0`, `discarded=0`. Türler: `loadPr` (effectiveLoad > önceki max), `repPrAtLoad` (aynı effectiveLoad'da reps > önceki), `estimatedPerformancePr` (e1RM tahmini; etiket: "tahmin"), `sessionVolumePr` (oturum sonunda). `personal_records` tablosuna yazılır; UI kutlaması set sonrası (R107.1–R107.4).

### 9.6 Recommendation & kullanıcı kararı (§121, §122)

```ts
interface Recommendation {
  id; kind: 'loadIncrease'|'holdLoad'|'repIncrease'|'deload'|'volumeIncrease'|'nutritionHold'|'substitution'|…;
  targetRef: { exerciseId?; muscle?; sessionExerciseId? };
  proposedValue: { effectiveLoad?; reps?; sets?; kcal? };
  rationaleTr: string;                          // "Son antrenmanda 3/3 sette 12 tekrar yaptın ve RIR hedefinin içinde kaldın."
  evidence: { setLogIds?: string[]; measurementIds?: string[]; metrics: Record<string, number> };
  createdAtUtc; expiresAtUtc?;
  decision?: { action: 'accepted'|'modified'|'ignored'; userValue?; decidedAtUtc };
}
```

UI: öneri kartı + `Kabul` / `Değiştir` / `Yok say`; değiştirme stepper ile. Karar `recommendations.decision_*` alanlarına yazılır; sonraki öneriler kullanıcının önceki tercihini girdi olarak alır (örn. sürekli "yok say" → daha muhafazakâr) (R121.3).

### 9.7 No fake precision (§123)

`TrendCalculator`: kilo için 7 günlük hareketli ortalama (pencerede en az 3 gün; aynı güne birden çok tartı varsa o günün ortalaması) + 28 günlük eğim; ölçümler için son 3 ölçümün medyanı. Trend etiketi eşikleri: kilo için |haftalık değişim| < 0.2 kg → `stable`; ölçüm için |değişim| < 0.5 cm → `stable`. **Omuz/bel oranı** = `shoulder ÷ waist` (2 ondalık), her iki sitenin birbirine en yakın (± 3 gün) ölçüm çifti kullanılır; eşleşme yoksa oran gösterilmez. UI kopya kuralları: mutlak "kas kazandın" ifadesi yok; "7 günlük ortalama −0.4 kg/hafta" gibi. Tüm tahmini metrikler `isEstimate: true` ile gelir ve bileşen otomatik olarak "tahmin" rozeti basar (R123.4). Kalori önerisi ±100 kcal bandı ile verilir.

---

## 10. Beslenme (§109–§111)

- **FoodItem**: `source` (`seed:usda`, `seed:tr-label`, `user`, `label-override`), `servingUnit`, `servingSizeG`, `per100g {kcal, protein, carb, fat, fiber}`, `lastUpdated`, `customEdited`, `brand`. Seed güncellemesi `customEdited=1` satırları atlar (R111).
- **Recipe**: `ingredients[{foodId, grams}]`, `cookedYieldG?`; `per100gCooked = Σ(ingredient nutrition) / (cookedYieldG ?? rawTotalG) × 100`; porsiyon girildiğinde `portionG × per100gCooked / 100` (R110). `cookedYieldG` yoksa UI "pişmiş ağırlık girilmedi, ham toplam kullanılıyor" notu (R110.5).
- **MealLog**: `localDateKey`, `mealSlot` (`breakfast|lunch|dinner|snack|preWorkout|postWorkout`), `entries[{foodId|recipeId, grams|servings}]`.
- **CopyService**: `copyDay(fromKey, toKey)`, `copyMeal(mealLogId, toKey, slot)`, `repeatSlot(slot)` (son 7 günün aynı slot'u), `saved_meals`, `food_favorites`, `recent foods` (`meal_entries` üzerinden son 30 gün, sıklık sıralı) (R109).

---

## 11. Ölçümler ve onboarding (§96, §97, §119, §120)

### 11.1 Ölçüm kaydı ve kalite (§97)

```
body_measurements(id, localDateKey, site, finalValueCm, aggregation 'single'|'mean'|'median', note)
measurement_samples(id, measurementId, sampleIndex, valueCm)
```

`MeasurementQuality.evaluate(samples, site)`: 2 örnek arasındaki fark `> max(0.8 cm, iki örneğin ortalamasının %1.5'i)` ise "üçüncü ölçüm önerilir" durumu; final = median (3 örnek) veya mean (2 örnek); tek örnek serbest ve kullanıcı öneriye rağmen iki örnekle kaydedebilir (R97.3, R97.4). Her site için `MeasurementGuide` (kısa metin + çizim asset'i): bel, karın (göbek deliği hizası), omuz (en geniş çevre), biceps (flexed, aynı pozisyon), vb. (R97.1, R97.2).

### 11.2 Biceps baseline (§96)

`site ∈ {'bicepsLeftFlexed','bicepsRightFlexed','bicepsFlexed'}`. `BaselineResolver.biceps()` sırası: (1) `is_baseline=1` işaretli kayıt (onboarding veya "başlangıç ölçümü" akışı bunu yazar; site başına tek satır), (2) yoksa `start_date_key` ± 7 gün penceresindeki **ilk** kayıt, (3) yoksa `null`. Pencere dışında ilk kez ölçen kullanıcı için CTA "Başlangıç ölçümü olarak kaydet" seçeneği sunar; bu kayıt `is_baseline=1` alır ve KPI'da "Başlangıç: Gün N" etiketiyle gösterilir (geç baseline, R123). Dashboard `null` → **"Başlangıç kol ölçümünü ekle."** CTA; KPI kartı `disabled` (R96.3–R96.5, AT-12). Sol/sağ ayrı girildiğinde `bicepsFlexed` gösterimi ortalama, KPI ayrı ayrı da izlenebilir.

### 11.3 İlk çalıştırma verisi (§119)

`data/initial-profile.json` (Bölüm I'deki değerler) `seedInitialProfile()` ile yalnızca **ilk** çalıştırmada ve yalnızca kullanıcı onboarding'de "önceden girilmiş değerleri kullan" seçerse yazılır. Biceps alanı yoktur (null). Zod: `cm: z.number().positive().lt(300).nullable()` (DB `CHECK (< 300)` ile aynı yönde); `0` reddedilir (R119.3, R119.4).

### 11.4 Onboarding training profile (§120)

`training_profiles`: `experience`, `gymType`, `typicalWorkoutMinutes`, `preferredWorkoutDays: number[]` (0–6), `sleepTargetHours`, `painAreas: Joint[]`. Kullanım: `gymType → EquipmentProfile preset`, `preferredWorkoutDays → Scheduler`, `painAreas → SubstitutionEngine cezası`, `sleepTargetHours → recovery değerlendirmesi`, `typicalWorkoutMinutes → şablon süre uyarısı`. Program şablonu değişmez (R120.2).

---

## 12. Kalıcılık: migration, şifreleme, yedekleme (§92, §93, §95)

### 12.1 Migration mimarisi (§92)

```
core/db/migrations/
  index.ts        → MIGRATIONS: Migration[] (sıralı, değişmez geçmiş)
  001_initial.ts
  002_add_workout_state.ts
  003_add_lab_results.ts
  …
interface Migration { version: number; name: string; up(tx): Promise<void> }   // checksum dosya içeriğinden hesaplanır, schema_migrations'a yazılır
```

`MigrationRunner.run()`:
1. `PRAGMA user_version` ve `schema_migrations` oku; uyuşmazlıkta (manuel müdahale, checksum farkı) `DbIntegrityError` → `DbOpenError` ekranı (§15).
2. Bekleyen migration varsa **önce** `v90.bak.v<from>.sqlite` dosya kopyası al (`expo-file-system copyAsync`); disk yetersizse migration **başlamaz** ve "Alan yetersiz" ekranı gösterilir (R92.5).
3. Her migration `BEGIN IMMEDIATE … COMMIT` içinde; `up()` idempotent SQL (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN` öncesi `PRAGMA table_info` kontrolü) (R92.3).
   Not: Migration başarısız olduğunda "Yedeği dışa aktar", `TableRegistry` gerektirmeyen **ham dosya paylaşımı**dır (şifreli `.sqlite` kopyası + `manifest.json`); normal ZIP export'u yalnızca şema güncelken çalışır.
4. Başarı: `schema_migrations INSERT`, `PRAGMA user_version = v`. Hata: `ROLLBACK`; DB kapatılır, yedek dosyası geri kopyalanır, `MigrationFailedScreen` (Türkçe: "Veritabanı güncellenemedi. Verilerin güvende; uygulamayı güncelleyip tekrar dene." + "Yedeği dışa aktar") (R92.6).
5. Başarılı çalıştırmadan 7 gün sonra `.bak` temizlenir.

Testler (R92.7): `test/fixtures/db/v001.sql … v00N.sql` her sürüm için; `migrate(fixture) → latest` sonra `assertRowsPreserved()`; iki kez çalıştırma; rastgele migration'da hata enjekte edip veri bütünlüğü (AT-16).

### 12.2 Şifreleme (§93)

```
DatabaseProvider { open(): Promise<Db>; close(); path; isEncrypted: boolean }
EncryptedSqliteProvider: expo-sqlite (SQLCipher) + PRAGMA key = <hex from DbKeyManager>
PlainSqliteProvider   : yalnızca __DEV__
DbKeyManager: SecureStore.getItemAsync('v90.dbkey') ?? generate(32 bytes, expo-crypto) → setItemAsync(…, { keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY })
```

- Anahtar yalnızca bellekte ve SecureStore'da; log'a yazılmaz, backup'a dahil edilmez (R93.5, R93.6).
- Yedek dosyaları (`.bak`) da şifreli DB kopyasıdır (aynı anahtar).
- Export edilen backup ZIP'i **şifresizdir**, kullanıcı uyarılır ve isteğe bağlı parola ile ZIP AES şifrelemesi (arşivleyici destekliyorsa) sunulur.
- Anahtar kaybı (cihaz sıfırlama, Keychain silinmesi) = veri kaybı; kullanıcıya düzenli yedek hatırlatması (ayda bir, kapatılabilir).
- Cihaz yedeği (iCloud/Google) DB dosyasını şifreli, anahtarı Keychain politikasına göre taşır; `THIS_DEVICE_ONLY` seçildiği için yeni cihazda açılmaz — bu bilinçli bir karar (ADR-002).

### 12.3 Yedekleme ve geri yükleme (§95)

**Format:** `v90-backup-<yyyyMMdd-HHmm>.zip`
```
manifest.json  { formatVersion: 1, schemaVersion: <int>, appVersion, createdAtUtc, timeZone,
                 tables: { <table>: rowCount }, photos: { count, totalBytes }, dataSha256, photoShas: {...} }
data.json      { schemaVersion, tables: { profiles: [...], programs: [...], …, settings: [...] } }  // TÜM tablolar (R95.1)
photos/<photoId>.<ext>
```

**Export:** tek okuma transaction'ı (`BEGIN`; tüm tablolar; `COMMIT`) → JSON → ZIP'e yaz → fotoğrafları kopyala → manifest. Paylaşım `expo-sharing` ile (dosya kullanıcı seçimine kaydedilir). `schema_migrations` ve `command_log` **kapsam dışıdır**: ilki hedef DB'nin migration çalıştırmasıyla yeniden kurulur, ikincisi yalnızca yerel idempotency penceresidir (import sonrası sıfırlanması zararsızdır). Otoriter sürüm bilgisi `manifest.json.schemaVersion`'dır; `data.json` içindekiyle uyuşmazsa import reddedilir. Ayarlar: `backup.lastExportAtUtc`, `backup.reminderEnabled`.

**Import (`BackupImporter.import(zipUri)`):**
1. ZIP'i temp dizine aç; `manifest.json` Zod; `dataSha256` doğrula.
2. `schemaVersion > current` → reddet ("Bu yedek daha yeni bir sürümle alınmış"). `<` → `backupMigrators[v]` zinciriyle JSON'u güncel şemaya yükselt (DB migration'larıyla paralel tutulan saf fonksiyonlar) (R95.8).
3. `data.json` tüm tablolar için Zod şemalarıyla doğrula (R95.6).
4. **Staging DB:** yeni bir şifreli DB dosyası (`v90.import.sqlite`) oluştur, migration'ları çalıştır, tüm satırları tek transaction'da yaz, `PRAGMA integrity_check` ve `foreign_key_check`.
5. Fotoğrafları `photos.import/` altına kopyala, sha doğrula.
6. **Atomik değişim:** mevcut DB kapat → `v90.sqlite → v90.pre-import.sqlite` yeniden adlandır → `v90.import.sqlite → v90.sqlite` → `photos/ → photos.pre-import/`, `photos.import/ → photos/`. Herhangi bir adımda hata: ters işlemler, mevcut veri dokunulmamış kalır (R95.7, AT-15).
7. Başarıda `pre-import` kopyaları 7 gün saklanır ("Geri al"). Geri alma penceresi DB dışında, `photos.pre-import/../restore-point.json` sidecar dosyasında tutulur (`{ importedAtUtc, fromSchemaVersion }`) — DB'nin kendisi değiştiği için içeride tutulamaz.
8. **Guard:** aktif antrenman oturumu (`workout_sessions.status='active'`) varken import başlatılmaz; kullanıcıdan önce oturumu bitirmesi/iptal etmesi istenir.

İçe aktarma modu: **"Değiştir"** (varsayılan; mevcut veri yedekle değiştirilir) ve **"Birleştir"** (v1'de yok; UI'da gösterilmez).

---

## 13. Güvenlik ve gizlilik (§94, §116, §118)

### 13.1 App lock (§94)

`AppLockService`: `enabled` (settings), `graceSeconds` (0/30/300), `lastUnlockedAtUtc` (bellek). Akış: `AppState → active` ve `now - lastUnlocked > grace` → `LockScreen` (tam ekran, altta hiçbir içerik render edilmez) → `LocalAuthentication.authenticateAsync({ disableDeviceFallback: false, promptMessage: 'V90 kilidini aç' })` → başarı: `lastUnlocked = now`. Biyometri kayıtlı değilse cihaz parolası (platform fallback) (R94.3). Etkinleştirme sırasında `hasHardwareAsync && isEnrolledAsync` kontrolü; yoksa seçenek gri ve açıklama.

`PrivacyShield`: `AppState → inactive|background` olduğunda tüm ekranların üstüne opak logo perdesi (`PrivacyOverlay`) render edilir; iOS app switcher snapshot'ı perdeyi yakalar (R94.5). `PhotosScreen` ve `LabsScreen`, Android'de yalnızca `settings['privacy.androidFlagSecure'] === true` iken `preventScreenCaptureAsync()` çağırır (varsayılan açık, kullanıcı kapatabilir); iOS'ta bu özellik **sunulmaz**, ayar satırı gri ve metni bunu açıklar (R94.6, R116.5).

### 13.2 Progress fotoğrafları (§116)

- Kayıt: `ImagePicker` → dosya `documentDirectory/photos/<uuid>.jpg` (app-private, MediaLibrary'ye yazılmaz; `saveToPhotos: false`) (R116.1, R116.2).
- `progress_photos(id, localDateKey, pose, fileName, bytes, sha256, width, height)`.
- Silme: `PhotoStore.delete(id)` → önce `progress_photos.pending_delete=1` (tx), dosyayı sil, sonra satırı sil. `OrphanSweeper` uygulama açılışında: dosyası olmayan satır → satırı sil; satırı olmayan dosya → dosyayı sil; `pending_delete=1` → tamamla (R116.4).
- Cloud sync yok; `settings.cloudSync` alanı `false` ve UI'da "yakında" bile gösterilmez (R116.3).

### 13.3 Analytics (§118)

v1'de analytics/crash SDK **yok**. Eklenirse: `analytics/events.ts` içinde kapalı bir `EventName` union'ı ve her event için Zod payload şeması; payload'da yalnızca sayısal/kategorik ürün metrikleri (örn. `workout_completed { durationBucket, exerciseCount }`); hiçbir serbest metin, ölçüm, besin, lab, fotoğraf, not alanı kabul edilmez (lint kuralı + test). Varsayılan `analyticsEnabled=false`; crash reporter `beforeSend` ile breadcrumb'lardan DB içeriği temizlenir (R118.1–R118.3).

---

## 14. Medya: video manifest ve doğrulama (§114, §115)

`data/exercise-videos.json`:
```json
{ "lat-pulldown": { "videoProvider": "youtube", "videoId": "…", "channelName": "…", "sourceUrl": "https://www.youtube.com/watch?v=…", "lastVerifiedAt": "2026-09-01", "fallbackUrl": null } }
```

`ExerciseVideo` bileşeni: `react-native-youtube-iframe` (resmi IFrame API) → `onError`/`onReady` zaman aşımı (8 s) → `VideoFallback`. Fallback içeriği: (1) `cues[]` teknik metin ipuçları — **her zaman çevrimdışı çalışır**, (2) thumbnail: uygulama ilk başarılı yüklemede `i.ytimg.com/vi/<id>/hqdefault.jpg` dosyasını `documentDirectory/thumbs/` altına önbelleğe alır; önbellek yoksa ve ağ yoksa yerel bir hareket-kalıbı ikonu gösterilir (uzaktan görsel beklenmez), (3) "Kaynağa git" linki. Çevrimdışıysa doğrudan fallback (R114.3, R114.4). Video indirilmez ve yeniden host edilmez (R114.5).

`scripts/verify-exercise-videos.ts` (`npm run verify:exercise-videos`): her `videoId` için `https://www.youtube.com/oembed?url=<sourceUrl>&format=json` isteği; 200 → OK ve `channelName` karşılaştırması; 401/403/404 → BROKEN. Rapor: tablo + `--json`; `--strict` ile non-zero exit (CI'da haftalık cron, PR'da uyarı) (R115).

---

## 15. Hata yönetimi (§117)

| Hata sınıfı | Yakalama | Kullanıcıya | Aksiyon |
|-------------|----------|-------------|---------|
| `DbOpenError` (anahtar/şifre/bozuk dosya) | `AppBootstrap` | "Veritabanı açılamadı." | Yeniden dene · Yedekten geri yükle · Destek bilgisi |
| `MigrationFailedError` | `MigrationRunner` | "Veritabanı güncellenemedi; verilerin güvende." | Yeniden dene · Yedeği dışa aktar |
| `DbWriteError` (disk dolu, SQLITE_BUSY) | Repository → servis | "Kaydedilemedi. Boş alanı kontrol et." | Yeniden dene (aynı komut idempotent `commandId` ile) |
| `ImportError` | `BackupImporter` | "İçe aktarma başarısız; mevcut verin değişmedi." | Ayrıntılar · Tekrar dene |
| `VideoUnavailable` | `ExerciseVideo` | Fallback görünümü | — |
| `NotificationPermissionDenied` | `RestTimerService` | Sessiz; ayarlarda bilgi | — |
| Beklenmeyen render hatası | Kök `ErrorBoundary` + ekran düzeyi boundary'ler | "Bir şeyler ters gitti." | Yeniden yükle · Ana ekrana dön |

Kök `ErrorBoundary` her zaman render edilebilir minimal bir ekran gösterir (hiçbir DB/ağ bağımlılığı yok) → beyaz ekran imkânsız (R117.1). Her komutun `commandId` (uuid) ile idempotent tekrarı desteklenir; retry aynı seti iki kez yazmaz (`command_log.result_json` orijinal sonucu döndürür; 30 günden eski satırlar temizlenir).

**Domain hata sınıfları** (kullanıcıya Türkçe, aksiyon odaklı metinle eşlenir; ayrıntı ve fırlatan servisler `04-domain-engines.md`): `InvalidTransitionError`, `ProgramNotActiveError`, `ProgramNotPausedError`, `ActiveSessionExistsError`, `SessionNotActiveError`, `PendingPartialDecisionError`, `MissedWorkoutPendingError`, `InvalidRescheduleDateError`, `SequencePlanMismatchError`, `SetAlreadyLoggedError`, `InvalidStateError`, `ValidationError`. Servis metot imzaları için `04-domain-engines.md` kanoniktir; bu belge sorumlulukları tanımlar.

---

## 16. Test stratejisi (§124)

| Seviye | Araç | Kapsam |
|--------|------|--------|
| Unit (domain) | Jest, `FakeClock`, in-memory repo | Progression, plateau, guardrails, PR, increments, effectiveLoad, calendar/sequence, adherence, trend, recipe math, measurement quality |
| Integration (DB) | Jest + Node SQLite (SQLCipher) aynı SQL/migration dosyaları | Migration zinciri, autosave transaction'ları, tek aktif oturum kısıtı, backup export/import round-trip, orphan sweeper |
| Component | RNTL | Missed workout kartı, resume kartı, NumericStepper, recommendation kartı, CTA "Başlangıç kol ölçümünü ekle." |
| E2E | Maestro (dev build, iOS + Android) | AT-01, AT-02, AT-03, AT-13, AT-17, AT-18, AT-19 ve akışlar |
| Manuel | Checklist (`05-acceptance-tests.md`) | Gerçek cihazda ekran kilidi, restart, timezone değişimi, biyometri |

AT-01..AT-20 → test eşlemesi `05-acceptance-tests.md` içindedir. "Complete" raporu bu 20 senaryonun tamamı geçmeden verilmez (R124.1).

---

## 17. İzlenebilirlik matrisi

| § | Gereksinimler | Mimari bileşen(ler) | Belge | Kabul testi |
|---|---------------|---------------------|-------|-------------|
| 87 | R87.1–R87.3 | Bu matris + `01`/`03`/`04`/`05` belgeleri; her madde için bileşen ve doğrulama | §1, §17 | — (meta) |
| 88 | R88.1–R88.8 | `ChallengeCalendar`, `TrainingSequence`, `Scheduler`, `MissedWorkoutResolver`, `scheduled_workouts` FSM | §6 | AT-04, AT-05 |
| 89 | R89.1–R89.8 | `PauseService`, `program_pauses`, `calendarMode` | §6.5 | AT-04, AT-05 |
| 90 | R90.1–R90.7 | `ActiveSessionService`, komut/transaction modeli, resume kartı | §7.1 | AT-01, AT-02 |
| 91 | R91.1–R91.8 | `RestTimerService`, `rest_timers`, `LocalNotificationScheduler` | §7.2 | AT-03 |
| 92 | R92.1–R92.7 | `MigrationRunner`, `schema_migrations`, `.bak` | §12.1 | AT-16 |
| 93 | R93.1–R93.7 | `EncryptedSqliteProvider`, `DbKeyManager`, build profilleri | §2.1, §12.2 | AT-19 (dolaylı), unit |
| 94 | R94.1–R94.6 | `AppLockService`, `PrivacyShield` | §13.1 | AT-19 |
| 95 | R95.1–R95.8 | `BackupExporter/Importer`, staging DB, backup migrators | §12.3 | AT-14, AT-15 |
| 96 | R96.1–R96.5 | `BaselineResolver`, dashboard CTA | §11.2 | AT-12, AT-20 |
| 97 | R97.1–R97.5 | `MeasurementQuality`, `measurement_samples`, `MeasurementGuide` | §11.1 | AT-11 |
| 98 | R98.1–R98.4 | `EquipmentProfile` | §8.2 | unit |
| 99 | R99.1–R99.7 | `SubstitutionEngine`, `exercise_relations`, `original_exercise_id` | §8.3 | unit |
| 100 | R100.1–R100.5 | `IncrementResolver`, `roundToAvailable` | §8.5 | AT-08 |
| 101 | R101.1–R101.4 | `LoadBehavior.effectiveLoad` | §8.4 | AT-09 |
| 102 | R102.1–R102.4 | `tracking_mode`, `side`, volume sayımı | §7.4 | unit |
| 103 | R103.1–R103.5 | Bitirme ekranı kuralı, `partiallyCompleted`, `AdherenceCalculator` | §6.3, §6.6, §7.5 | AT-06 |
| 104 | R104.1–R104.7 | `PlateauEngine`, `PlateauInsight` | §9.2 | unit |
| 105 | R105.1–R105.5 | `VolumeGuardrails`, `muscle_volume_targets` | §9.3 | unit |
| 106 | R106.1–R106.4 | `VolumeAnalytics` | §9.4 | unit |
| 107 | R107.1–R107.4 | `PrDetector`, `personal_records`, `exclude_from_pr` | §9.5 | unit |
| 108 | R108.1–R108.5 | `NumericStepper`, prefill sırası | §7.3 | E2E süre ölçümü |
| 109 | R109.1–R109.2 | `CopyService`, `saved_meals`, favorites/recents | §10 | unit |
| 110 | R110.1–R110.5 | `RecipeBuilder` | §10 | unit |
| 111 | R111.1–R111.3 | `food_items.source/customEdited` | §10 | unit |
| 112 | R112.1–R112.5 | `Timestamped`, `Clock`, `DayRolloverObserver` | §5 | AT-13 |
| 113 | R113.1–R113.4 | `calendarDateKey` varsayılanı ve override | §5.3 | AT-13 |
| 114 | R114.1–R114.5 | `exercise-videos.json`, `ExerciseVideo`, `VideoFallback` | §14 | AT-17 |
| 115 | R115.1–R115.3 | `verify-exercise-videos.ts` | §14 | script testi |
| 116 | R116.1–R116.5 | `PhotoStore`, `OrphanSweeper` | §13.2 | integration |
| 117 | R117.1–R117.5 | Hata taksonomisi, `ErrorBoundary`, `commandId` | §15 | AT-15, AT-17 |
| 118 | R118.1–R118.3 | Analytics allowlist (v1: yok) | §13.3 | lint/test |
| 119 | R119.1–R119.4 | `seedInitialProfile`, nullable Zod | §11.3 | AT-12 |
| 120 | R120.1–R120.2 | `training_profiles` ve tüketicileri | §11.4 | unit |
| 121 | R121.1–R121.3 | `Recommendation.decision` | §9.6 | AT-07 |
| 122 | R122.1–R122.3 | `rationaleTr`, `evidence` | §9.6 | AT-07 |
| 123 | R123.1–R123.4 | `TrendCalculator`, `isEstimate` | §9.7 | AT-10 |
| 124 | R124.1–R124.3 | Test stratejisi; her senaryo için test seviyesi, adımlar ve otomatik test kimlikleri (R124.2); sürüm notu raporlaması (R124.3) | §16, `05-acceptance-tests.md` | AT-01..20 |

**Not:** Servis metot imzaları, eşik sabitleri ve algoritma ayrıntıları için `04-domain-engines.md` kanoniktir; bu belge sorumluluk sınırlarını ve kararları tanımlar. İkisi çeliştiğinde önce bu belge güncellenir, sonra `04` hizalanır.
