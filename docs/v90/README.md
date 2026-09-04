# V90 – 90 Günlük Challenge Uygulaması · Tasarım Belgeleri

Bu klasör, V90 mobil uygulamasının (React Native + Expo, offline-first, şifreli SQLite) **specification** ve **mimari tasarım** belgelerini içerir. Belgeler Türkçedir; teknik terimler İngilizce bırakılmıştır.

| Belge | İçerik | Kim okur |
|-------|--------|----------|
| [`00-specification-part1.md`](00-specification-part1.md) | **Bölüm I** (§1–§86): ürün ve kullanıcı, başlangıç durumu, V90 programı (5 antrenman rotasyonu, hareket kataloğu, hacim hedefleri), beslenme, toparlanma, ekran listesi, içerik kuralları | Herkes |
| [`01-specification.md`](01-specification.md) | **Bölüm II** (§87–§124): kritik mimari ve ürün kısıtları; 20 kabul senaryosu (AT-01..AT-20) | Herkes |
| [`02-architecture.md`](02-architecture.md) | Teknoloji yığını, katmanlar, modül haritası, sözlük, her gereksinim grubunun mimari karşılığı, izlenebilirlik matrisi | Geliştirici, reviewer |
| [`03-data-model.md`](03-data-model.md) | Tam SQLite DDL (`001_initial`), migration kuralları, türetilmiş görünümler, TypeScript tipleri, Zod/`TableRegistry` | Geliştirici |
| [`04-domain-engines.md`](04-domain-engines.md) | Algoritmalar: takvim/sıra, autosave/rest timer, artış adımları ve effective load, progression, plateau, hacim, PR, substitution, adherence/trend/rapor, beslenme, ölçüm kalitesi, zaman | Geliştirici, test yazarı |
| [`05-acceptance-tests.md`](05-acceptance-tests.md) | AT-01..AT-20 için test seviyeleri, adımlar, beklenen sonuçlar, otomatik test kimlikleri | QA, geliştirici |
| [`06-ux-flows.md`](06-ux-flows.md) | Ekran durumları, akışlar ve Türkçe UI metinleri | Tasarımcı, geliştirici |
| [`adr/`](adr/) | Mimari karar kayıtları (ADR-001 … ADR-012) | Reviewer |

## İki bölüm, tek specification

**Bölüm I** ürünün *ne* olduğunu tanımlar: kullanıcı, hedef, V90 programı, beslenme ve toparlanma stratejisi, ekranlar, içerik kuralları.
**Bölüm II** ürünün *nasıl* inşa edileceğine dair kritik kısıtları tanımlar: veri kaybı, gizlilik, sessiz atlama, sahte kesinlik, timezone, migration, yedekleme.

Çelişki hâlinde **Bölüm II önceliklidir** — oradaki maddeler mimari güvenlik kısıtlarıdır ve hiçbir ürün tercihi onları geçersiz kılamaz.

İki bölüm birbirine iki yönden bağlıdır: Bölüm I §85 özellik → mimari köprü tablosunu, `02-architecture.md` §17 ise gereksinim → bileşen → kabul testi matrisini içerir.

### Programın sayısal omurgası

V90, **5 antrenmanlık döngüsel bir rotasyondur** (Gün 1 İtiş, Gün 2 Çekiş, Gün 3 Bacak, Gün 4 Kol ve Omuz, Gün 5 V-Taper Üst); bir tam rotasyon bir haftaya karşılık gelir. Haftalık direkt set dağılımı Bölüm I §27'de tanımlıdır ve Bölüm II §106.1'deki örnekle **birebir aynıdır**: Yan omuz 12 · Biceps 13 · Triceps 13 · Sırt 15 · Göğüs 10 · Quadriceps 7 · Hamstring 8 (toplam 87 set). Bu sayılar `muscle_volume_targets` tablosunun baseline değerleridir (Bölüm I §28) ve hacim korkuluklarının (§105) referansıdır.

## Okuma sırası

1. `00-specification-part1.md` §1–§10 → ürünün ne olduğunu ve kim için olduğunu öğren.
2. `01-specification.md` → hangi davranışların mimari olarak zorunlu olduğunu öğren.
3. `02-architecture.md` §1–§4 → ilkeler ve sözlük; sonra ilgilendiğin bölüm.
4. `03-data-model.md` → tabloları ve tipleri; `04-domain-engines.md` → algoritmaları.
5. Uygulamaya başlamadan `05-acceptance-tests.md` içindeki ilgili AT senaryolarını test olarak yaz.

## Tasarımın temel kararları (özet)

- **`challengeDay` türetilir, `trainingSequenceIndex` saklanır**; sıra yalnızca tamamlanma, açık atlama veya kısmi antrenmanı "bitmiş say" ile ilerler (§88).
- **DB tek doğruluk kaynağı**: her set kendi transaction'ında, aktif oturum kalıcı (§90).
- **Rest timer** `restStartedAt + restDurationSeconds`'tan türetilir (§91).
- **SQLCipher** + SecureStore anahtarı; Expo Development Build zorunlu (§93).
- **Yedek** = ZIP (`manifest.json`, `data.json`, `photos/`), import staging DB ile atomik (§95).
- **Öneriler** gerekçeli, kanıtlı, kullanıcı kararlı; asla otomatik uygulanmaz (§104, §105, §121, §122).
- **Bilinmeyen değer `null`**; biceps baseline yoksa CTA (§96, §119).

## Seed verisinin kaynağı

Uygulamanın paketlediği seed dosyalarının kanonik kaynağı Bölüm I'dir:

| Seed dosyası | Kaynak |
|---|---|
| `data/programs/v90.json` | Bölüm I §21–§26 (şablonlar ve set/tekrar/RIR/dinlenme) |
| `data/exercises.json` | Bölüm I §35 (32 hareket, alan tanımları §36) |
| `data/initial-profile.json` | Bölüm I §11 |
| `muscle_volume_targets` seed | Bölüm I §28 |
| `data/foods.seed.json` | Bölüm I §46 |
| `data/exercise-videos.json` | Bölüm I §38 (küratörlük ölçütleri) |

## Açık noktalar

`04-domain-engines.md`, `05-acceptance-tests.md` ve `06-ux-flows.md` bölümlerinin sonundaki **"Tutarsızlık / açık nokta"** listeleri bilinçli olarak korunmuştur. Üç grup vardır:

1. **`(ÇÖZÜLDÜ)` işaretli maddeler** — tasarım turunda bulunan gerçek çelişkiler; düzeltmesi `02`/`03`'e uygulandı. Madde, kararın ne olduğunu ve nereye yazıldığını söyler. Örnekler: `personal_records.exercise_id` nullable + `sessionVolumePr` CHECK'i, `set_index` tek artan sayaç, oturuma bağlı kayıtların günü, `cancelSession`'ın yerinde geri açması, `reschedule_reason` enum'undan `cancelSession`'ın kaldırılması, Zod sınırlarının DB CHECK'leriyle hizalanması.
2. **Türetilmiş isimler** — 02/03'te bulunmayan ama mevcut kalıplardan üretilen servis, tip ve hata adları. Bilgi amaçlıdır; uygulama sırasında bu adlar kullanılır.
3. **Ürün onayı bekleyen kararlar** — eşik sabitleri (plateau checklist eşikleri, `%2.5–5` progression bandı, recovery kuralları, `%10` deload) ve UX tercihleri. **Uygulamaya başlamadan önce bu grup gözden geçirilmelidir.**

Bu listeler belgenin denetim izidir; silinmemeli, karar verildikçe `(ÇÖZÜLDÜ)` olarak işaretlenmelidir.

## Tamamlanma kriteri

Core application, `05-acceptance-tests.md` içindeki 20 senaryonun tamamı geçmeden "complete" olarak raporlanmaz (R124.1).
