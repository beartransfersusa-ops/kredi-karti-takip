// Metro yapılandırması.
//
// Çekirdek kod (src/core, src/domain) Node'un yerel TypeScript desteğiyle de
// koştuğu için import'lar açık `.ts` uzantısı taşır (tsconfig:
// allowImportingTsExtensions). Metro'nun bunu çözebilmesi için uzantı
// kırpılır; böylece tek kaynak hem `node --test` hem de Metro tarafından
// derlenir, ikinci bir kopya tutulmaz.
//
// Web hedefi (ADR-013): sql.js'in varsayılan Emscripten yapıştırıcısı
// (dist/sql-wasm.js) `fs`/`path`/`crypto` modüllerini yalnızca Node dalında
// ister; tarayıcıda o dal hiç çalışmaz. Metro bu modülleri çözemeyince export'u
// düşürmesin diye web platformunda boş modül döndürülür. (package exports +
// "browser" koşulu dist/sql-wasm-browser.js'i seçerse istek hiç gelmez; boş
// modül yine de durur.) Yerel (ios/android) çözümleme dokunulmadan kalır.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// sql.js yapıştırıcısının Node'a özgü istekleri (yalnızca web'de boşaltılır).
const NODE_ONLY_ON_WEB = new Set(['node:fs', 'node:crypto', 'fs', 'path', 'crypto']);

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
  if (platform === 'web' && NODE_ONLY_ON_WEB.has(moduleName)) {
    return { type: 'empty' };
  }
  if (moduleName.startsWith('.') && /\.tsx?$/.test(moduleName)) {
    try {
      return resolve(context, moduleName.replace(/\.tsx?$/, ''), platform);
    } catch {
      // Uzantısız hâli çözülemediyse orijinal adla devam et.
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
