// Bundle güvenlik denetimi — ADR-002 Karar 3, R93.7.
//
// ADR "production bundle'da PlainSqliteProvider sembolü kalırsa CI testi
// başarısız olur" der. Bu script tam olarak onu yapar: `npm run bundle:check`
// ile üretilen JS bundle'ında şifresiz veritabanı yoluna ait HİÇBİR iz
// olmamalı; buna karşılık şifreli yolun izleri BULUNMALI (test boş koşmasın).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIR = '.expo/export-check/_expo/static/js/ios';

const FORBIDDEN = [
  'node:sqlite',            // Node'a özgü sürücü
  'NodeSqliteProvider',     // şifresiz sağlayıcı
  'nodeSqliteDriver',
  '@journeyapps/sqlcipher', // yalnızca test sürücüsü
  'node:crypto',            // Node'a özgü hash
  'node:fs',
];

const REQUIRED = [
  'expo-sqlite',                      // production sürücüsü
  'PRAGMA key',                       // şifreleme gerçekten uygulanıyor
  'v90.dbkey',                        // anahtar kimliği
  'WHEN_UNLOCKED_THIS_DEVICE_ONLY',   // Keychain erişilebilirlik sınıfı
];

let files;
try {
  files = readdirSync(DIR).filter((f) => f.endsWith('.js'));
} catch {
  console.error(`HATA: ${DIR} yok — önce \`npm run bundle:check\` çalıştır.`);
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
 * Ayıklama tam bir JS ayrıştırıcı değildir; sembol VARLIĞI denetimi için
 * yeterlidir: string içindeki `//` dizisi bir satırı yanlışlıkla kesebilir,
 * bu da yalnızca denetimi DAHA sıkı yapar, daha gevşek değil.
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
  console.error('BUNDLE DENETİMİ BAŞARISIZ — şifresiz/Node yolu bundle\'a sızmış (R93.7):');
  for (const s of leaked) console.error(`  • ${s}`);
}
if (missing.length) {
  console.error('BUNDLE DENETİMİ BAŞARISIZ — şifreli yolun izleri yok (denetim boş koşuyor):');
  for (const s of missing) console.error(`  • ${s}`);
}
if (leaked.length || missing.length) process.exit(1);

console.log(`bundle temiz: ${(bytes / 1024 / 1024).toFixed(1)} MB · `
  + `${FORBIDDEN.length} yasak sembolün hiçbiri yok, ${REQUIRED.length} beklenen iz var`);
