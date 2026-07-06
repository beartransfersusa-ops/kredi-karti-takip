#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kredi kartı son ödeme tarihi takip motoru.

kartlar.json + tatiller.json dosyalarını okur; her kart için hesap kesim
tarihinden yola çıkarak son ödeme tarihlerini hesaplar. Son ödeme günü hafta
sonuna ya da resmî tatile denk gelirse Türkiye banka uygulamasına göre bir
sonraki iş gününe kaydırır. Çıktı olarak:

  * odemeler.json  -> hesaplanan tüm ödemeler (makine tarafından okunabilir)
  * odemeler.ics   -> telefon/bilgisayar takvimine abone olunabilen dosya
  * README.md      -> "Yaklaşan Ödemeler" tablosu güncellenir

Sadece Python standart kütüphanesini kullanır; ek paket gerekmez.
"""

import calendar
import datetime as dt
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))

# Bugünü ortam değişkeninden alabiliriz (test için). Yoksa gerçek bugün.
TODAY = dt.date.fromisoformat(os.environ["TAKIP_BUGUN"]) if os.environ.get("TAKIP_BUGUN") else dt.date.today()

# Kaç aylık ileriye dönük ödeme üretilsin
UFUK_AY = 14
# README'de "yaklaşan" kabul edilecek gün penceresi
YAKLASAN_GUN = 75


# --------------------------------------------------------------------------- #
# Yardımcılar
# --------------------------------------------------------------------------- #
def _load(name):
    with open(os.path.join(BASE, name), encoding="utf-8") as f:
        return json.load(f)


def tatilleri_yukle():
    """tatiller.json -> {date: ad} sözlüğü."""
    data = _load("tatiller.json")
    tatiller = {}
    for t in data.get("tatiller", []):
        tatiller[dt.date.fromisoformat(t["tarih"])] = t.get("ad", "Resmî tatil")
    return tatiller


def is_gunu_mu(d, tatiller):
    return d.weekday() < 5 and d not in tatiller


def sonraki_is_gunu(d, tatiller):
    """d dahil, ilk iş gününü döndürür."""
    while not is_gunu_mu(d, tatiller):
        d += dt.timedelta(days=1)
    return d


def ay_ekle(yil, ay, n):
    toplam = (ay - 1) + n
    return yil + toplam // 12, toplam % 12 + 1


def ayin_gunu(yil, ay, gun):
    """Ayın gününü, o ayın son gününü aşmayacak şekilde kırpar (örn. Şubat 30 -> 28/29)."""
    son = calendar.monthrange(yil, ay)[1]
    return dt.date(yil, ay, min(gun, son))


TR_AY = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
         "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
TR_GUN = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]


def tr_tarih(d):
    return f"{d.day} {TR_AY[d.month]} {d.year} {TR_GUN[d.weekday()]}"


# --------------------------------------------------------------------------- #
# Hesaplama
# --------------------------------------------------------------------------- #
def odemeleri_hesapla(kartlar, tatiller):
    varsayilan_fark = kartlar.get("varsayilan_odeme_gun_farki", 10)
    sonuc = []

    for kart in kartlar["kartlar"]:
        kart_id = kart.get("id") or kart["ad"].lower().replace(" ", "-")
        fark = kart.get("odeme_gun_farki", varsayilan_fark)
        # İki mod:
        #  (a) kesim_gunu    -> son ödeme = kesim + fark  (çoğu banka)
        #  (b) son_odeme_gunu -> son ödeme = ayın o günü   (kesimi kayan kartlar, örn. Akbank Wings)
        son_odeme_gunu = kart.get("son_odeme_gunu")
        kesim_gunu = kart.get("kesim_gunu")
        aciklama = kart.get("aciklama", "")

        # İçinde bulunduğumuz aydan başlayarak ufuk kadar ay üret
        for i in range(UFUK_AY):
            yil, ay = ay_ekle(TODAY.year, TODAY.month, i)
            if son_odeme_gunu:
                nominal = ayin_gunu(yil, ay, son_odeme_gunu)
                kesim = nominal - dt.timedelta(days=fark)  # bilgi amaçlı yaklaşık kesim
            else:
                kesim = ayin_gunu(yil, ay, kesim_gunu)
                nominal = kesim + dt.timedelta(days=fark)
            gercek = sonraki_is_gunu(nominal, tatiller)
            kaydi = gercek != nominal

            # Geçmişte kalan ödemeleri atla (bugün dahil ileri)
            if gercek < TODAY:
                continue

            sonuc.append({
                "kart_id": kart_id,
                "kart": kart["ad"],
                "banka": kart.get("banka", ""),
                "kesim_tarihi": kesim.isoformat(),
                "nominal_son_odeme": nominal.isoformat(),
                "son_odeme_tarihi": gercek.isoformat(),
                "kaydirildi": kaydi,
                "kaydirma_nedeni": _kaydirma_nedeni(nominal, gercek, tatiller) if kaydi else "",
                "aciklama": aciklama,
                "kalan_gun": (gercek - TODAY).days,
            })

    sonuc.sort(key=lambda x: (x["son_odeme_tarihi"], x["kart"]))
    return sonuc


def _kaydirma_nedeni(nominal, gercek, tatiller):
    nedenler = []
    d = nominal
    while d < gercek:
        if d in tatiller:
            nedenler.append(f"{d.day} {TR_AY[d.month]}: {tatiller[d]}")
        elif d.weekday() >= 5:
            nedenler.append(f"{d.day} {TR_AY[d.month]}: hafta sonu ({TR_GUN[d.weekday()]})")
        d += dt.timedelta(days=1)
    return "; ".join(nedenler)


# --------------------------------------------------------------------------- #
# ICS (takvim) üretimi
# --------------------------------------------------------------------------- #
def ics_uret(odemeler):
    satirlar = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//kredi-karti-takip//TR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Kredi Kartı Son Ödeme",
        "X-WR-TIMEZONE:Europe/Istanbul",
    ]
    # Sabit DTSTAMP: her çalışmada dosya gereksiz yere değişmesin diye
    # ödemelerin en küçük tarihini damga olarak kullanmıyoruz; sabit bir değer.
    dtstamp = "20260101T000000Z"

    for o in odemeler:
        d = dt.date.fromisoformat(o["son_odeme_tarihi"])
        ertesi = d + dt.timedelta(days=1)
        ozet = f"💳 {o['kart']} son ödeme"
        aciklama = f"Kesim: {tr_tarih(dt.date.fromisoformat(o['kesim_tarihi']))}\\n"
        aciklama += f"Son ödeme: {tr_tarih(d)}"
        if o["kaydirildi"]:
            aciklama += f"\\n(Kaydırıldı — {o['kaydirma_nedeni']})"
        uid = f"{o['kart_id']}-{o['son_odeme_tarihi']}@kredi-karti-takip"

        satirlar += [
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{dtstamp}",
            f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{ertesi.strftime('%Y%m%d')}",
            f"SUMMARY:{ozet}",
            f"DESCRIPTION:{aciklama}",
            "TRANSP:TRANSPARENT",
            # 2 gün önce hatırlat
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{ozet} — 2 gün kaldı",
            "TRIGGER:-P2D",
            "END:VALARM",
            # Aynı gün sabah 09:00 hatırlat (etkinlik gece yarısı başlar)
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{ozet} — bugün son gün",
            "TRIGGER:PT9H",
            "END:VALARM",
            "END:VEVENT",
        ]

    satirlar.append("END:VCALENDAR")
    # ICS satırları CRLF ile biter
    return "\r\n".join(satirlar) + "\r\n"


# --------------------------------------------------------------------------- #
# README tablosu güncelleme
# --------------------------------------------------------------------------- #
BASLANGIC = "<!-- ODEMELER:BASLANGIC -->"
BITIS = "<!-- ODEMELER:BITIS -->"


def readme_tablo(odemeler):
    yaklasan = [o for o in odemeler if o["kalan_gun"] <= YAKLASAN_GUN]

    satir = [f"_Son güncelleme: {tr_tarih(TODAY)}_", ""]
    satir.append("| Kart | Banka | Kesim tarihi | Son ödeme tarihi | Kalan | Not |")
    satir.append("|------|-------|--------------|------------------|:-----:|-----|")
    if not yaklasan:
        satir.append("| _Kayıtlı kart yok — `kartlar.json` dosyasını doldurun_ | | | | | |")
    for o in yaklasan:
        kesim = tr_tarih(dt.date.fromisoformat(o["kesim_tarihi"]))
        odeme = tr_tarih(dt.date.fromisoformat(o["son_odeme_tarihi"]))
        kalan = o["kalan_gun"]
        kalan_str = "🔴 Bugün" if kalan == 0 else ("🟠 Yarın" if kalan == 1 else f"{kalan} gün")
        notlar = []
        if o["kaydirildi"]:
            notlar.append("↪️ " + o["kaydirma_nedeni"])
        if o.get("aciklama"):
            notlar.append("ℹ️ " + o["aciklama"])
        not_str = " · ".join(notlar) if notlar else "—"
        satir.append(f"| **{o['kart']}** | {o['banka']} | {kesim} | **{odeme}** | {kalan_str} | {not_str} |")

    return "\n".join(satir)


def readme_guncelle(odemeler):
    yol = os.path.join(BASE, "README.md")
    with open(yol, encoding="utf-8") as f:
        icerik = f.read()

    tablo = readme_tablo(odemeler)
    yeni = f"{BASLANGIC}\n{tablo}\n{BITIS}"

    if BASLANGIC in icerik and BITIS in icerik:
        once = icerik.split(BASLANGIC)[0]
        sonra = icerik.split(BITIS)[1]
        icerik = once + yeni + sonra
    else:
        icerik = icerik.rstrip() + "\n\n" + yeni + "\n"

    with open(yol, "w", encoding="utf-8") as f:
        f.write(icerik)


# --------------------------------------------------------------------------- #
# Ana
# --------------------------------------------------------------------------- #
def main():
    kartlar = _load("kartlar.json")
    tatiller = tatilleri_yukle()
    odemeler = odemeleri_hesapla(kartlar, tatiller)

    with open(os.path.join(BASE, "odemeler.json"), "w", encoding="utf-8") as f:
        json.dump({"guncelleme": TODAY.isoformat(), "odemeler": odemeler},
                  f, ensure_ascii=False, indent=2)

    with open(os.path.join(BASE, "odemeler.ics"), "w", encoding="utf-8", newline="") as f:
        f.write(ics_uret(odemeler))

    readme_guncelle(odemeler)

    print(f"{len(odemeler)} ödeme hesaplandı.")
    for o in odemeler[:8]:
        isaret = " (kaydırıldı)" if o["kaydirildi"] else ""
        print(f"  {o['son_odeme_tarihi']}  {o['kart']:<20} {o['kalan_gun']:>3} gün{isaret}")


if __name__ == "__main__":
    main()
