// Bundle güvenlik denetimi — ADR-002 Karar 3, R93.7; web için ADR-013.
//
// ADR "production bundle'da PlainSqliteProvider sembolü kalırsa CI testi
// başarısız olur" der. Bu script tam olarak onu yapar: `npm run bundle:check`
// (ios) / `npm run bundle:check:web` (web) ile üretilen JS bundle'ında
// şifresiz veritabanı yoluna ait HİÇBİR iz olmamalı; buna karşılık şifreli
// yolun izleri BULUNMALI (test boş koşmasın).
//
//   node scripts/check-bundle.mjs [ios|web]      (varsayılan: ios)
//
// İki platform iki ayrı veritabanı motoru taşır ve birbirine SIZMAMALIDIR:
//   ios → expo-sqlite + SQLCipher; sql.js/EncryptedImageStore bundle'a giremez.
//   web → sql.js + AES-GCM görüntü; expo-sqlite/SQLCipher izi web'de SQLCipher
//         varmış gibi göstermek olur (R93.4 dürüstlük) ve giremez.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const PLATFORMS = {
  ios: {
    dir: '.expo/export-check/_expo/static/js/ios',
    forbidden: [
      'node:sqlite',            // Node'a özgü sürücü
      'NodeSqliteProvider',     // şifresiz sağlayıcı
      'nodeSqliteDriver',
      '@journeyapps/sqlcipher', // yalnızca test sürücüsü
      'node:crypto',            // Node'a özgü hash
      'node:fs',
      'sqlJsDriver',            // web motoru yerel bundle'a giremez (ADR-013)
      'EncryptedImageStore',
      'sql-wasm',
    ],
    required: [
      'expo-sqlite',                      // production sürücüsü
      'PRAGMA key',                       // şifreleme gerçekten uygulanıyor
      'v90.dbkey',                        // anahtar kimliği
      'WHEN_UNLOCKED_THIS_DEVICE_ONLY',   // Keychain erişilebilirlik sınıfı
    ],
  },
  web: {
    dir: '.expo/export-check-web/_expo/static/js/web',
    // NOT: "node:fs" / "node:crypto" web listesinde YOK. sql.js'in varsayılan
    // Emscripten yapıştırıcısı (dist/sql-wasm.js) bu adları Node dalında string
    // olarak taşır; Metro (metro.config.cjs) onları web'de boş modüle bağlar,
    // dal tarayıcıda hiç çalışmaz. ("browser" koşuluyla seçilen
    // dist/sql-wasm-browser.js'te hiç yoktur.) Yerel sağlayıcının izleri ise
    // gerçek sızıntıdır.
    // "PRAGMA key" de listede YOK: ortak SqliteDatabaseProvider o metni taşır
    // ama yalnızca keyManager verildiğinde gönderir; web sağlayıcısı anahtarsız
    // kurulur (SqlJsProvider). Yerel anahtar deposunun izi ise gerçek sızıntıdır.
    forbidden: [
      'NodeSqliteProvider',             // şifresiz sağlayıcı
      'nodeSqliteDriver',
      '@journeyapps/sqlcipher',         // yalnızca test sürücüsü
      'expo-sqlite',                    // yerel motor; web'de SQLCipher yoktur
      'expoSqliteDriver',
      'WHEN_UNLOCKED_THIS_DEVICE_ONLY', // Keychain sınıfı: yerel anahtar deposu
      'ExpoSecureStore',
    ],
    // İzler KOD olmalı, yorum değil (yorumlar ayıklanır): sql.js API çağrısı,
    // sürücü adı, WebCrypto algoritma adı, anahtar kimliği ve görüntü sihirli sayısı.
    required: [
      'getRowsModified', // sql.js API'si: sürücü gerçekten sql.js'e bağlı
      'sqlJsDriver',
      'AES-GCM',         // görüntü şifrelemesi gerçekten uygulanıyor
      'v90.web.dbkey',   // çıkarılamaz CryptoKey'in IndexedDB kimliği
      'V90E',            // şifreli görüntü sihirli sayısı (EncryptedImageStore)
    ],
  },
};

const platform = process.argv[2] ?? 'ios';
const spec = PLATFORMS[platform];
if (!spec) {
  console.error(`HATA: bilinmeyen platform "${platform}" — ios ya da web.`);
  process.exit(1);
}
const { dir: DIR, forbidden: FORBIDDEN, required: REQUIRED } = spec;
const exportCmd = platform === 'web' ? 'npm run bundle:check:web' : 'npm run bundle:check';

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`HATA: ${DIR} yok — önce \`${exportCmd}\` çalıştır.`);
  process.exit(1);
}
if (files.length === 0) {
  console.error(`HATA: ${DIR} içinde bundle bulunamadı.`);
  process.exit(1);
}

/**
 * Yorumlar çıkarılır: yorumdaki bir sembol ÇALIŞMAZ, bu yüzden sızıntı
 * sayılmaz. (Örn. platform/hash.ts içindeki "`node:crypto` RN'de yoktur"
 * açıklaması.) Bundle `--no-minify` üretilir ki tanımlayıcı adları korunsun;
 * minify edilmiş bir bundle'da `NodeSqliteProvider` kısaltılır ve denetim
 * yanlışlıkla temiz görünürdü.
 *
 * Ayıklama tam bir JS ayrıştırıcı değildir. Bir string içindeki ` //` dizisi
 * satırın kalanını yanlışlıkla kesebilir; bu, o satırın kalanındaki bir izi
 * GİZLER (yasak listesini gevşetir, gerekli listesini sıkılaştırır). Bundle
 * `--no-minify` olduğu için bizim modüllerimiz kısa satırlardır ve risk
 * yalnızca üçüncü taraf tek-satır yapıştırıcılarda (sql.js) kalır — orada da
 * aranan yerel semboller zaten bulunmaz. Gerekli izler bu yüzden kendi
 * modüllerimizdeki kısa satırlardan seçilir.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n')
  .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
  .join('\n');

const bundle = stripComments(files.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n'));
const bytes = files.reduce((n, f) => n + statSync(join(DIR, f)).size, 0);

const leaked = FORBIDDEN.filter((s) => bundle.includes(s));
const missing = REQUIRED.filter((s) => !bundle.includes(s));

if (leaked.length) {
  console.error(`BUNDLE DENETİMİ BAŞARISIZ (${platform}) — şifresiz/yabancı motor yolu bundle'a sızmış (R93.7):`);
  for (const s of leaked) console.error(`  • ${s}`);
}
if (missing.length) {
  console.error(`BUNDLE DENETİMİ BAŞARISIZ (${platform}) — şifreli yolun izleri yok (denetim boş koşuyor):`);
  for (const s of missing) console.error(`  • ${s}`);
}
if (leaked.length || missing.length) process.exit(1);

console.log(`bundle temiz (${platform}): ${(bytes / 1024 / 1024).toFixed(1)} MB · `
  + `${FORBIDDEN.length} yasak sembolün hiçbiri yok, ${REQUIRED.length} beklenen iz var`);
