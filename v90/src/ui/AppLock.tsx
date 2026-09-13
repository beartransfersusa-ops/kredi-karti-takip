// App lock ve gizlilik perdesi — docs/v90/06-ux-flows.md B.17, B.18, B.20 (§94).
//
// DÜRÜSTLÜK NOTU (R94.6, R116.5): buradaki perde app switcher anlık
// görüntüsünü örter. Bu, EKRAN GÖRÜNTÜSÜ ENGELLEME DEĞİLDİR ve kullanıcıya
// öyle sunulmaz — iOS bunu güvenilir biçimde desteklemez, web hiç desteklemez.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, View } from 'react-native';
import { Button, Screen, Text } from './components/primitives.tsx';
import { usePalette, space } from './theme.ts';
import { t, tr } from './i18n/index.ts';
import { useServices } from './AppProvider.tsx';
import { settings } from '../core/db/repositories.ts';

const DEFAULT_GRACE_SECONDS = 60;

interface LockConfig { enabled: boolean; graceSeconds: number }

async function readLockConfig(read: <T>(key: string) => Promise<T | undefined>): Promise<LockConfig> {
  return {
    enabled: (await read<boolean>('appLock.enabled')) ?? false,
    graceSeconds: (await read<number>('appLock.graceSeconds')) ?? DEFAULT_GRACE_SECONDS,
  };
}

type LockState = 'unknown' | 'unlocked' | 'locked' | 'failed' | 'noCredential';

export function AppLockGate(p: { children: React.ReactNode }) {
  /*
   * Web'de biyometri / cihaz parolası API'si yoktur; kilit SUNULMAZ ve vaat
   * edilmez (R94.6, 06 B.20). Yedekten gelen 'appLock.enabled' web'de yok
   * sayılır; Güvenlik ekranı kilidin web'de olmadığını açıkça yazar.
   * Perde (PrivacyShield) web'de de çalışır: AppState sekme görünürlüğüne eşlenir.
   */
  if (Platform.OS === 'web') return <>{p.children}</>;
  return <NativeLockGate>{p.children}</NativeLockGate>;
}

function NativeLockGate(p: { children: React.ReactNode }) {
  const services = useServices();
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [state, setState] = useState<LockState>('unknown');
  const [prompting, setPrompting] = useState(false);
  const lastUnlockedAt = useRef<number>(0);

  useEffect(() => {
    services.db.withTransaction((tx) => readLockConfig((k) => settings.get(tx, k)))
      .then((c) => {
        setConfig(c);
        setState(c.enabled ? 'locked' : 'unlocked');
      })
      .catch(() => { setConfig({ enabled: false, graceSeconds: DEFAULT_GRACE_SECONDS }); setState('unlocked'); });
  }, [services]);

  const authenticate = useCallback(async () => {
    setPrompting(true);
    try {
      const LA = await import('expo-local-authentication');
      // Cihazda hiç kilit yoksa biyometri de parola fallback'i de yok.
      if (!(await LA.getEnrolledLevelAsync())) { setState('noCredential'); return; }
      const r = await LA.authenticateAsync({
        promptMessage: tr['lock.prompt'],
        // Cihaz parolası fallback'i AÇIK (R94.3).
        disableDeviceFallback: false,
      });
      if (r.success) { lastUnlockedAt.current = Date.now(); setState('unlocked'); }
      else setState('failed');
    } catch {
      setState('failed');
    } finally {
      setPrompting(false);
    }
  }, []);

  // Kilitli duruma geçildiğinde otomatik sor (B.17 adım 3).
  useEffect(() => {
    if (state === 'locked') void authenticate();
  }, [state, authenticate]);

  // Ön plana dönüş: grace dolduysa yeniden kilitle (B.17 adım 2).
  useEffect(() => {
    if (!config?.enabled) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      const idleSeconds = (Date.now() - lastUnlockedAt.current) / 1000;
      if (idleSeconds > config.graceSeconds) setState('locked');
    });
    return () => sub.remove();
  }, [config]);

  if (state === 'unknown' || (config?.enabled && state !== 'unlocked')) {
    return <LockScreen state={state} busy={prompting} onUnlock={authenticate} />;
  }
  return <>{p.children}</>;
}

function LockScreen(p: { state: LockState; busy: boolean; onUnlock: () => void }) {
  const c = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Screen>
        <View style={{ height: space.xxl * 2 }} />
        <Text variant="display">{t('lock.title')}</Text>
        {p.state === 'failed' ? <Text color="danger">{t('lock.failed')}</Text> : null}
        {p.state === 'noCredential'
          ? <Text color="muted">{t('lock.noCredential')}</Text>
          : <Text color="muted">{t('lock.fallbackHint')}</Text>}
        {p.state !== 'noCredential'
          ? <Button label={t('lock.unlockButton')} kind="primary" onPress={p.onUnlock} busy={p.busy} />
          : null}
      </Screen>
    </View>
  );
}

/**
 * Uygulama arka plana geçerken tüm içeriği örter (R94.5).
 * DB/ağ okuması yapmaz; `ErrorBoundary` dışında da render edilebilir.
 * Web'de react-native-web AppState'i `document.visibilityState`'e eşler:
 * sekme arka plana geçince perde iner, öne gelince kalkar (06 B.20).
 */
export function PrivacyShield(p: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  const c = usePalette();

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setHidden(s !== 'active'));
    return () => sub.remove();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {p.children}
      {hidden ? (
        <View
          accessibilityLabel={tr['privacyOverlay.a11y']}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text variant="display">{tr['privacyOverlay.label']}</Text>
        </View>
      ) : null}
    </View>
  );
}
