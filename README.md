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

## Mobil web arayüzü (Railway)

Telefondan açıp güncel durumu görebileceğin mobil uyumlu bir sayfa (`app.py`).
Ödemeleri istek anında İstanbul saatiyle canlı hesaplar.

**Railway'e deploy (tek seferlik, ~2 dk):**

1. [railway.app](https://railway.app) → GitHub ile giriş yap.
2. **New Project → Deploy from GitHub repo → `kredi-karti-takip`** seç.
3. Railway `requirements.txt` + `Procfile`'ı otomatik tanır, kurar ve başlatır.
4. Servise **Settings → Networking → Generate Domain** ile bir adres ver.
5. Çıkan adresi telefonda aç; "Ana ekrana ekle" dersen uygulama gibi durur.

Rotalar: `/` (mobil liste), `/odemeler.ics` (takvim), `/api/odemeler` (JSON).

> Yerelde denemek için: `pip install -r requirements.txt && python3 app.py` → http://localhost:8000

## Takvime ekleme (.ics)

`odemeler.ics` dosyasını indirip telefonunun/bilgisayarının takvimine içe aktarabilirsin;
her ödeme, 2 gün önce ve ödeme günü sabahı hatırlatmayla takvimine düşer.

> Not: Canlı **abonelik** (URL ile otomatik güncellenen takvim) için reponun herkese açık
> olması ya da GitHub Pages gerekir. Repo gizliyse en pratik yol, yukarıdaki **otomatik
> hatırlatma issue'sudur**; `.ics` dosyasını ise ara sıra indirip içe aktarabilirsin.

## Yaklaşan Ödemeler

<!-- ODEMELER:BASLANGIC -->
_Son güncelleme: 20 Temmuz 2026 Pazartesi_

| Kart | Banka | Kesim tarihi | Son ödeme tarihi | Kalan | Not |
|------|-------|--------------|------------------|:-----:|-----|
| **Troy** | İş Bankası | 8 Temmuz 2026 Çarşamba | **20 Temmuz 2026 Pazartesi** | 🔴 Bugün | ↪️ 18 Temmuz: hafta sonu (Cumartesi); 19 Temmuz: hafta sonu (Pazar) |
| **Enpara** | Enpara (QNB) | 12 Temmuz 2026 Pazar | **22 Temmuz 2026 Çarşamba** | 2 gün | — |
| **Business** | İş Bankası | 23 Temmuz 2026 Perşembe | **28 Temmuz 2026 Salı** | 8 gün | — |
| **Wings Business** | Akbank | 27 Temmuz 2026 Pazartesi | **3 Ağustos 2026 Pazartesi** | 14 gün | ↪️ 1 Ağustos: hafta sonu (Cumartesi); 2 Ağustos: hafta sonu (Pazar) · ℹ️ Akbank kesim tarihini kaydırıyor; son ödeme ayın 1'i baz alınır (hafta sonu/tatilde sonraki iş günü). Ara sıra uygulamadan doğrula. |
| **World** | Yapı Kredi | 22 Temmuz 2026 Çarşamba | **3 Ağustos 2026 Pazartesi** | 14 gün | ↪️ 1 Ağustos: hafta sonu (Cumartesi); 2 Ağustos: hafta sonu (Pazar) |
| **Paraf** | Halkbank | 30 Temmuz 2026 Perşembe | **4 Ağustos 2026 Salı** | 15 gün | — |
| **Axess Platinum** | Akbank | 26 Temmuz 2026 Pazar | **5 Ağustos 2026 Çarşamba** | 16 gün | — |
| **Bonus Business** | Garanti BBVA | 7 Ağustos 2026 Cuma | **12 Ağustos 2026 Çarşamba** | 23 gün | — |
| **Fix** | QNB | 2 Ağustos 2026 Pazar | **12 Ağustos 2026 Çarşamba** | 23 gün | — |
| **GO** | QNB | 3 Ağustos 2026 Pazartesi | **13 Ağustos 2026 Perşembe** | 24 gün | — |
| **Bonus Dijital** | Garanti BBVA | 6 Ağustos 2026 Perşembe | **17 Ağustos 2026 Pazartesi** | 28 gün | ↪️ 16 Ağustos: hafta sonu (Pazar) |
| **Gold** | DenizBank | 7 Ağustos 2026 Cuma | **17 Ağustos 2026 Pazartesi** | 28 gün | — |
| **Troy** | İş Bankası | 8 Ağustos 2026 Cumartesi | **18 Ağustos 2026 Salı** | 29 gün | — |
| **Enpara** | Enpara (QNB) | 12 Ağustos 2026 Çarşamba | **24 Ağustos 2026 Pazartesi** | 35 gün | ↪️ 22 Ağustos: hafta sonu (Cumartesi); 23 Ağustos: hafta sonu (Pazar) |
| **Business** | İş Bankası | 23 Ağustos 2026 Pazar | **28 Ağustos 2026 Cuma** | 39 gün | — |
| **Wings Business** | Akbank | 27 Ağustos 2026 Perşembe | **1 Eylül 2026 Salı** | 43 gün | ℹ️ Akbank kesim tarihini kaydırıyor; son ödeme ayın 1'i baz alınır (hafta sonu/tatilde sonraki iş günü). Ara sıra uygulamadan doğrula. |
| **World** | Yapı Kredi | 22 Ağustos 2026 Cumartesi | **1 Eylül 2026 Salı** | 43 gün | — |
| **Paraf** | Halkbank | 30 Ağustos 2026 Pazar | **4 Eylül 2026 Cuma** | 46 gün | — |
| **Axess Platinum** | Akbank | 26 Ağustos 2026 Çarşamba | **7 Eylül 2026 Pazartesi** | 49 gün | ↪️ 5 Eylül: hafta sonu (Cumartesi); 6 Eylül: hafta sonu (Pazar) |
| **Bonus Business** | Garanti BBVA | 7 Eylül 2026 Pazartesi | **14 Eylül 2026 Pazartesi** | 56 gün | ↪️ 12 Eylül: hafta sonu (Cumartesi); 13 Eylül: hafta sonu (Pazar) |
| **Fix** | QNB | 2 Eylül 2026 Çarşamba | **14 Eylül 2026 Pazartesi** | 56 gün | ↪️ 12 Eylül: hafta sonu (Cumartesi); 13 Eylül: hafta sonu (Pazar) |
| **GO** | QNB | 3 Eylül 2026 Perşembe | **14 Eylül 2026 Pazartesi** | 56 gün | ↪️ 13 Eylül: hafta sonu (Pazar) |
| **Bonus Dijital** | Garanti BBVA | 6 Eylül 2026 Pazar | **16 Eylül 2026 Çarşamba** | 58 gün | — |
| **Gold** | DenizBank | 7 Eylül 2026 Pazartesi | **17 Eylül 2026 Perşembe** | 59 gün | — |
| **Troy** | İş Bankası | 8 Eylül 2026 Salı | **18 Eylül 2026 Cuma** | 60 gün | — |
| **Enpara** | Enpara (QNB) | 12 Eylül 2026 Cumartesi | **22 Eylül 2026 Salı** | 64 gün | — |
| **Business** | İş Bankası | 23 Eylül 2026 Çarşamba | **28 Eylül 2026 Pazartesi** | 70 gün | — |
| **Wings Business** | Akbank | 26 Eylül 2026 Cumartesi | **1 Ekim 2026 Perşembe** | 73 gün | ℹ️ Akbank kesim tarihini kaydırıyor; son ödeme ayın 1'i baz alınır (hafta sonu/tatilde sonraki iş günü). Ara sıra uygulamadan doğrula. |
| **World** | Yapı Kredi | 22 Eylül 2026 Salı | **2 Ekim 2026 Cuma** | 74 gün | — |
<!-- ODEMELER:BITIS -->
