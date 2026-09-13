// Expo yapılandırması — docs/v90/02-architecture.md §2, ADR-002, ADR-003, ADR-013.
//
// SQLCipher config plugin ile derlenir. Bu, Expo Go'da ÇALIŞMAZ:
// Development Build / prebuild zorunludur (R93.4). Expo Go yalnızca UI
// prototiplemesi içindir ve gerçek kullanıcı verisiyle çalıştırılmaz.
//
// Web hedefi (ADR-013): aynı yapılandırma `expo export --platform web` ile
// tarayıcı için de derlenir. Web'de SQLCipher yoktur; veritabanı sql.js +
// WebCrypto ile şifrelenmiş görüntü olarak IndexedDB'de durur (02 §12.2).
// GitHub Pages alt yolu build anında V90_WEB_BASE_URL ile verilir
// (→ experiments.baseUrl → çalışma zamanında EXPO_BASE_URL).

import type { ExpoConfig } from 'expo/config';

// GitHub Pages: /kredi-karti-takip. Yerel `expo start --web` için tanımsız kalır.
const webBaseUrl = process.env.V90_WEB_BASE_URL?.replace(/\/$/, '');

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

  web: {
    // Metro ile tek sayfa (SPA) çıktı; 404.html ve sw.js export sonrası
    // scripts/web-postexport.mjs tarafından eklenir (ADR-013).
    bundler: 'metro',
    output: 'single',
    name: 'V90',
    shortName: 'V90',
    lang: 'tr',
    themeColor: '#0f172a',
    backgroundColor: '#0f172a',
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

  experiments: {
    typedRoutes: true,
    // Yalnızca ayarlandığında: expo-router'ın okuduğu EXPO_BASE_URL buradan üretilir.
    ...(webBaseUrl ? { baseUrl: webBaseUrl } : {}),
  },

  extra: {
    // Analytics ve crash reporting v1'de YOK (R118.3: varsayılan kapalı).
    analyticsEnabled: false,
  },
};

export default config;
