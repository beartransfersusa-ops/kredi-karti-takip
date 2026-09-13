// Metro yapılandırması.
//
// Çekirdek kod (src/core, src/domain) Node'un yerel TypeScript desteğiyle de
// koştuğu için import'lar açık `.ts` uzantısı taşır (tsconfig:
// allowImportingTsExtensions). Metro'nun bunu çözebilmesi için uzantı
// kırpılır; böylece tek kaynak hem `node --test` hem de Metro tarafından
// derlenir, ikinci bir kopya tutulmaz.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolve ?? context.resolveRequest;
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
