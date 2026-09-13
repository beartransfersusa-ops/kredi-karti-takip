// Ayarlar — docs/v90/06-ux-flows.md B.0 bölüm haritası, B.20 (web kartı).
import { useCallback } from 'react';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { useDbQuery, usePlatformInfo } from '../../src/ui/AppProvider.tsx';
import { readEquipmentProfile, readTrainingProfile } from '../../src/features/profile/profileQuery.ts';
import { settings } from '../../src/core/db/repositories.ts';
import { LAST_EXPORT_BYTES_KEY, LAST_EXPORT_KEY, formatBytes } from '../../src/features/backup/backupService.ts';
import { dateTr } from '../../src/features/format.ts';
import type { PersistState } from '../../src/platform/storage.ts';
import { Badge, Button, Card, Divider, Row, Screen, Text } from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { t } from '../../src/ui/i18n/index.ts';
import type { TrKey } from '../../src/ui/i18n/index.ts';

/** Kalıcı depolama durumu → metin (06 B.20 durum tablosu). */
const PERSIST_KEY = {
  granted: 'settings.web.persist.granted',
  denied: 'settings.web.persist.denied',
  unsupported: 'settings.web.persist.unsupported',
} as const satisfies Record<PersistState, TrKey>;

export default function SettingsRoute() {
  return <ErrorBoundary onHome={() => router.replace('/')}><SettingsHub /></ErrorBoundary>;
}

function SettingsHub() {
  const { persist } = usePlatformInfo();
  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => ({
    equipment: await readEquipmentProfile(tx),
    training: await readTrainingProfile(tx),
    lastExport: await settings.get<string>(tx, LAST_EXPORT_KEY),
    lastExportBytes: await settings.get<number>(tx, LAST_EXPORT_BYTES_KEY),
    appLock: (await settings.get<boolean>(tx, 'appLock.enabled')) ?? false,
    isEncrypted: s.isEncrypted,
    todayKey: s.clock.todayKey(),
  })), []));

  const d = q.data;
  return (
    <Screen>
      <Card>
        <Text variant="heading">{t('settings.equipment.title')}</Text>
        <Text variant="caption" color="muted">
          {d?.equipment ? `${d.equipment.available.length} ekipman seçili` : 'Henüz ayarlanmadı'}
        </Text>
        <Button label="Düzenle" onPress={() => router.push('/settings/equipment')} />
      </Card>

      <Card>
        <Text variant="heading">{t('settings.appLock.title')}</Text>
        <Row wrap>
          {/* Web'de kilit hiç uygulanmaz (AppLockGate geçer, 06 B.20); yedekten
              gelen 'appLock.enabled' için "Açık" göstermek tutulmayan bir söz
              olurdu (R94.6). Nötr rozet: "Web'de yok". Yerel davranış aynı. */}
          {Platform.OS === 'web'
            ? <Badge tone="neutral" label={t('settings.appLock.webBadge')} />
            : <Badge tone={d?.appLock ? 'primary' : 'neutral'} label={d?.appLock ? 'Açık' : 'Kapalı'} />}
          {/* Şifreleme durumu dürüstçe gösterilir; "güvenli" diye genel bir
              iddia yerine ne olduğu yazılır (R94.6). */}
          <Badge tone={d?.isEncrypted ? 'primary' : 'warning'}
            label={d?.isEncrypted ? 'Veritabanı şifreli' : 'Veritabanı ŞİFRESİZ (geliştirme)'} />
        </Row>
        <Button label="Düzenle" onPress={() => router.push('/settings/lock')} />
      </Card>

      <Card>
        <Text variant="heading">Yedekleme</Text>
        <Text variant="caption" color="muted">
          {d?.lastExport
            ? t('settings.backup.export.last', {
              date: dateTr(d.lastExport.slice(0, 10), d.todayKey),
              size: formatBytes(d.lastExportBytes),
            })
            : t('settings.backup.export.none')}
        </Text>
        <Button label="Aç" onPress={() => router.push('/settings/backup')} />
      </Card>

      {Platform.OS === 'web' ? (
        <Card>
          <Text variant="heading">{t('settings.web.title')}</Text>
          {/* Ne olduğu yazılır: görüntü ve fotoğraflar AES-GCM ile, SQLCipher DEĞİL;
              anahtar JS'e kapalı, diskte tarayıcı profili kadar korunur (R93.4,
              R93.5; ADR-013 Karar 4). "Güvenli" gibi genel iddia yok. */}
          <Text variant="caption" color="muted">{t('settings.web.encryption')}</Text>
          {/* Kalıcı depolama verilmediyse tarayıcı yer açmak için siteyi
              silebilir; anahtar da gider. Uyarı rengiyle, ama açılış engellenmez. */}
          <Text variant="caption" color={persist === 'granted' ? 'muted' : 'warning'}>
            {t(PERSIST_KEY[persist])}
          </Text>
          <Text variant="caption" color="muted">{t('settings.web.limits')}</Text>
        </Card>
      ) : null}

      <Card>
        <Text variant="heading">Program</Text>
        <Button label="Program ayarları" onPress={() => router.push('/program/settings')} />
      </Card>

      <Divider />
      <Text variant="caption" color="faint">
        {`V90 ${Constants.expoConfig?.version ?? ''} · analytics kapalı (R118.3)`}
      </Text>
    </Screen>
  );
}
