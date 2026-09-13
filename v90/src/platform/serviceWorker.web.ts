// Çevrimdışı kabuk — WEB: export sonrası üretilen sw.js kaydı
// (02 §2.2 offline garantisi, AT-18). Yerel karşılığı serviceWorker.ts (iş yok).
//
// Kayıt başarısızlığı uygulamayı DÜŞÜRMEZ: çevrimiçi kullanım aynen sürer,
// yalnızca sonraki çevrimdışı açılış garantisi yoktur. Geliştirmede kayıt
// yapılmaz (önbellek, Metro'nun sıcak yenilemesiyle çakışır).
export function registerServiceWorker(): void {
  try {
    if (__DEV__) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    // GitHub Pages alt yolu: sw.js ve kapsamı base altında (db.web.ts ile aynı kaynak).
    const base = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');
    navigator.serviceWorker.register(`${base}/sw.js`).catch(() => { /* çevrimdışı kabuk yok */ });
  } catch { /* asla fırlatmaz */ }
}
