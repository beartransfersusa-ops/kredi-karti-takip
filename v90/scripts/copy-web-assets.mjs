#!/usr/bin/env node
// Web varlıklarını `public/` altına kopyalar — docs/v90/02-architecture.md §12.2, ADR-013.
//
// sql.js'in wasm ikilisi paketin içinde durur; tarayıcı onu Metro bundle'ından
// değil, `<base>/<dosya>.wasm` adresinden ister (db.web.ts → locateFile).
// Expo, `public/` klasörünü export çıktısının köküne olduğu gibi kopyalar;
// bu script paketten oraya taşır. `postinstall` olarak koşar.
//
// İki ikili birden kopyalanır çünkü glue dosyası platform koşuluna göre seçilir:
//   • Metro web'de package exports + "browser" koşuluyla dist/sql-wasm-browser.js'i
//     çözer; o glue `sql-wasm-browser.wasm` ister.
//   • exports çözümü kapalıysa varsayılan dist/sql-wasm.js gelir; o `sql-wasm.wasm` ister.
// Yanlış ikili yanlış glue ile açılmaz; ikisinin de hazır olması yolu güvene alır.
//
// sql.js yoksa (örn. `npm ci --omit=optional` ile kurulmuş bir CI işi) sessizce
// geçer: yerel (iOS/Android) derleme bu dosyalara ihtiyaç duymaz.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'node_modules', 'sql.js', 'dist');
const PUBLIC = join(ROOT, 'public');
const WASM = ['sql-wasm-browser.wasm', 'sql-wasm.wasm'];

if (!existsSync(DIST)) {
  // Sessiz: yerel derlemede sql.js gerekmez.
  process.exit(0);
}

mkdirSync(PUBLIC, { recursive: true });
const copied = [];
for (const name of WASM) {
  const src = join(DIST, name);
  if (!existsSync(src)) continue;
  copyFileSync(src, join(PUBLIC, name));
  copied.push(name);
}
if (copied.length) console.log(`public/ ← ${copied.join(', ')}`);
