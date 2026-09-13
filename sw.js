// V90 service worker — scripts/web-postexport.mjs tarafından üretildi (ADR-013).
// Kabuk ve tüm export dosyaları önbellek-öncelikli sunulur; çevrimdışı açılış
// garantisi buradan gelir (02 §2.2). Çapraz kaynak (örn. YouTube küçük
// resimleri) ASLA önbelleğe alınmaz: uygulama verisi ve üçüncü taraf
// içerik ayrı kalır.
//
// Güncelleme politikası: yeni sürüm, açık sekmeler kapanınca etkinleşir
// (ikinci açılış). skipWaiting / clients.claim çağrılmaz; açık eski kabuk
// tembel parçalarını kaybetmez, eski önbellek ancak etkinleşince silinir.
// Precache istekleri HTTP önbelleğini atlar (cache: 'reload'): Pages'in
// 10 dakikalık max-age'i eski index.html'i kabuğa sokamaz.
const CACHE = "v90-9905be2f96f4";
const SHELL = "/kredi-karti-takip/";
const PRECACHE = [
  "/kredi-karti-takip/404.html",
  "/kredi-karti-takip/_expo/static/js/web/ImagePicker-3cfb731d8dbaafb1300283929fec5465.js",
  "/kredi-karti-takip/_expo/static/js/web/LocalAuthentication-6cad502655d80acea5942622b883ba34.js",
  "/kredi-karti-takip/_expo/static/js/web/ScreenCapture-a84ee658ce02113cd82c1f2ea0fc5cf8.js",
  "/kredi-karti-takip/_expo/static/js/web/entry-75add2416a8952d62d21cde8d1804f09.js",
  "/kredi-karti-takip/_expo/static/js/web/index-2ab46c5d376271954b73bd2e51c602af.js",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/arrow_down.017bc6ba3fc25503e5eb5e53826d48a8.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/error.d1ea1496f9057eb392d5bbf3732a61b7.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/file.19eeb73b9593a38f8e9f418337fc7d10.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/forward.d8b800c443b8972542883e0b9de2bdc6.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/pkg.ab19f4cbc543357183a20571f68380a3.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/back-icon-mask.0a328cd9c1afd0afe8e3b1ec5165b1b4.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/back-icon.35ba0eaec5a4f5ed12ca16fabeae451d.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55@2x.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55@3x.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55@4x.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7@2x.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7@3x.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7@4x.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/react-navigation/elements/search-icon.286d67d3f74808a60a78d3ebf1a5fb57.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/sitemap.412dd9275b6b48ad28f5e3d81bb1f626.png",
  "/kredi-karti-takip/assets/node_modules/expo-router/assets/unmatched.20e71bdf79e3a97bf55fd9e164041578.png",
  "/kredi-karti-takip/icons/icon-192.png",
  "/kredi-karti-takip/icons/icon-512.png",
  "/kredi-karti-takip/index.html",
  "/kredi-karti-takip/manifest.webmanifest",
  "/kredi-karti-takip/metadata.json",
  "/kredi-karti-takip/sql-wasm-browser.wasm",
  "/kredi-karti-takip/sql-wasm.wasm",
  "/kredi-karti-takip/"
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // cache.addAll değil: her istek HTTP önbelleğini atlayarak ağdan gelir.
      // Biri bile başarısız olursa Promise.all reddeder ve kurulum iptal olur.
      await Promise.all(PRECACHE.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    } catch (err) {
      // Tek bir dosya bile inmezse kurulum iptal: yarım kabuk, hiç kabuk olmamasından kötüdür.
      console.error('[v90 sw] precache başarısız:', err);
      throw err;
    }
  })());
});

self.addEventListener('activate', (event) => {
  // Tarayıcı varsayılanı: eski worker'ın denetlediği son sekme kapanınca
  // buraya gelinir; eski v90-* önbellekleri ancak o zaman silinir.
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((n) => n.startsWith('v90-') && n !== CACHE)
      .map((n) => caches.delete(n)));
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;         // çapraz kaynak: ağa bırak

  if (req.mode === 'navigate') {
    // SPA: her gezinti kabuğa (index.html) düşer; ağ yalnızca yedek.
    event.respondWith((async () => {
      const cached = await caches.match(SHELL);
      if (cached) return cached;
      return fetch(req);
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    return fetch(req);
  })());
});
