// Production'da şifresiz veritabanı yasağı — docs/v90/02-architecture.md §2.1 (R93.7).
//
// İki katmanlı savunma:
//   1. Bundler: production build'de PlainSqliteProvider boş modüle alias'lanır
//      (metro.config.js / babel.config.js — Expo uygulamasıyla birlikte gelir).
//   2. Çalışma zamanı: aşağıdaki assert, uygulama açılışında çalışır ve
//      şifresiz bir sağlayıcıyla production'da başlamayı engeller.
//
// Expo Go uyumluluğu uğruna production güvenliğinden vazgeçilmez (R93.4):
// Expo Go'da SQLCipher yoktur, bu yüzden Expo Go YALNIZCA UI prototipleme
// içindir ve gerçek kullanıcı verisiyle çalıştırılmaz.

import { AppError } from './errors.ts';
import type { DatabaseProvider } from './types.ts';

export interface BuildInfo {
  isProduction: boolean;
  isExpoGo: boolean;
}

export class InsecureBuildError extends AppError {
  constructor(technical: string) {
    super('Bu sürüm güvenli veritabanı olmadan başlatılamaz.', ['contactSupport'], technical);
  }
}

export function assertEncryptedProviderInProduction(
  provider: Pick<DatabaseProvider, 'isEncrypted'>, build: BuildInfo,
): void {
  if (!build.isProduction) return;
  if (build.isExpoGo) {
    throw new InsecureBuildError('production build Expo Go üzerinde çalıştırılamaz (SQLCipher yok, R93.4)');
  }
  if (!provider.isEncrypted) {
    throw new InsecureBuildError('production build şifresiz veritabanı sağlayıcısıyla başlatılamaz (R93.7)');
  }
}

/** Geliştirmede şifresiz çalışmak serbesttir ama sessiz olmamalıdır. */
export function warnIfUnencrypted(
  provider: Pick<DatabaseProvider, 'isEncrypted'>, build: BuildInfo,
  log: (m: string) => void = console.warn,
): void {
  if (!build.isProduction && !provider.isEncrypted) {
    log('[V90] Veritabanı ŞİFRESİZ açıldı — yalnızca geliştirme içindir (R93.2).');
  }
}
