# V90 – 90 Günlük Challenge Uygulaması · Tasarım Belgeleri

Bu klasör, V90 mobil uygulamasının (React Native + Expo, offline-first, şifreli SQLite) **specification** ve **mimari tasarım** belgelerini içerir. Belgeler Türkçedir; teknik terimler İngilizce bırakılmıştır.

| Belge | İçerik | Kim okur |
|-------|--------|----------|
| [`01-specification.md`](01-specification.md) | Bölüm II gereksinimleri (§87–§124), `R<bölüm>.<sıra>` kimlikleriyle; 20 kabul senaryosu (AT-01..AT-20) | Herkes |
| [`02-architecture.md`](02-architecture.md) | Teknoloji yığını, katmanlar, modül haritası, sözlük, her gereksinim grubunun mimari karşılığı, izlenebilirlik matrisi | Geliştirici, reviewer |
| [`03-data-model.md`](03-data-model.md) | Tam SQLite DDL (`001_initial`), migration kuralları, türetilmiş görünümler, TypeScript tipleri, Zod/`TableRegistry` | Geliştirici |
| [`04-domain-engines.md`](04-domain-engines.md) | Algoritmalar: takvim/sıra, autosave/rest timer, artış adımları ve effective load, progression, plateau, hacim, PR, substitution, adherence/trend/rapor, beslenme, ölçüm kalitesi, zaman | Geliştirici, test yazarı |
| [`05-acceptance-tests.md`](05-acceptance-tests.md) | AT-01..AT-20 için test seviyeleri, adımlar, beklenen sonuçlar, otomatik test kimlikleri | QA, geliştirici |
| [`06-ux-flows.md`](06-ux-flows.md) | Ekran durumları, akışlar ve Türkçe UI metinleri | Tasarımcı, geliştirici |
| [`adr/`](adr/) | Mimari karar kayıtları (ADR-001 … ADR-012) | Reviewer |

## Bölüm I (§1–§86) hakkında

Ürün tanımı, V90 default programı, başlangıç profili ve ekran listesi Bölüm I'de tanımlıdır ve **bu repoda bulunmamaktadır**. Bölüm II bunlara atıf yapar (örn. "V-Taper Upper" şablonu, öncelikli kaslar, MRV tablosu). Bölüm I eklendiğinde `00-specification-part1.md` olarak bu klasöre konmalı ve `02-architecture.md` §9.3'teki `max_recommended_weekly_sets` kaynağı oradaki tabloya bağlanmalıdır.

## Okuma sırası

1. `01-specification.md` → hangi davranışların zorunlu olduğunu öğren.
2. `02-architecture.md` §1–§4 → ilkeler ve sözlük; sonra ilgilendiğin bölüm.
3. `03-data-model.md` → tabloları ve tipleri; `04-domain-engines.md` → algoritmaları.
4. Uygulamaya başlamadan `05-acceptance-tests.md` içindeki ilgili AT senaryolarını test olarak yaz.

## Tasarımın temel kararları (özet)

- **`challengeDay` türetilir, `trainingSequenceIndex` saklanır**; sıra yalnızca tamamlanma, açık atlama veya kısmi antrenmanı "bitmiş say" ile ilerler (§88).
- **DB tek doğruluk kaynağı**: her set kendi transaction'ında, aktif oturum kalıcı (§90).
- **Rest timer** `restStartedAt + restDurationSeconds`'tan türetilir (§91).
- **SQLCipher** + SecureStore anahtarı; Expo Development Build zorunlu (§93).
- **Yedek** = ZIP (`manifest.json`, `data.json`, `photos/`), import staging DB ile atomik (§95).
- **Öneriler** gerekçeli, kanıtlı, kullanıcı kararlı; asla otomatik uygulanmaz (§104, §105, §121, §122).
- **Bilinmeyen değer `null`**; biceps baseline yoksa CTA (§96, §119).

## Kapsam notu: Bölüm I özellikleri

Şema (`03-data-model.md`) `supplements`, `supplement_logs` ve `cardio_logs` tablolarını içerir; bunlar §95'in tam yedekleme kapsamı gereğidir (R95.1). Bu tabloların **ekran ve akışları Bölüm I'de** tanımlıdır ve bu belgelerde ayrıca ele alınmaz. Bölüm II'nin bu tablolara getirdiği tek kısıt, yedekleme/import kapsamına dahil olmaları ve zaman alanlarının §112 sözleşmesine uymasıdır.

## Açık noktalar

`04-domain-engines.md`, `05-acceptance-tests.md` ve `06-ux-flows.md` bölümlerinin sonundaki **"Tutarsızlık / açık nokta"** listeleri bilinçli olarak korunmuştur. Üç grup vardır:

1. **`(ÇÖZÜLDÜ)` işaretli maddeler** — tasarım turunda bulunan gerçek çelişkiler; düzeltmesi `02`/`03`'e uygulandı. Madde, kararın ne olduğunu ve nereye yazıldığını söyler. Örnekler: `personal_records.exercise_id` nullable + `sessionVolumePr` CHECK'i, `set_index` tek artan sayaç, oturuma bağlı kayıtların günü, `cancelSession`'ın yerinde geri açması, `reschedule_reason` enum'undan `cancelSession`'ın kaldırılması, Zod sınırlarının DB CHECK'leriyle hizalanması.
2. **Türetilmiş isimler** — 02/03'te bulunmayan ama mevcut kalıplardan üretilen servis, tip ve hata adları. Bilgi amaçlıdır; uygulama sırasında bu adlar kullanılır.
3. **Ürün onayı bekleyen kararlar** — eşik sabitleri (plateau checklist eşikleri, `%2.5–5` progression bandı, recovery kuralları, `%10` deload) ve UX tercihleri. **Uygulamaya başlamadan önce bu grup gözden geçirilmelidir.**

Bu listeler belgenin denetim izidir; silinmemeli, karar verildikçe `(ÇÖZÜLDÜ)` olarak işaretlenmelidir.

## Tamamlanma kriteri

Core application, `05-acceptance-tests.md` içindeki 20 senaryonun tamamı geçmeden "complete" olarak raporlanmaz (R124.1).
