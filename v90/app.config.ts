// Expo yapılandırması — docs/v90/02-architecture.md §2, ADR-002, ADR-003.
//
// SQLCipher config plugin ile derlenir. Bu, Expo Go'da ÇALIŞMAZ:
// Development Build / prebuild zorunludur (R93.4). Expo Go yalnızca UI
// prototiplemesi içindir ve gerçek kullanıcı verisiyle çalıştırılmaz.

import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'V90',
  slug: 'v90',
  scheme: 'v90',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  assetBundlePatterns: ['**/*'],

  ios: {
    bundleIdentifier: 'app.v90.challenge',
    supportsTablet: false,
    infoPlist: {
      // Biyometrik kilit (§94). Metin kullanıcıya gösterilir.
      NSFaceIDUsageDescription:
        'Uygulamayı açarken kimliğini doğrulamak için Face ID kullanılır.',
      NSPhotoLibraryUsageDescription:
        'İlerleme fotoğrafı eklemek için galeriden seçim yapabilirsin.',
      NSCameraUsageDescription: 'İlerleme fotoğrafı çekmek için kamera kullanılır.',
    },
  },

  android: {
    package: 'app.v90.challenge',
    // Sistem auto-backup şifreli DB'yi anahtarsız yeni cihaza taşırsa dosya
    // açılamaz hale gelir (ADR-002 Karar 4). DB ve fotoğraflar hariç tutulur.
    allowBackup: false,
  },

  plugins: [
    'expo-router',
    ['expo-sqlite', { useSQLCipher: true }],
    ['expo-secure-store', {
      configureAndroidBackup: false,
      faceIDPermission: 'Uygulamayı açarken kimliğini doğrulamak için Face ID kullanılır.',
    }],
    ['expo-local-authentication', {
      faceIDPermission: 'Uygulamayı açarken kimliğini doğrulamak için Face ID kullanılır.',
    }],
    ['expo-image-picker', {
      photosPermission: 'İlerleme fotoğrafı eklemek için galeriden seçim yapabilirsin.',
      cameraPermission: 'İlerleme fotoğrafı çekmek için kamera kullanılır.',
    }],
  ],

  experiments: { typedRoutes: true },

  extra: {
    // Analytics ve crash reporting v1'de YOK (R118.3: varsayılan kapalı).
    analyticsEnabled: false,
  },
};

export default config;
