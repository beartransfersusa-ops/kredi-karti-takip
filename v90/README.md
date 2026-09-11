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

Node ≥ 22.5 (`node:sqlite` için) ve Python 3.11+. **Harici bağımlılık yok** —
`npm install` gerekmez.

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
| `src/domain/program/` | `ChallengeCalendar`, `TrainingSequence` | 04 §1 |

Domain katmanı **saf TypeScript**tir: React'e, Expo'ya ve DB'ye bağımlı değildir,
bu yüzden Node'da doğrudan ve deterministik test edilir.

### Testler belgeden türetilir

`test/` altındaki 114 test, `04-domain-engines.md` içindeki **test vektörü
tablolarının** doğrudan karşılığıdır; her test adı kaynağını taşır (`TV-4.01`,
`A1`, `G11`, `AT-09` …). Bu sayede bir kural değiştiğinde hangi vektörün
kırıldığı anında görülür.

```bash
npm run verify     # kayma + seed + tip denetimi + testler
npm test           # yalnızca testler
```

## Sırada ne var

1. Repository katmanı ve servisler (`ActiveSessionService`, `Scheduler`) — 02 §6, §7
2. Expo uygulaması ve ekranlar — `06-ux-flows.md`
3. `05-acceptance-tests.md` içindeki AT-01..AT-20 senaryolarının E2E karşılıkları

R124.1 gereği: bu 20 senaryonun tamamı geçmeden uygulama "complete" sayılmaz.
Şu an domain seviyesinde karşılananlar: AT-08, AT-09, AT-10, AT-11, AT-12, AT-16.
