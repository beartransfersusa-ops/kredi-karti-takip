// Uygulama kilidi ve gizlilik — docs/v90/06-ux-flows.md B.6 (§94, R116.5), B.20 (web).
//
// DÜRÜSTLÜK KURALI (R94.6): iOS'ta ve web'de ekran görüntüsü engelleme VAAT
// EDİLMEZ. Anahtar orada hiç gösterilmez; yerine ne yapıldığı ve ne
// yapılmadığı yazılır. Web'de uygulama kilidi de yoktur ve öyle yazılır.
import { useCallback, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { settings } from '../../src/core/db/repositories.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Button, Card, Divider, ErrorBar, Row, Screen, Segmented, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

type Availability = 'checking' | 'available' | 'unavailable';

export default function LockRoute() {
  return <ErrorBoundary onHome={() => router.back()}><LockSettings /></ErrorBoundary>;
}

function LockSettings() {
  const [availability, setAvailability] = useState<Availability>('checking');
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // Web'de biyometri API'si yok; sorgulamadan "uygun değil" (B.20).
    if (Platform.OS === 'web') { setAvailability('unavailable'); return; }
    (async () => {
      try {
        const LA = await import('expo-local-authentication');
        const ok = (await LA.hasHardwareAsync()) && (await LA.isEnrolledAsync());
        if (alive) setAvailability(ok ? 'available' : 'unavailable');
      } catch {
        if (alive) setAvailability('unavailable');
      }
    })();
    return () => { alive = false; };
  }, []);

  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => ({
    enabled: (await settings.get<boolean>(tx, 'appLock.enabled')) ?? false,
    graceSeconds: (await settings.get<number>(tx, 'appLock.graceSeconds')) ?? 30,
    flagSecure: (await settings.get<boolean>(tx, 'privacy.androidFlagSecure')) ?? false,
  })), []));

  const write = useCommand(async (s, key: string, value: unknown, previous: unknown) => {
    await s.db.withTransaction(async (tx) => {
      const now = s.clock.nowUtc().toISOString();
      await settings.set(tx, key, value, now);
      await tx.exec(
        `INSERT INTO settings_history (id, key, old_value_json, new_value_json, changed_at_utc)
         VALUES (?,?,?,?,?)`,
        [`sh-${now}-${key}`, key, JSON.stringify(previous), JSON.stringify(value), now]);
    });
  });

  // Kilidi açarken de kapatırken de bir kez doğrulama istenir: kullanıcının
  // kendini dışarıda bırakmaması için (B.6 adım 2 ve 5).
  const toggleLock = async (next: boolean) => {
    setAuthError(null);
    try {
      const LA = await import('expo-local-authentication');
      const r = await LA.authenticateAsync({
        promptMessage: tr['settings.appLock.prompt'],
        disableDeviceFallback: false,
      });
      if (!r.success) {
        setAuthError(next ? t('settings.appLock.enableFailed') : t('settings.appLock.disableFailed'));
        return;
      }
    } catch {
      setAuthError(next ? t('settings.appLock.enableFailed') : t('settings.appLock.disableFailed'));
      return;
    }
    if (await write.run('appLock.enabled', next, q.data?.enabled ?? false)) q.reload();
  };

  if (q.loading) return <Screen><Skeleton height={24} width="55%" /><Card><Skeleton height={120} /></Card></Screen>;
  const d = q.data!;

  return (
    <Screen>
      <Card>
        <Text variant="heading">{t('settings.appLock.title')}</Text>
        <Text variant="caption" color="muted">{t('settings.appLock.description')}</Text>

        {availability === 'checking' ? (
          <Text variant="caption" color="faint">{t('settings.appLock.checking')}</Text>
        ) : availability === 'unavailable' ? (
          // Desteklenmiyorsa anahtar pasif; sebep açıkça yazılır. Web'de sebep
          // cihaz değil platformdur: "cihaz ayarlarından ekle" denmez.
          <Text color="muted">
            {Platform.OS === 'web' ? t('settings.appLock.webUnavailable') : t('settings.appLock.unavailable')}
          </Text>
        ) : (
          <>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text style={{ flex: 1 }}>{t('settings.appLock.toggle')}</Text>
              <Button
                label={d.enabled ? 'Açık' : 'Kapalı'}
                kind={d.enabled ? 'primary' : 'secondary'}
                busy={write.busy}
                onPress={() => void toggleLock(!d.enabled)}
              />
            </Row>
            <Text variant="caption" color="faint">{t('settings.appLock.fallbackNote')}</Text>
          </>
        )}

        {authError ? <ErrorBar message={authError} /> : null}
        {write.error ? <ErrorBar details={write.error.message} /> : null}
      </Card>

      {availability === 'available' && d.enabled ? (
        <Card>
          <Text variant="label" color="muted">{t('settings.appLock.grace.title')}</Text>
          <Segmented<'0' | '30' | '300'>
            value={String(d.graceSeconds) as '0' | '30' | '300'}
            disabled={write.busy}
            options={[
              { value: '0', label: t('settings.appLock.grace.0') },
              { value: '30', label: t('settings.appLock.grace.30') },
              { value: '300', label: t('settings.appLock.grace.300') },
            ]}
            onChange={async (v) => {
              if (await write.run('appLock.graceSeconds', Number(v), d.graceSeconds)) q.reload();
            }}
          />
          <Text variant="caption" color="faint">{t('settings.appLock.grace.hint')}</Text>
        </Card>
      ) : null}

      <Divider />

      <Card>
        <Text variant="heading">{t('settings.privacy.title')}</Text>
        <Text variant="caption" color="muted">{t('settings.privacy.noCloud')}</Text>
        <Text variant="caption" color="muted">{t('settings.privacy.sensitiveScreens')}</Text>

        {Platform.OS === 'android' ? (
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text>{t('settings.privacy.androidFlagSecure')}</Text>
              <Text variant="caption" color="faint">{t('settings.privacy.androidFlagSecureHint')}</Text>
            </View>
            <Button
              label={d.flagSecure ? 'Açık' : 'Kapalı'}
              kind={d.flagSecure ? 'primary' : 'secondary'}
              busy={write.busy}
              onPress={async () => {
                if (await write.run('privacy.androidFlagSecure', !d.flagSecure, d.flagSecure)) q.reload();
              }}
            />
          </Row>
        ) : Platform.OS === 'web' ? (
          /*
           * Web: tarayıcı ekran görüntüsünü engelleyemez; anahtar YOK, söz YOK
           * (R94.6). Sekme arka plana geçince perde iner (B.18, B.20).
           */
          <Text variant="caption" color="muted">{t('settings.privacy.webNote')}</Text>
        ) : (
          /*
           * iOS: anahtar YOK. Platformun güvenilir desteklemediği bir özelliği
           * ayar olarak sunmak, tutulamayacak bir söz vermektir (R94.6).
           */
          <Text variant="caption" color="muted">{t('settings.privacy.iosNoScreenshotBlock')}</Text>
        )}
      </Card>

      <View style={{ height: space.xl }} />
    </Screen>
  );
}
