#!/usr/bin/env node
// Web export sonrası işlemler — docs/v90/02-architecture.md §12.2, ADR-013.
//
//   node scripts/web-postexport.mjs dist-web
//
// `expo export --platform web` tek sayfa (SPA) çıktı üretir; GitHub Pages'te
// çalışması ve çevrimdışı açılması (02 §2.2, AT-18) için dört ek gerekir:
//   (a) 404.html = index.html      → derin bağlantılar Pages'te SPA'ya düşer
//   (b) manifest.webmanifest       → ana ekrana ekle (standalone)
//   (c) index.html <head> ekleri   → manifest, theme-color, apple-touch-icon
//   (d) sw.js                      → dist'teki HER dosyayı önbelleğe alan service worker
//
// sw.js güncelleme politikası (06 B.20, ADR-013 Karar 7):
//   • Precache istekleri HTTP önbelleğini ATLAR (`cache: 'reload'`). GitHub Pages
//     `Cache-Control: max-age=600` gönderir; 10 dakika içinde ikinci bir dağıtımda
//     tarayıcı önbelleğinden gelen ESKİ index.html, artık var olmayan hash'li
//     bundle'lara işaret eder ve uygulama bir sonraki SW güncellemesine kadar
//     açılamazdı.
//   • `skipWaiting` / `clients.claim` YOKTUR. Yeni sürüm, uygulamanın açık olduğu
//     tüm sekmeler kapanınca etkinleşir (ikinci açılış); eski önbellek ancak o
//     zaman silinir. Aksi hâlde açık eski kabuk, tembel yüklenen parçalarını
//     (ImagePicker / LocalAuthentication / ScreenCapture chunk'ları) yenileme
//     yapana kadar kaybederdi.
//
// Alt yol: V90_WEB_BASE_URL (örn. /kredi-karti-takip). app.config.ts aynı
// değişkeni experiments.baseUrl'a yazar; iki taraf aynı kökü kullanmalıdır.
// Sıfır bağımlılık, Node 22 ESM.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const dist = process.argv[2];
if (!dist) {
  console.error('kullanım: node scripts/web-postexport.mjs <dist-dizini>');
  process.exit(1);
}
const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`HATA: ${indexPath} yok — önce \`expo export --platform web\` çalıştır.`);
  process.exit(1);
}

const base = (process.env.V90_WEB_BASE_URL ?? '').replace(/\/$/, '');
const THEME = '#0f172a';

// ── (a) SPA yedeği: GitHub Pages bilinmeyen yolda 404.html sunar.
copyFileSync(indexPath, join(dist, '404.html'));

// ── (b) Manifest. Simgeler public/icons/ altından export çıktısına gelir.
const manifest = {
  name: 'V90',
  short_name: 'V90',
  start_url: `${base}/`,
  scope: `${base}/`,
  display: 'standalone',
  lang: 'tr',
  background_color: THEME,
  theme_color: THEME,
  icons: [192, 512].map((px) => ({
    src: `${base}/icons/icon-${px}.png`,
    sizes: `${px}x${px}`,
    type: 'image/png',
  })),
};
writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');

// ── (c) <head> ekleri — yalnızca yoksa (export bir gün kendisi yazarsa çiftlenmesin).
const HEAD_TAGS = [
  ['rel="manifest"', `<link rel="manifest" href="${base}/manifest.webmanifest">`],
  ['name="theme-color"', `<meta name="theme-color" content="${THEME}">`],
  ['rel="apple-touch-icon"', `<link rel="apple-touch-icon" href="${base}/icons/icon-192.png">`],
  ['name="apple-mobile-web-app-capable"', '<meta name="apple-mobile-web-app-capable" content="yes">'],
];
let html = readFileSync(indexPath, 'utf8');
const inject = HEAD_TAGS.filter(([marker]) => !html.includes(marker)).map(([, tag]) => tag);
if (inject.length) {
  if (!html.includes('</head>')) {
    console.error('HATA: index.html içinde </head> yok; head ekleri yazılamadı.');
    process.exit(1);
  }
  html = html.replace('</head>', `${inject.join('\n')}\n</head>`);
  writeFileSync(indexPath, html);
  // 404.html de aynı head'i taşısın (derin bağlantıdan açılışta da manifest görünsün).
  writeFileSync(join(dist, '404.html'), html);
}

// ── (d) Service worker: dist'teki her dosya için önbellek-öncelikli precache.
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  return e.isDirectory() ? walk(p) : [p];
});
const files = walk(dist)
  .filter((p) => relative(dist, p) !== 'sw.js')            // kendini önbelleğe almaz
  .map((p) => ({ rel: relative(dist, p).split(sep).join('/'), size: statSync(p).size }))
  .sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

// Önbellek adı içerik listesinden türer: liste ya da boyut değişince yeni ad,
// activate aşamasında eski v90-* önbellekleri silinir.
const digest = createHash('sha256')
  .update(files.map((f) => `${f.rel}:${f.size}`).join('\n'))
  .digest('hex')
  .slice(0, 12);
const CACHE = `v90-${digest}`;

const urls = files.map((f) => `${base}/${f.rel}`);
const shell = `${base}/`;                                   // index.html'in gezinti adresi
if (!urls.includes(shell)) urls.push(shell);

const sw = `// V90 service worker — scripts/web-postexport.mjs tarafından üretildi (ADR-013).
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
const CACHE = ${JSON.stringify(CACHE)};
const SHELL = ${JSON.stringify(shell)};
const PRECACHE = ${JSON.stringify(urls, null, 2)};

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
`;
writeFileSync(join(dist, 'sw.js'), sw);

console.log(`web-postexport: base="${base || '/'}" · 404.html + manifest.webmanifest + sw.js (${CACHE}, ${urls.length} URL)`);
