#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Yaklaşan ödemeler için GitHub issue gövdesi üretir.

odemeler.json okur; PENCERE_GUN (varsayılan 3) gün içinde son ödemesi olan
kartları 'issue_govde.md' dosyasına yazar. Yaklaşan ödeme varsa çıktı olarak
'VAR', yoksa 'YOK' yazdırır (workflow bu değere göre issue açar/kapatır).
"""
import datetime as dt
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))
PENCERE_GUN = int(os.environ.get("PENCERE_GUN", "3"))

TR_AY = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
         "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"]
TR_GUN = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]


def tr_tarih(d):
    return f"{d.day} {TR_AY[d.month]} {d.year} {TR_GUN[d.weekday()]}"


def main():
    with open(os.path.join(BASE, "odemeler.json"), encoding="utf-8") as f:
        data = json.load(f)

    yaklasan = [o for o in data["odemeler"] if 0 <= o["kalan_gun"] <= PENCERE_GUN]

    govde = ["Önümüzdeki %d gün içinde son ödeme tarihi olan kartlar:" % PENCERE_GUN, ""]
    if yaklasan:
        govde.append("| Kart | Banka | Son ödeme | Kalan |")
        govde.append("|------|-------|-----------|:-----:|")
        for o in yaklasan:
            d = dt.date.fromisoformat(o["son_odeme_tarihi"])
            kalan = o["kalan_gun"]
            kalan_str = "🔴 BUGÜN" if kalan == 0 else ("🟠 Yarın" if kalan == 1 else f"{kalan} gün")
            not_str = ""
            if o.get("kaydirildi"):
                not_str = f" _(tatil/hafta sonu nedeniyle kaydı: {o['kaydirma_nedeni']})_"
            govde.append(f"| **{o['kart']}** | {o['banka']} | **{tr_tarih(d)}** | {kalan_str} |{not_str}")
    govde.append("")
    govde.append("_Bu issue her gün otomatik güncellenir. Ödemeyi yaptıysan kapatabilirsin._")

    with open(os.path.join(BASE, "issue_govde.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(govde))

    # Telegram için düz metin mesajı (tablo yerine liste)
    tg = ["⏰ Yaklaşan kredi kartı ödemeleri", ""]
    for o in yaklasan:
        d = dt.date.fromisoformat(o["son_odeme_tarihi"])
        kalan = o["kalan_gun"]
        kalan_str = "BUGÜN son gün!" if kalan == 0 else ("yarın" if kalan == 1 else f"{kalan} gün kaldı")
        tg.append(f"💳 {o['kart']} ({o['banka']})")
        tg.append(f"   Son ödeme: {tr_tarih(d)} — {kalan_str}")
        if o.get("kaydirildi"):
            tg.append(f"   ↪️ Tatil/hafta sonu nedeniyle bu güne kaydı")
        tg.append("")
    with open(os.path.join(BASE, "telegram_mesaj.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(tg).strip() + "\n")

    print("VAR" if yaklasan else "YOK")


if __name__ == "__main__":
    main()
