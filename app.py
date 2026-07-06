#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kredi kartı son ödeme takibi — mobil uyumlu web arayüzü (Railway için).

Ödemeleri istek anında (İstanbul saatiyle) canlı hesaplar. Sunucu tarafında
HTML üretir; harici bağımlılık yalnızca Flask + gunicorn.

Rotalar:
  /              -> mobil uyumlu ödeme listesi
  /odemeler.ics  -> takvim dosyası
  /api/odemeler  -> JSON
  /saglik        -> sağlık kontrolü
"""
import datetime as dt
import os

from flask import Flask, Response, jsonify

import takip

try:
    from zoneinfo import ZoneInfo
    ISTANBUL = ZoneInfo("Europe/Istanbul")
except Exception:  # zoneinfo/tzdata yoksa sabit UTC+3
    ISTANBUL = dt.timezone(dt.timedelta(hours=3))

app = Flask(__name__)

UFUK_GUN = 60  # web'de gösterilecek ileri pencere (gün)


def bugun_istanbul():
    return dt.datetime.now(ISTANBUL).date()


def odemeleri_al(pencere=UFUK_GUN):
    bugun = bugun_istanbul()
    kartlar = takip._load("kartlar.json")
    tatiller = takip.tatilleri_yukle()
    hepsi = takip.odemeleri_hesapla(kartlar, tatiller, bugun=bugun)
    return bugun, [o for o in hepsi if o["kalan_gun"] <= pencere]


# --------------------------------------------------------------------------- #
# Görünüm
# --------------------------------------------------------------------------- #
def _renk(kalan):
    if kalan <= 0:
        return "#ef4444"
    if kalan == 1:
        return "#f97316"
    if kalan <= 3:
        return "#f59e0b"
    if kalan <= 7:
        return "#eab308"
    return "#22c55e"


def _kalan_etiket(kalan):
    if kalan <= 0:
        return "BUGÜN"
    if kalan == 1:
        return "Yarın"
    return f"{kalan} gün"


def kart_html(o):
    d = dt.date.fromisoformat(o["son_odeme_tarihi"])
    renk = _renk(o["kalan_gun"])
    etiket = _kalan_etiket(o["kalan_gun"])
    tarih = takip.tr_tarih(d)
    notlar = []
    if o.get("kaydirildi"):
        notlar.append("↪️ Tatil/hafta sonu nedeniyle kaydı")
    if o.get("aciklama"):
        notlar.append("ℹ️ " + o["aciklama"])
    not_html = ""
    if notlar:
        not_html = "<div class='not'>" + "<br>".join(_kacis(n) for n in notlar) + "</div>"

    return f"""
    <div class="kart" style="border-left-color:{renk}">
      <div class="ust">
        <div class="ad">{_kacis(o['kart'])}</div>
        <div class="pill" style="background:{renk}">{etiket}</div>
      </div>
      <div class="banka">{_kacis(o['banka'])}</div>
      <div class="tarih">{_kacis(tarih)}</div>
      {not_html}
    </div>"""


def _kacis(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def sayfa_html():
    bugun, odemeler = odemeleri_al()
    ilk = odemeler[0] if odemeler else None

    kartlar_html = "".join(kart_html(o) for o in odemeler) or \
        "<div class='bos'>Yaklaşan ödeme yok 🎉</div>"

    ozet = ""
    if ilk:
        d = dt.date.fromisoformat(ilk["son_odeme_tarihi"])
        ozet = f"""
        <div class="ozet" style="border-color:{_renk(ilk['kalan_gun'])}">
          <div class="ozet-baslik">Sıradaki ödeme</div>
          <div class="ozet-ad">{_kacis(ilk['kart'])} <span>· {_kacis(ilk['banka'])}</span></div>
          <div class="ozet-tarih">{_kacis(takip.tr_tarih(d))}</div>
          <div class="ozet-kalan" style="color:{_renk(ilk['kalan_gun'])}">{_kalan_etiket(ilk['kalan_gun'])}</div>
        </div>"""

    return f"""<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0b0f19">
<title>Kredi Kartı Ödemeleri</title>
<style>
  * {{ box-sizing: border-box; -webkit-tap-highlight-color: transparent; }}
  body {{
    margin: 0; background: #0b0f19; color: #e5e7eb;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  }}
  .wrap {{ max-width: 480px; margin: 0 auto; padding: 20px 16px 40px; }}
  header {{ display:flex; align-items:baseline; justify-content:space-between; margin-bottom:16px; }}
  h1 {{ font-size: 20px; margin: 0; }}
  .tarih-bugun {{ font-size: 12px; color: #9ca3af; }}
  .ozet {{
    background:#111827; border:1px solid; border-radius:16px; padding:16px; margin-bottom:20px;
  }}
  .ozet-baslik {{ font-size:12px; text-transform:uppercase; letter-spacing:.05em; color:#9ca3af; }}
  .ozet-ad {{ font-size:20px; font-weight:700; margin-top:4px; }}
  .ozet-ad span {{ font-weight:400; color:#9ca3af; font-size:15px; }}
  .ozet-tarih {{ font-size:15px; margin-top:6px; color:#d1d5db; }}
  .ozet-kalan {{ font-size:28px; font-weight:800; margin-top:8px; }}
  .kart {{
    background:#111827; border-left:5px solid; border-radius:12px;
    padding:12px 14px; margin-bottom:10px;
  }}
  .ust {{ display:flex; align-items:center; justify-content:space-between; gap:10px; }}
  .ad {{ font-weight:700; font-size:16px; }}
  .pill {{ color:#0b0f19; font-weight:800; font-size:12px; padding:3px 10px; border-radius:999px; white-space:nowrap; }}
  .banka {{ color:#9ca3af; font-size:13px; margin-top:2px; }}
  .tarih {{ margin-top:6px; font-size:15px; }}
  .not {{ margin-top:6px; font-size:12px; color:#9ca3af; line-height:1.5; }}
  .bos {{ text-align:center; padding:40px 0; color:#9ca3af; }}
  footer {{ margin-top:24px; text-align:center; font-size:12px; color:#6b7280; line-height:1.8; }}
  footer a {{ color:#60a5fa; text-decoration:none; }}
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>💳 Kart Ödemeleri</h1>
      <div class="tarih-bugun">{_kacis(takip.tr_tarih(bugun))}</div>
    </header>
    {ozet}
    <div class="liste">{kartlar_html}</div>
    <footer>
      Son ödeme günü hafta sonu/resmî tatile denk gelirse sonraki iş gününe kayar.<br>
      <a href="/odemeler.ics">📅 Takvime ekle (.ics)</a>
    </footer>
  </div>
</body>
</html>"""


# --------------------------------------------------------------------------- #
# Rotalar
# --------------------------------------------------------------------------- #
@app.route("/")
def index():
    return Response(sayfa_html(), mimetype="text/html")


@app.route("/api/odemeler")
def api_odemeler():
    bugun, odemeler = odemeleri_al(pencere=400)
    return jsonify({"guncelleme": bugun.isoformat(), "odemeler": odemeler})


@app.route("/odemeler.ics")
def ics():
    _, odemeler = odemeleri_al(pencere=400)
    return Response(takip.ics_uret(odemeler),
                    mimetype="text/calendar",
                    headers={"Content-Disposition": "attachment; filename=odemeler.ics"})


@app.route("/saglik")
def saglik():
    return {"durum": "ok"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port)
