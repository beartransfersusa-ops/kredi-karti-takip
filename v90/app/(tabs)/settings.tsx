// Ayarlar — docs/v90/06-ux-flows.md B.0 bölüm haritası.
import { useCallback } from 'react';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useDbQuery } from '../../src/ui/AppProvider.tsx';
import { readEquipmentProfile, readTrainingProfile } from '../../src/features/profile/profileQuery.ts';
import { settings } from '../../src/core/db/repositories.ts';
import { LAST_EXPORT_BYTES_KEY, LAST_EXPORT_KEY, formatBytes } from '../../src/features/backup/backupService.ts';
import { dateTr } from '../../src/features/format.ts';
import { Badge, Button, Card, Divider, Row, Screen, Text } from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { t } from '../../src/ui/i18n/index.ts';

export default function SettingsRoute() {
  return <ErrorBoundary onHome={() => router.replace('/')}><SettingsHub /></ErrorBoundary>;
}

function SettingsHub() {
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
          <Badge tone={d?.appLock ? 'primary' : 'neutral'} label={d?.appLock ? 'Açık' : 'Kapalı'} />
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
