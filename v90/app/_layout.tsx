// Kök düzen — docs/v90/06-ux-flows.md A.0 rota haritası, B.16.5, B.17, B.18.
//
// Katman sırası dışarıdan içeriye:
//   ErrorBoundary(root) → PrivacyShield → AppProvider(bootstrap) → AppLockGate → Stack
// Perde bootstrap'ın DIŞINDADIR: veritabanı açılamasa bile arka plana geçişte
// ekran örtülür.
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../src/ui/AppProvider.tsx';
import { AppLockGate, PrivacyShield } from '../src/ui/AppLock.tsx';
import { ErrorBoundary } from '../src/ui/components/ErrorBoundary.tsx';
import { BootstrapErrorScreen, BootstrapLoading } from '../src/ui/screens/BootstrapScreens.tsx';
import { usePalette } from '../src/ui/theme.ts';
import { t } from '../src/ui/i18n/index.ts';

export default function RootLayout() {
  return (
    <ErrorBoundary root>
      <SafeAreaProvider>
        <PrivacyShield>
          <AppProvider
            renderLoading={() => <BootstrapLoading />}
            renderError={(e, retry) => (
              <BootstrapErrorScreen
                error={e}
                onRetry={retry}
                onRestoreBackup={() => router.replace('/settings/backup')}
              />
            )}
          >
            <AppLockGate>
              <Shell />
            </AppLockGate>
          </AppProvider>
        </PrivacyShield>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

function Shell() {
  const c = usePalette();
  const screen = {
    headerStyle: { backgroundColor: c.bg },
    headerTintColor: c.text,
    headerShadowVisible: false,
    contentStyle: { backgroundColor: c.bg },
  } as const;
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={screen}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="workout/active" options={{ title: '', headerBackTitle: 'Ana ekran' }} />
        <Stack.Screen name="workout/finish" options={{ title: '' }} />
        <Stack.Screen name="workout/substitute" options={{ presentation: 'modal', title: t('active.substitute') }} />
        <Stack.Screen name="program/settings" options={{ title: 'Program' }} />
        <Stack.Screen name="program/reschedule" options={{ presentation: 'modal', title: t('reschedule.title') }} />
        <Stack.Screen name="insights/plateau/[id]" options={{ title: '' }} />
        <Stack.Screen name="onboarding/index" options={{ headerShown: false }} />
        <Stack.Screen name="settings/backup" options={{ title: 'Yedekleme' }} />
        <Stack.Screen name="settings/equipment" options={{ title: t('settings.equipment.title') }} />
        <Stack.Screen name="settings/lock" options={{ title: 'Güvenlik' }} />
        <Stack.Screen name="measurements/new" options={{ title: 'Ölçüm ekle' }} />
        <Stack.Screen name="nutrition/add" options={{ title: t('nutrition.addFood') }} />
        <Stack.Screen name="nutrition/recipe" options={{ title: t('recipe.title') }} />
        <Stack.Screen name="photos/index" options={{ title: t('photos.title') }} />
        <Stack.Screen name="report/day90" options={{ title: t('report.title') }} />
      </Stack>
    </>
  );
}
