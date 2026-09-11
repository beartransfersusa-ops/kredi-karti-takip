# V90 – Uygulama artefaktları

Bu dizin, [`../docs/v90/`](../docs/v90/) altındaki specification'dan **üretilen** ve
**doğrulanan** artefaktları içerir. Uygulama kodu henüz yazılmadı; burada bulunanlar
uygulamanın temelini oluşturan şema ve seed verisidir.

> Bu dizin, deponun kök dizinindeki kredi kartı takip uygulamasından bağımsızdır.

## Ne var burada

| Yol | Ne | Kaynak |
|-----|-----|--------|
| `src/core/db/migrations/001_initial.sql` | Tam şema (45 tablo, 2 görünüm, 21 indeks) | `docs/v90/03-data-model.md` §1 |
| `data/exercises.json` | 32 hareketlik katalog + 14 alternatif ilişkisi | Bölüm I §35, §36 |
| `data/programs/v90.json` | 5 antrenman şablonu, 30 şablon hareketi | Bölüm I §21–§26 |
| `data/muscle-volume-targets.json` | 16 kas için baseline ve tavan | Bölüm I §28 |
| `data/initial-profile.json` | Başlangıç antropometrisi | Bölüm I §11 |

## Üretilmiş dosyalar elle düzenlenmez

Yukarıdaki dosyaların tamamı **specification'dan üretilir**. Bir değer değişecekse
önce belge güncellenir, sonra üretim çalıştırılır:

```bash
cd v90
npm run gen        # migration + seed'i belgeden yeniden üret
npm run verify     # kayma denetimi + seed doğrulaması
```

Bu, belge ile veri arasında sessiz kopukluk oluşmasını yapısal olarak engeller:
belge tek doğruluk kaynağıdır, dosyalar onun türevidir.

## Doğrulama neyi garanti eder

`npm run verify` iki aşamalıdır.

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

## Gereksinimler

Node ≥ 22.5 (`node:sqlite` ve yerel TypeScript type-stripping için) ve Python 3.11+.
Üreticiler ve kayma denetimi bağımlılıksız çalışır; testler ve tip denetimi için
`npm install` gerekir.

| Paket | Nerede | Niçin |
|-------|--------|-------|
| `zod` | runtime | Yedek manifest/veri şeması doğrulaması (02 §12.3) |
| `typescript`, `@types/node` | dev | `tsc --noEmit` |
| `@journeyapps/sqlcipher` | dev | Şifreli yolu **CI'da gerçekten** koşturmak (aşağı bkz.) |

`@journeyapps/sqlcipher` yalnızca testlerde kullanılır; uygulamaya girmez.

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

`test/` altındaki 171 test, `04-domain-engines.md` içindeki **test vektörü
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

## Sırada ne var

1. Expo uygulaması ve ekranlar — `06-ux-flows.md`
   (prebuild + `['expo-sqlite', { useSQLCipher: true }]`; Expo Go yalnızca UI prototipi)
2. Progress fotoğrafı depolama ve `OrphanSweeper` — 02 §13.2
3. App lock / biyometri (AT-19) — §94; iOS'ta ekran görüntüsü engellemesi
   **vaat edilmeyecek** (R94.6)
4. Kalan AT senaryolarının E2E karşılıkları (Maestro)

R124.1 gereği: 20 senaryonun tamamı geçmeden uygulama "complete" sayılmaz.
Şu an kod seviyesinde karşılananlar: **AT-01, AT-02, AT-03, AT-04, AT-05,
AT-06, AT-08, AT-09, AT-10, AT-11, AT-12, AT-14, AT-15, AT-16** (14/20).
Kalanlar cihaz veya henüz yazılmamış katman gerektiriyor: AT-07 (E2E akış),
AT-13 (cihaz tz), AT-17/18 (video/offline UI), AT-19 (biyometri),
AT-20 (rapor ekranı).
