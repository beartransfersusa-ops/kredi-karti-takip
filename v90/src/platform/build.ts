// Çalışma zamanı build bilgisi — docs/v90/02-architecture.md §2.1 (R93.4, R93.7).
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type { BuildInfo } from '../core/db/buildGuard.ts';

export function buildInfo(): BuildInfo {
  return {
    // __DEV__ Metro tarafından tanımlanır; production bundle'da false'tur.
    isProduction: !__DEV__,
    // Expo Go'da SQLCipher YOKTUR. Bu bayrak, production'da Expo Go üzerinde
    // çalışmayı engelleyen assert'in girdisidir.
    isExpoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  };
}
