// Çalışma zamanı build bilgisi — WEB (docs/v90/02-architecture.md §2.1, R93.4, R93.7).
// Yerel karşılığı: build.ts (aynı dışa aktarım adı).
import type { BuildInfo } from '../core/db/buildGuard.ts';

export function buildInfo(): BuildInfo {
  return {
    // __DEV__ Metro tarafından tanımlanır; production export'ta false'tur.
    // Production'da sağlayıcı `isEncrypted` demezse açılış durur (R93.7):
    // web'de bu bayrak EncryptedImageStore'dan gelir, düz depodan değil.
    isProduction: !__DEV__,
    // Expo Go tarayıcıda yoktur; web her zaman gerçek bundle'dır.
    isExpoGo: false,
  };
}
