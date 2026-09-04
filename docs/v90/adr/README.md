# Mimari Karar Kayıtları (ADR)

| # | Karar | İlgili bölümler |
|---|-------|-----------------|
| [001](ADR-001.md) | Takvim günü ile antrenman sırası ayrı state olarak tutulur | §88, §89, §103 |
| [002](ADR-002.md) | SQLCipher şifreli SQLite; anahtar SecureStore; Expo Development Build | §93 |
| [003](ADR-003.md) | Rest timer zaman damgasından türetilir; yerel bildirim planlanır | §91 |
| [004](ADR-004.md) | Veritabanı tek doğruluk kaynağıdır: komut modeli, anında transaction | §90, §117 |
| [005](ADR-005.md) | Yedek formatı ZIP; import staging DB ile atomik değişim | §95 |
| [006](ADR-006.md) | İleri-yalnız, idempotent, checksum'lu migration'lar ve dosya yedeği | §92 |
| [007](ADR-007.md) | UTC + localDateKey + timezone birlikte saklanır | §112, §113 |
| [008](ADR-008.md) | loadProgressionType ile effective load normalizasyonu | §100, §101, §107 |
| [009](ADR-009.md) | Küratörlü video manifesti, resmi embed player, doğrulama scripti | §114, §115 |
| [010](ADR-010.md) | Öneriler açıklanabilir, kullanıcı kararlıdır, otomatik uygulanmaz | §104, §105, §121–§123 |
| [011](ADR-011.md) | Hacimde yalnızca direct set; secondary ayrı tahmin; unilateral çift sayılmaz | §102, §106 |
| [012](ADR-012.md) | Gizlilik varsayılanları: analytics yok, app-private fotoğraflar | §94, §116, §118 |

Yeni karar eklerken: sıradaki numarayı kullan, şablonu (Bağlam / Karar / Alternatifler / Sonuçlar / Doğrulama) izle, bu tabloya satır ekle ve etkilenen gereksinim kimliklerini yaz.
