# V90 – Uygulama artefaktları

Bu dizin, [`../docs/v90/`](../docs/v90/) altındaki specification'dan **üretilen** ve
**doğrulanan** artefaktları, çekirdek domain kodunu ve Expo uygulamasını içerir.

> Bu dizin, deponun kök dizinindeki kredi kartı takip uygulamasından bağımsızdır.

## Ne var burada

| Yol | Ne | Kaynak |
|-----|-----|--------|
| `src/core/db/migrations/001_initial.sql` | Tam şema (45 tablo, 2 görünüm, 21 indeks) | `docs/v90/03-data-model.md` §1 |
| `src/ui/i18n/tr.generated.ts` | 530 Türkçe UI metni | `docs/v90/06-ux-flows.md` metin tabloları |
| `data/equipment-presets.json` | 3 ekipman preset'i | `docs/v90/02-architecture.md` §11.4 |
| `data/exercises.json` | 32 hareketlik katalog + 14 alternatif ilişkisi | Bölüm I §35, §36 |
| `data/programs/v90.json` | 5 antrenman şablonu, 30 şablon hareketi | Bölüm I §21–§26 |
| `data/muscle-volume-targets.json` | 16 kas için baseline ve tavan | Bölüm I §28 |
| `data/initial-profile.json` | Başlangıç antropometrisi | Bölüm I §11 |

## Üretilmiş dosyalar elle düzenlenmez

Yukarıdaki dosyaların tamamı **specification'dan üretilir**. Bir değer değişecekse
önce belge güncellenir, sonra üretim çalıştırılır:

```bash
cd v90
npm run gen        # migration + seed + i18n'i belgeden yeniden üret
npm run verify     # kayma + seed + tip + test + bundle denetimi
```

Bu, belge ile veri arasında sessiz kopukluk oluşmasını yapısal olarak engeller:
belge tek doğruluk kaynağıdır, dosyalar onun türevidir.

## Doğrulama neyi garanti eder

`npm run verify` beş aşamalıdır: **kayma → seed → tip (×2) → test → bundle**.

**1. Kayma denetimi** (`verify:drift`) — üreticileri yeniden çalıştırıp çıktıyı commit
edilmiş dosyalarla karşılaştırır. Belge değişip üretim çalıştırılmadıysa CI kırılır.

**2. Seed doğrulaması** (`verify:seed`) — 12 kontrol, sıfır bağımlılık:

| # | Kontrol |
|---|---------|
| A1 | Her hareket alanı Bölüm II enum'larına uyuyor (kas, kalıp, ekipman, eklem, yük türü) |
| A2 | Alan sınırları: artış adımı > 0, `volumeMultiplier` = 1, en az 3 teknik ipucu |
| B1 | Alternatif ilişkileri çözümleniyor; kendine referans ve tekrar yok |
| B2 | Bölüm II §99.4'teki üç alternatif örneği birebir karşılanıyor |
| C1 | 5 şablon, `sequenceOrder` 0–4, `templates[4]` = `v90-d5-vtaper-upper` |
| C2 | Şablon set/tekrar/RIR/dinlenme değerleri şema CHECK'leriyle uyumlu |
| D1 | Şablonlardan hesaplanan haftalık hacim, Bölüm I §27 tablosuyla **birebir aynı** |
| D2 | Bölüm II §106.1 örneğiyle birebir (yan omuz 12 · biceps 13 · triceps 13 · sırt 15 · göğüs 10 · quad 7 · hamstring 8) |
| D3 | Hacim hedefleri programla tutarlı; öncelikli kaslar R3.4 ile aynı |
| E1 | Başlangıç profili R11 değerleriyle aynı; sıfır yok, biceps bilinmiyor |
| F1 | Seed gerçek SQLite şemasına yükleniyor; `foreign_key_check` ve `integrity_check` temiz |
| F2 | Şema hatalı veriyi reddediyor (0 cm ölçüm, max < baseline, geçersiz FK) |

D1/D2/D3 kritik olanlardır: programın set dağılımı ile specification'daki hacim
tabloları arasındaki her sapmayı yakalarlar. Bir şablonda tek bir set değişse
dört kontrol birden kırılır.

**3. Tip denetimi** — iki ayrı tsconfig: çekirdek (Node, `src/core`+`src/domain`+
`src/features`+`test`) ve uygulama (React Native, `app`+`src/ui`+`src/platform`).
Ayrı olmalarının sebebi ikisinin FARKLI platform tiplerine sahip olması.

**4. Testler** — 297 test, gerçek SQLite (ve web için sql.js) üzerinde.

**5. Bundle denetimi** (`verify:bundle`) — iki platform (ios + web) gerçekten
derleniyor mu, şifresiz yol ya da öteki platformun motoru bundle'a sızmış mı?
Ayrıntı için aşağı bkz.

## Gereksinimler

Node ≥ 22.5 (`node:sqlite` ve yerel TypeScript type-stripping için) ve Python 3.11+.
Üreticiler ve kayma denetimi bağımlılıksız çalışır; testler ve tip denetimi için
`npm install` gerekir.

| Paket | Nerede | Niçin |
|-------|--------|-------|
| `expo`, `react`, `react-native`, `expo-router` | runtime | Uygulama |
| `expo-sqlite` (SQLCipher), `expo-secure-store`, `expo-crypto` | runtime | Şifreli DB ve anahtar (§93) |
| `expo-local-authentication`, `expo-notifications`, `expo-file-system` | runtime | Kilit, dinlenme bildirimi, yedek dosyaları |
| `zod` | runtime | Yedek manifest/veri şeması doğrulaması (02 §12.3) |
| `fflate` | runtime | ZIP sıkıştırma; Node ve RN'de aynı kod (02 §12.3) |
| `typescript`, `@types/node`, `@types/react` | dev | `tsc --noEmit` (iki tsconfig) |
| `@journeyapps/sqlcipher` | dev | Şifreli yolu **CI'da gerçekten** koşturmak (aşağı bkz.) |

`@journeyapps/sqlcipher` yalnızca testlerde kullanılır; `npm run verify:bundle`
onun uygulamaya girmediğini her çalıştırmada doğrular.

## Kod

| Yol | Ne | Belge |
|-----|-----|-------|
| `src/core/clock/` | `Clock`/`FakeClock`, `localDateKey`, `stamp` | 04 §12 |
| `src/core/db/` | `Tx`/`Db`/`DatabaseProvider` portları, node:sqlite adaptörü, hata taksonomisi | 02 §3, §15 |
| `src/core/db/MigrationRunner.ts` | Bütünlük + checksum, yedek, transaction, geri yükleme, temizlik | 02 §12.1 |
| `src/domain/exercise/` | `LoadBehavior`, `IncrementResolver`, `SubstitutionEngine` | 04 §3, §8 |
| `src/domain/progression/` | `ProgressionEngine`, `PlateauEngine`, `VolumeGuardrails` | 04 §4, §5, §6 |
| `src/domain/workout/PrDetector.ts` | 4 PR türü, Epley e1RM, oturum hacmi | 04 §7 |
| `src/domain/analytics/` | `TrendCalculator`, `AdherenceCalculator`, `VolumeAnalytics` | 04 §9, §6 |
| `src/domain/nutrition/RecipeBuilder.ts` | Tarif ve porsiyon hesabı | 04 §10 |
| `src/domain/measurements/` | `MeasurementQuality`, `BaselineResolver` | 04 §11 |
| `src/domain/program/` | `ChallengeCalendar`, `TrainingSequence`, `Scheduler`, `PauseService` | 04 §1 |
| `src/domain/workout/ActiveSessionService.ts` | Komut modeli, autosave, bitirme/iptal, hydrate | 04 §2 |
| `src/domain/workout/RestTimerService.ts` | Zaman damgasından türetilen sayaç, bildirimler | 04 §2.2.4 |
| `src/core/db/repositories.ts` | Tipli SQL erişimi; transaction sınırını servis belirler | 02 §3 |
| `src/core/db/commandLog.ts` | `command_id` ile idempotent komut tekrarı | 04 §2.2.2 |
| `src/core/backup/` | ZIP arşivleyici, `TableRegistry`, `BackupExporter`, `BackupImporter` | 02 §12.3, ADR-005 |
| `src/core/db/SqliteDriver.ts` | Sürücü portu: expo-sqlite / sqlcipher-node / node:sqlite | 02 §2.1 |
| `src/core/db/SqliteDatabaseProvider.ts` | Tek sağlayıcı; `PRAGMA key` dahil açılış akışı | 02 §12.2 |
| `src/core/db/EncryptedSqliteProvider.ts` | Production yolu: SQLCipher + Keychain/Keystore | ADR-002, §93 |
| `src/core/db/keys/` | `SecureStore` portu, `DbKeyManager` (256-bit, hex) | 02 §12.2 |
| `src/core/db/buildGuard.ts` | Production'da şifresiz DB ve Expo Go yasağı | §93.4, §93.7 |
| `src/core/db/seed.ts` | Idempotent katalog/şablon kurulumu | 03 §1 |
| `src/bootstrap/container.ts` | Build koruması → DB → migration → seed → servisler | 02 §2, §12 |
| `src/platform/` | Platform adaptörleri: saat, dosya, bildirim, hash, id, blob, DB sağlayıcısı; `x.web.ts` tarayıcı karşılıkları (IndexedDB, WebCrypto) | 02 §2, ADR-013 |
| `src/features/` | Saf görünüm modelleri (kart önceliği, yük alanı, tam/kısmi) | 06 A.1, A.3, A.4 |
| `src/ui/` | Tasarım belirteçleri, bileşenler, i18n, AppProvider, kilit | 06 A.0, B.0 |
| `app/` | expo-router rotaları (21 ekran) | 06 rota haritası |

Motorlar (progression, plateau, PR, hacim, analitik, tarif, ölçüm) **saf
TypeScript**tir: React'e, Expo'ya ve DB'ye bağımlı değildir. Servisler
(`Scheduler`, `ActiveSessionService`, `RestTimerService`) DB'ye yalnızca `Tx`
portu üzerinden dokunur ve **transaction sınırını kendileri belirler**; bu
yüzden gerçek SQLite üzerinde entegrasyon testi yapılabilir.

### Neden servis testleri gerçek SQLite üzerinde

Bu katmanın asıl riski SQL ve kısıtların davranışıdır: tek açık plan
(`ux_sched_one_open`), tek aktif oturum (`ux_sessions_single_active`), tek
çalışan sayaç (`ux_rest_single_running`), FK'lar ve CHECK'ler. Mock'lanmış bir
DB bu riski test etmez; testler migrate edilmiş gerçek şema ve gerçek seed
üzerinde koşar.

### Testler belgeden türetilir

`test/` altındaki 297 test, `04-domain-engines.md` içindeki **test vektörü
tablolarının** ve `05-acceptance-tests.md` senaryolarının doğrudan
karşılığıdır; her test adı kaynağını taşır (`TV-4.01`, `A1`, `G11`, `T8`,
`AT-03` …). Bu sayede bir kural değiştiğinde hangi vektörün kırıldığı anında
görülür.

```bash
npm run verify     # kayma + seed + tip denetimi + testler
npm test           # yalnızca testler
```

### Yedekleme neden bu sırayla çalışıyor

R95.7'nin ("import başarısız olursa mevcut veri silinmez") garantisi bir
`try/catch`'ten değil, **sıralamadan** gelir: arşiv doğrulaması, sha256
kontrolü, şema sürümü, satır doğrulaması ve tüm yazma işlemleri AYRI bir
staging veritabanında yapılır. Kullanıcının dosyasına yalnızca `integrity_check`
ve `foreign_key_check` temiz döndükten sonra, tek bir yeniden adlandırma
adımıyla dokunulur; o adım da başarısız olursa geri alınır.

Testler yedi ayrı bozulma senaryosunu (ZIP değil, manifest yok, veri
kurcalanmış, manifest bozuk, gelecek şema sürümü, tip ihlali, fotoğraf sha
uyuşmazlığı, FK ihlali) tek tek deneyip her birinden sonra **verinin
bayt bayt aynı kaldığını** doğrular.

ZIP yazıcısı elle yazıldı (sıfır bağımlılık); doğruluğu Python'ın `zipfile`
modülüyle çift yönlü olarak test ediliyor — bizim ürettiğimizi o okuyor,
onun ürettiğini biz.

### Şifreleme cihazda değil, CI'da doğrulanıyor

§93 "veritabanı şifreli olacak" der; sorun şu ki SQLCipher production'da
`expo-sqlite` içinden gelir ve Node testlerinde yoktur. "Kod doğru görünüyor"
demekle yetinmemek için araya bir **sürücü portu** kondu (`SqliteDriver`):
aynı `SqliteDatabaseProvider` üç sürücüyle koşar.

| Sürücü | Nerede | Şifreli |
|--------|--------|---------|
| `expoSqlite` | production (Development Build) | evet |
| `sqlcipherNode` | test | evet |
| `nodeSqlite` | test/geliştirme | hayır |

Böylece `test/encryption.test.ts` **gerçek SQLCipher** üzerinde koşar ve
davranışı iddia etmek yerine kanıtlar:

- dosya `SQLite format 3` başlığıyla başlamıyor; hassas değer ve tablo adı
  WAL/SHM dahil hiçbir dosyada düz metin geçmiyor (R93.2),
- yanlış anahtar açılışta reddediliyor, doğru anahtar veriyi geri getiriyor,
- anahtar hiçbir hata mesajına, `cause` zincirine, stack trace'e veya
  **dışa aktarılan yedeğin içine** (sıkıştırma açıldıktan sonra da) girmiyor
  (R93.5, R118.2),
- şifresiz sürücü anahtarla eşleştirilirse sessizce düz açmak yerine
  `EncryptionUnsupportedError` fırlatıyor (R93.3),
- production build şifresiz sağlayıcıyla **veya Expo Go üzerinde** başlamıyor
  (R93.4, R93.7),
- migration'ın aldığı `.bak` kopyası da şifreli (02 §12.1 + §12.2),
- `foreign_keys`, `busy_timeout` ve WAL şifreli bağlantıda da uygulanıyor,
- sürücünün gerçekten SQLCipher olduğu `PRAGMA cipher_version` ile doğrulanıyor.

Bir tuzak ayrıca kilitlendi: **anahtar yok ≠ anahtar okunamıyor**. iOS'ta ilk
kilit açılmadan Keychain erişilemez; orada "anahtar bulunamadı, yenisini
üreteyim" demek mevcut şifreli veritabanını *kalıcı olarak* açılamaz hale
getirirdi. `DbKeyManager` bu iki durumu ayırır (`KeyUnavailableError`) ve
korunacak bir veritabanı varken **asla** yeni anahtar üretmez; test bunu
gerçek bir DB üzerinde, anahtarı geçici olarak kaldırıp geri koyarak doğrular.

Yanında bir **kontrol testi** var: aynı veriyi `nodeSqlite` ile yazıp diskte
düz metin olarak *bulunduğunu* doğrular. Şifreleme testinin boş koşmadığı
böyle garanti edilir. Ayrıca `PRAGMA key` satırı sağlayıcıdan kaldırıldığında
testlerin gerçekten kırıldığı elle doğrulandı.

Anahtar 32 rastgele bayttır, 64 haneli küçük harf hex olarak platform güvenli
deposunda tutulur (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`): cihaz yedeğiyle başka
bir cihaza **taşınmaz**. Bu bilinçlidir (ADR-002) — şifreli DB dosyası bir
şekilde kopyalansa bile yeni cihazda açılamaz; kullanıcının taşınma yolu
uygulamanın kendi yedeğidir (§95). Bunun bedeli şudur: **anahtar kaybı = veri
kaybı**, bu yüzden düzenli yedek hatırlatması bir özellik değil zorunluluktur.

`types/expo-modules.d.ts` geçicidir: Expo uygulaması eklendiğinde gerçek
paketler kurulur ve o dosya silinir.

## Telefona kurulum

`Expo Go` ile ÇALIŞMAZ: SQLCipher native bir modüldür ve Expo Go'da yoktur. Bu
bilinçli bir karardır (R93.4) — şifreleme, migration ve WAL davranışı ilk günden
gerçek koşullarda test edilsin diye. Uygulamayı telefona koymanın iki yolu var:
CI'ın ürettiği **APK** (Android) ve **tarayıcı sürümü** (her cihaz).

### En kısa yol: GitHub Actions'ın ürettiği APK (Android, Expo hesabı gerekmez)

Her `v90/**` push'unda **V90 Android APK** iş akışı
(`.github/workflows/v90-build-android.yml`) `expo prebuild` + `gradle
assembleRelease` ile APK üretir ve `v90-android` ön sürümüne ekler:

- **Son derleme:** <https://github.com/beartransfersusa-ops/kredi-karti-takip/releases/download/v90-android/v90.apk>
- Sürüm sayfası (commit'e göre kopyalar): <https://github.com/beartransfersusa-ops/kredi-karti-takip/releases/tag/v90-android>

Telefonda linki aç → indir → "bilinmeyen kaynaklara izin ver" → kur. Elle
tetiklemek: **Actions → V90 Android APK → Run workflow**. Derleme ~20–30 dk sürer;
iş akışının özetinde de aynı link yazar.

Dürüst notlar:

- APK **debug keystore** ile imzalıdır (Expo şablonunun varsayılanı): telefona
  yüklenir, Play Store'a gönderilemez. Keystore herkese açık olduğu için
  "bu APK'yı yalnızca ben üretmiş olabilirim" güvencesi de yoktur — mağaza için
  kendi keystore'un gerekir.
- `expo prebuild` CI'da `android/gradle.properties` içine
  `expo.sqlite.useSQLCipher=true` yazar ve iş akışı bunu **denetler**; SQLCipher
  derlemeye gerçekten girer.
- **iPhone:** CI'da iOS derlemesi yok (Apple Developer hesabı ve imza gerekir).
  Yol: EAS (aşağıda) ya da Mac'te `npm run ios`.

### Tarayıcıda çalıştırma (web)

Aynı uygulama **V90 Web (GitHub Pages)** iş akışıyla (`.github/workflows/v90-web.yml`)
yayınlanır:

- **Adres:** <https://beartransfersusa-ops.github.io/kredi-karti-takip/>

Android Chrome'da "Ana ekrana ekle" ile uygulama gibi açılır; ilk açılıştan sonra
çevrimdışı da açılır (service worker, 02 §2.2). İlk yayında Pages otomatik
açılamazsa: **Settings → Pages → Source: GitHub Actions**, sonra iş akışını
yeniden çalıştır.

Web'de ne farklı (ADR-013, 06 B.20):

- **SQLCipher yok.** Veritabanı sql.js ile bellekte çalışır; her commit'ten
  sonra görüntüsü AES-GCM-256 ile şifrelenip IndexedDB'ye yazılır. Anahtar
  çıkarılamaz bir WebCrypto `CryptoKey`'dir; JS baytlarını göremez. Bu
  "SQLCipher" değildir ve ekranda öyle anlatılmaz (R93.4).
- Tarayıcı site verisini silerse (yer sıkışması, "site verilerini temizle")
  görüntü ve anahtar birlikte gider: **veri gider.** Uygulama açılışta kalıcı
  depolama izni ister ve sonucu Ayarlar'da gösterir; düzenli yedek al.
- Biyometrik kilit, bildirim ve ekran görüntüsü engelleme yok; fotoğraflar
  tarayıcı deposunda. Aynı anda **tek sekme** (ikincisi "Veritabanı açılamadı" der).
- Yedek ZIP'i indirme klasörüne iner; formatı Android ile aynıdır.

**Web'de başla, telefona taşı:** web'de Ayarlar → Yedekleme → Dışa aktar (ZIP
iner) → Android uygulamasında Ayarlar → Yedekleme → İçe aktar. Tersi de aynı.

Yerel geliştirme: `npm run web` (Metro, <http://localhost:8081>);
`npm run export:web` `dist-web/` üretir (`404.html`, `manifest.webmanifest`,
`sw.js` dahil). `verify:bundle` web bundle'ını da denetler: `expo-sqlite` /
Keychain izi yok, `sqlJsDriver` / `AES-GCM` / `V90E` izi var.

### EAS Build (isteğe bağlı; iOS için gerekli)

```bash
npm install -g eas-cli
eas login                              # ücretsiz Expo hesabı (expo.dev)
cd v90 && npm ci
eas build --platform android --profile preview    # ya da --platform ios
```

Derleme bitince expo.dev panelinde indirme linki çıkar. iOS için Apple Developer
hesabı ($99/yıl) ve cihaz UDID kaydı (`eas device:create`) ya da TestFlight gerekir.

### Geliştirme döngüsü (kod değiştirirken)

```bash
eas build --platform android --profile development   # bir kez: dev client
npm start                                             # sonra: Metro, canlı yenileme
```

`development` profili bir **dev client** üretir: bir kez kurarsın, sonra her
kod değişikliği Metro üzerinden anında telefona gider; yeniden build yalnızca
native bağımlılık değişince gerekir.

### Yerel derleme (Android SDK / Xcode kuruluysa)

```bash
npm run prebuild          # native projeyi üretir; SQLCipher plugin'i burada devreye girer
npm run android           # ya da: npm run ios
```

`npx expo prebuild --platform android` bu ortamda çalıştırıldı ve
`android/gradle.properties` içine `expo.sqlite.useSQLCipher=true` yazdığı
doğrulandı: SQLCipher, native projeye gerçekten giriyor.

### Ekranlar

| Rota | Ne | Belge |
|------|-----|-------|
| `(tabs)/index` | Dashboard: 4 kart önceliği, kaçırılan kararı, kol KPI | A.1, A.2, A.5 |
| `workout/active` | Set girişi, unilateral, dinlenme çubuğu, hareket atlama, öneri kartı, "Teknik" (video fallback) | A.3, A.7, B.15 |
| `workout/finish` | Tam/kısmi kuralı, kısmi karar, antrenman tarihi | A.4 |
| `workout/substitute` | Alternatif hareket (ekipman + ağrı filtreli) | A.3 |
| `program/settings` | Dondur/devam ettir, takvim modu önizlemeli | A.9 |
| `program/reschedule` | Ay görünümü takvim, dondurma aralıkları kapalı | A.10 |
| `insights/plateau/[id]` | 7 adımlı checklist, öneriler (otomatik uygulama YOK) | A.8 |
| `onboarding/index` | 4 adım; kaldığı yerden devam eder | B.1–B.4 |
| `settings/equipment` | Preset + etki önizlemesi ("{n} hareket yapılamıyor") | B.5 |
| `settings/lock` | Biyometrik kilit, grace süresi, gizlilik | B.6 |
| `settings/backup` | Dışa aktar / içe aktar / geri al | B.7, B.8 |
| `measurements/new` | 1–3 örnek, eşik aşımında üçüncüsü önerilir | B.9 |
| `(tabs)/progress` | Kilo trendi, omuz/bel oranı, haftalık hacim, adherence | B.10, B.11 |
| `(tabs)/nutrition` | Gün günlüğü, Copy Yesterday, öğün tekrarı, "kayıtlı öğün olarak sakla" | B.12 |
| `nutrition/add` | Besin arama (son / favori / kayıtlı / tarif / tümü), porsiyon dönüştürücü, yeni besin | B.12 |
| `nutrition/recipe` | Tarif oluşturucu, cooked yield, porsiyon | B.13 |
| `photos/index` | İlerleme fotoğrafları, karşılaştırma, silme | B.14 |
| `report/day90` | Day 90 raporu: kilo/çevre deltaları, oran, adherence, PR'lar; programı kullanıcı kapatır | B.19, AT-20 |

Öneri kartı (A.7) ayrı bir rota değil: aktif antrenman ekranında hareket
başlığında ve İlerleme ekranında hacim önerisi olarak görünür.

### UI metni de üretilir

`scripts/extract-i18n.py`, `06-ux-flows.md` içindeki "Türkçe metinler"
tablolarından 530 anahtarlık sözlüğü üretir ve kayma denetimine dahildir.
Üretilen `TrParams` tipi yer tutucuları **derleme zamanında** denetler:

```ts
t('home.day')              // hata: {X} eksik
t('home.day', { X: 12 })   // "Day 12 / 90"
```

Bu tip denetimi belgede üç birleşik satır (`active.side.left` / `.right` gibi)
ve iki eksik anahtar buldu; **kod değil belge** düzeltildi.

### Bundle gerçekten derleniyor — ve denetleniyor

`npm run verify:bundle` önce `expo export` ile bundle üretir, sonra
`scripts/check-bundle.mjs` ile ADR-002 Karar 3'ün istediği denetimi yapar:

| Bulunmamalı | Neden |
|---|---|
| `sqlJsDriver`, `EncryptedImageStore`, `sql-wasm` (ios) | web motoru yerel bundle'a giremez (ADR-013) |
| `expo-sqlite`, `ExpoSecureStore`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (web) | web'de SQLCipher/Keychain varmış gibi görünmez (R93.4) |
| `node:sqlite`, `NodeSqliteProvider`, `nodeSqliteDriver` | şifresiz sağlayıcı production'a giremez (R93.7) |
| `@journeyapps/sqlcipher` | yalnızca test sürücüsü |
| `node:crypto`, `node:fs` | Node'a özgü kod cihazda çalışmaz |

| Bulunmalı | Neden |
|---|---|
| `expo-sqlite`, `PRAGMA key`, `v90.dbkey`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | denetim boş koşmasın |

Bu denetim ilk çalıştırmada **üç gerçek hata** buldu: `container.ts`
`NodeSqliteProvider`'ı statik import ediyordu (yani `node:sqlite` bundle'a
giriyordu), ZIP yazıcısı `node:zlib` kullanıyordu ve `BackupImporter` dosya
silmek için `node:fs` çağırıyordu. Üçü de düzeltildi:

- şifresiz sağlayıcıya giden yol tamamen kaldırıldı (`dbPath` yoksa hata),
- sıkıştırma `fflate`'e taşındı — saf JS olduğu için Node ve RN'de **aynı kod**
  koşar; ZIP doğruluğu hâlâ Python `zipfile` ile çift yönlü test ediliyor,
- dosya silme `BlobStore` portuna eklendi; `node:fs` gerçekleştirmesi
  `BlobStore.node.ts`'e ayrıldı.

Aynı ayrım hash için de yapıldı: `hash.node.ts` (test) ↔ `platform/hash.ts`
(expo-crypto). Böylece bundle'da sıfır Node kodu var.

> Not: bytecode adımı atlanıyor (`--no-bytecode`). Paketteki `hermes-compiler`
> 0.14 `#private` alanları desteklemiyor, ama React Native 0.83'ün **kendi**
> kodu da bunları taşıyor — cihazdaki Hermes destekliyor, sorun eski
> hermesc'te.

### Üç kuralın kodla korunması

Bu üç ekran, belgede en çok "yapılmayacak" içeren yerler. Niyeti yoruma
bırakmak yerine teste bağladık:

| Kural | Nasıl korunuyor |
|---|---|
| R104.7 / R121.1 · hiçbir öneri otomatik uygulanmaz | Öneri kartı yalnızca `recommendations.decision_*` yazar; "Kabul" bile sadece prefill'i değiştirir, seti kullanıcı loglar |
| R121.3 · karar kaybolmaz | Karar verilmeden ilk set loglanırsa öneri `ignored` olarak LOGLANAN değerle kapanır; test bunu doğruluyor |
| R110.5 · sahte kesinlik yok | Cooked yield yoksa taban "ham toplam"dır ve ekranda açıkça yazılır; boş tarifin toplamı `0` değil `—` |
| R111.3 · kullanıcı düzenlemesi korunur | Etiket override `custom_edited = 1` yazar |
| R116.3 · cloud sync yok | `app/photos/` ve `src/features/photos/` kaynağı ile `photos.*` metinleri taranıyor: iCloud / Google Drive / "cloud sync" / "yakında" geçemez. Tersine "buluta gönderilmez" cümlesi BULUNMALI (denetim boş koşmasın) |
| R116.4 · silme dosyayı da temizler | Silme üç adımlı; yarıda kesilirse `sweepOrphans` açılışta tamamlar — test bunu simüle ediyor |
| R94.6 · tutulamayacak söz verilmez | `preventScreenCaptureAsync` yalnızca Android'de ve ayara bağlı çağrılır; iOS'ta bilgi metni var, anahtar YOK |
| R111.3 · seed güncellemesi override'ı ezmez | `installSeed`, `custom_edited = 1` besinlere dokunmaz (`preservedFoods` sayacı); seed'den düşen besin **soft-delete** olur, kullanıcı günlüğü bozulmaz |
| R114.1 · video araması yok | Video ID'leri yalnızca `data/exercise-videos.json` manifest'inden gelir; `verify-seed` H1 her girişi katalogdaki bir harekete bağlar. Manifest bilinçli olarak **boş** |
| R123 · sahte kesinlik yok (rapor) | Day 90 raporu yalnızca ölçülen deltaları gösterir; e1RM "tahmin" rozetiyle, biceps bilinmiyorsa `0 cm` değil CTA. Test raporun tüm metnini "kesin / kas kazandın" için tarar |

Fotoğraf silme sırası bilinçli: satır önce `pending_delete = 1` yapılır
(fotoğraf grid'den hemen kaybolur), sonra dosya, sonra satır. Kesinti hâlinde
kullanıcı için fotoğraf zaten silinmiştir; "sildim ama geri geldi" durumu
oluşmaz. Dosyası kaybolmuş satır ise **silinmez**, raporlanır — kaydı kaldırmaya
kullanıcı karar verir.

### Besin seed'i belgeden gelir

`docs/v90/00-specification-part1.md` §46.1'deki 189 satırlık tablo tek
kaynaktır; `scripts/extract-seed.py` bundan `data/food-items.json` üretir ve
üretirken **kendi kendini denetler**: kcal ≈ 4P + 4K + 9Y tutmayan, kaynağı
`usda`/`tr-label` olmayan, birimi/porsiyonu tutarsız veya "iyi/kötü"
etiketi taşıyan satır üretimi kırar. Marka ürünleri ve alkol kapsam dışıdır
(belgede gerekçesiyle). Seed **tek doğru değildir** (R111.1): kullanıcı her
değeri etiketten düzeltebilir ve bu düzeltme seed güncellemesinde korunur.

Copy Yesterday / öğün tekrarı / kayıtlı öğünler geçmiş satırı kopyalamaz;
**bugünkü** besin değerinden yeniden snapshot alır. Böylece düzeltilmiş bir
besin, kopyalanan öğünde de doğru görünür.

### Video: manifest boş, fallback tam

§114 çalışma zamanında video aramayı yasaklar; bu yüzden video katmanı
"kürasyonlu manifest + fallback" olarak kuruldu. Manifest şu an sıfır giriş
içerir: hareket başına doğru YouTube ID'yi **doğrulamadan** yazmak R114.1'in
ruhuna aykırıydı. Boş manifestle ekran şunu yapar: hareket ipuçları (cues)
her zaman görünür, "video yok" rozeti çıkar, çevrimdışı/erişilemez
durumlarında yeniden dene + kaynağa git vardır. Manifest'e giriş eklemek
`data/exercise-videos.json` düzenlemek ve `npm run verify:seed` (H1)
koşturmaktır; oynatıcı ancak o zaman bağlanır.

### Uçtan uca test

`test/appFlow.test.ts` ekranların çağırdığı yolun tamamını gerçek SQLite
üzerinde koşturur: bootstrap → seed → onboarding → program → dashboard →
antrenman → bitirme → adherence. Bu test iki gerçek hata buldu:

1. `Scheduler`'ın tercih günleri okuması kendi transaction'ını açıyordu; oysa
   Scheduler daima açık bir transaction içinde çağrılır → iç içe transaction.
   İmza `tx` alacak şekilde düzeltildi.
2. `completeSet`, hareketi planlanan set sayısına ulaşınca `done` yapmıyordu;
   `done` yalnızca bitirme anında yazılıyordu. `04-domain-engines.md` §2 zaten
   doğru davranışı tanımlıyordu (`n >= planned_working_sets ? 'done' : …`) —
   **kod belgeden sapmıştı**, belge değil.

## Sırada ne var

Kod tarafında belgedeki tüm akışlar yazıldı. Kalanlar cihaz ve içerik işi:

1. **Gerçek cihazda E2E (Maestro)** — AT-07 akış, AT-13 cihaz saat dilimi
   değişimi, AT-17/18 video ve çevrimdışı UI, AT-19 biyometri, AT-20 Day 90
   raporu. Bu altı senaryo simülatör/CI'da kanıtlanamaz.
2. **Video manifest kürasyonu** — her hareket için kanal + ID + doğrulama
   tarihi elle girilir; manifest dolunca oynatıcı bağlanır (yukarı bkz.).
3. **Gerçek cihazda ilk kullanım** — APK ve web adresi artık CI'dan geliyor
   ("Telefona kurulum"). Cihazda görülen her sorun bir AT senaryosuna bağlanıp
   düzeltilecek; web için IndexedDB/Web Locks yolları yalnızca headless
   Chromium duman testinde koştu, gerçek telefon tarayıcısında henüz değil.

R124.1 gereği: 20 senaryonun tamamı geçmeden uygulama "complete" sayılmaz.
Şu an **kod seviyesinde** karşılananlar: AT-01, AT-02, AT-03, AT-04, AT-05,
AT-06, AT-08, AT-09, AT-10, AT-11, AT-12, AT-14, AT-15, AT-16 (14/20).

Day 90 raporu ve video fallback ekranları yazıldı ama bu, AT sayacını
**artırmaz**: kalan altı senaryo (AT-07, AT-13, AT-17, AT-18, AT-19, AT-20)
gerçek cihazda koşan bir E2E gerektirir ve o henüz yok. AT-20'nin veri katmanı
`test/day90Report.test.ts` içinde belgedeki fixture ile doğrulanıyor; ekranın
kendisi cihazda görülmeden sayaç 14/20'de durur.
