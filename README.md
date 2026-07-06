# 💳 Kredi Kartı Son Ödeme Takibi

Kredi kartlarının **hesap kesim tarihinden** yola çıkarak **son ödeme tarihlerini** hesaplar.
Son ödeme günü hafta sonuna veya resmî tatile denk geldiğinde — Türkiye'deki banka
uygulamasına göre — otomatik olarak **bir sonraki iş gününe** kaydırır. Böylece tatillerde
ve hafta sonlarında kayan ödeme tarihlerini elle takip etmek zorunda kalmazsın.

## Nasıl çalışır?

```
Son ödeme tarihi = Hesap kesim tarihi + 10 gün
   └─ hafta sonu / resmî tatile denk gelirse → sonraki iş günü
```

- **10 gün** varsayılandır (`kartlar.json` içindeki `varsayilan_odeme_gun_farki`).
  Bir bankan farklıysa o karta `odeme_gun_farki` yazıp değiştirebilirsin.
- Resmî tatiller `tatiller.json` dosyasında tutulur (2026–2027 dolu). Dinî bayram
  tarihleri tahminidir; Diyanet takvimiyle doğrulayıp gerekirse düzelt.

## Kurulum: kartlarını ekle

`kartlar.json` dosyasını aç ve kendi kartlarınla doldur:

```json
{
  "varsayilan_odeme_gun_farki": 10,
  "kartlar": [
    { "id": "garanti-bonus", "ad": "Bonus", "banka": "Garanti", "kesim_gunu": 15 },
    { "id": "yapikredi-world", "ad": "World", "banka": "Yapı Kredi", "kesim_gunu": 26, "odeme_gun_farki": 10 }
  ]
}
```

| Alan | Açıklama |
|------|----------|
| `ad` | Kart adı (takvimde ve tabloda görünür) |
| `banka` | Banka adı |
| `kesim_gunu` | Hesap kesim tarihi — ayın kaçı (1–31). Ay kısa ise otomatik son güne çekilir. |
| `odeme_gun_farki` | Kesimden kaç gün sonra son ödeme (opsiyonel; yoksa varsayılan 10) |

Sonra motoru çalıştır (ek paket gerekmez):

```bash
python3 takip.py
```

Bu; `odemeler.json`, `odemeler.ics` dosyalarını üretir ve aşağıdaki tabloyu günceller.

## Otomatik hatırlatma

`.github/workflows/hatirlatma.yml` her gün (TSİ 07:00) çalışır:

1. Son ödeme tarihlerini yeniden hesaplar, dosyaları ve aşağıdaki tabloyu günceller.
2. Önümüzdeki **3 gün** içinde ödemesi olan kart varsa **"⏰ Yaklaşan ödemeler"**
   başlıklı bir issue açar/günceller — telefonundaki GitHub uygulaması sana bildirim gönderir.
3. Telegram kuruluysa (aşağıya bak) aynı özeti Telegram'dan da gönderir.

## Telegram bildirimi (opsiyonel)

Her sabah yaklaşan ödemeler Telegram'dan da gelebilir. Token repoya **yazılmaz**,
GitHub Secret olarak saklanır. Kurulum:

1. **Bot token'ı** al: Telegram'da [@BotFather](https://t.me/BotFather) → `/newbot`.
2. **chat_id'yi** öğren: botunla bir mesajlaşma başlat, sonra tarayıcıdan
   `https://api.telegram.org/bot<TOKEN>/getUpdates` aç → `chat` → `id` değerini kopyala.
3. Repoda **Settings → Secrets and variables → Actions → New repository secret** ile iki secret ekle:
   - `TELEGRAM_BOT_TOKEN` = bot token'ın
   - `TELEGRAM_CHAT_ID` = chat id'in
4. Bitti. Secret'lar tanımlı değilse bu adım sessizce atlanır; sistem yine çalışır.

> Not: Sunucu (Railway vb.) gerekmez — mesajı GitHub Actions gönderir.

## Takvime ekleme (.ics)

`odemeler.ics` dosyasını indirip telefonunun/bilgisayarının takvimine içe aktarabilirsin;
her ödeme, 2 gün önce ve ödeme günü sabahı hatırlatmayla takvimine düşer.

> Not: Canlı **abonelik** (URL ile otomatik güncellenen takvim) için reponun herkese açık
> olması ya da GitHub Pages gerekir. Repo gizliyse en pratik yol, yukarıdaki **otomatik
> hatırlatma issue'sudur**; `.ics` dosyasını ise ara sıra indirip içe aktarabilirsin.

## Yaklaşan Ödemeler

<!-- ODEMELER:BASLANGIC -->
_Son güncelleme: 6 Temmuz 2026 Pazartesi_

| Kart | Banka | Kesim tarihi | Son ödeme tarihi | Kalan | Not |
|------|-------|--------------|------------------|:-----:|-----|
| **ÖRNEK KART 1** | Banka Adı | 15 Temmuz 2026 Çarşamba | **27 Temmuz 2026 Pazartesi** | 21 gün | ↪️ 25 Temmuz: hafta sonu (Cumartesi); 26 Temmuz: hafta sonu (Pazar) |
| **ÖRNEK KART 2** | Banka Adı | 26 Temmuz 2026 Pazar | **5 Ağustos 2026 Çarşamba** | 30 gün | — |
| **ÖRNEK KART 1** | Banka Adı | 15 Ağustos 2026 Cumartesi | **25 Ağustos 2026 Salı** | 50 gün | — |
| **ÖRNEK KART 2** | Banka Adı | 26 Ağustos 2026 Çarşamba | **7 Eylül 2026 Pazartesi** | 63 gün | ↪️ 5 Eylül: hafta sonu (Cumartesi); 6 Eylül: hafta sonu (Pazar) |
<!-- ODEMELER:BITIS -->
