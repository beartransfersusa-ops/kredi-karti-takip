// Yedekleme — docs/v90/06-ux-flows.md B.7 (dışa aktar), B.8 (içe aktar, geri al).
//
// İçe aktarmanın "mevcut verin değişmedi" garantisi (R95.7) bu ekrandan değil,
// `BackupImporter`'ın SIRALAMASINDAN gelir: doğrulama ve tüm yazmalar ayrı bir
// staging veritabanında yapılır; canlı dosyaya yalnızca en sonda, tek bir
// yeniden adlandırmayla dokunulur ve o adım da başarısız olursa geri alınır.
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { BackupImportError } from '../../src/core/backup/errors.ts';
import { settings } from '../../src/core/db/repositories.ts';
import {
  LAST_EXPORT_BYTES_KEY, LAST_EXPORT_KEY, REMINDER_KEY, formatBytes,
  makeExporter, makeImporter, undoWindow,
} from '../../src/features/backup/backupService.ts';
import type { BackupEnv } from '../../src/features/backup/backupService.ts';
import { dateTr } from '../../src/features/format.ts';
import { expoSha256, expoSha256Bytes } from '../../src/platform/hash.ts';
import { ExpoBlobStore, photosDir } from '../../src/platform/blobs.ts';
import { useAppContext, useCommand, useDbQuery, useServices } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../src/ui/theme.ts';
import { t } from '../../src/ui/i18n/index.ts';
import type { Services } from '../../src/bootstrap/container.ts';

const RESTORE_POINT_FILE = 'v90.restore-point.json';

export default function BackupRoute() {
  return <ErrorBoundary onHome={() => router.replace('/')}><Backup /></ErrorBoundary>;
}

function backupEnv(s: Services): BackupEnv {
  return {
    db: () => s.db,
    clock: s.clock,
    hash: expoSha256,
    hashBytes: expoSha256Bytes,
    blobs: new ExpoBlobStore(),
    dbPath: s.dbPath,
    photosDir: photosDir(),
    appVersion: Constants.expoConfig?.version ?? '0.0.0',
    openMigrated: s.openMigrated,
    closeLive: s.closeLive,
    reopenLive: s.reopenLive,
    hasActiveSession: async () => (await s.session.findActive()) !== null,
  };
}

function Backup() {
  const services = useServices();
  const { restart } = useAppContext();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState<{ zip: Uint8Array; name: string } | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => ({
    lastExport: await settings.get<string>(tx, LAST_EXPORT_KEY),
    lastExportBytes: await settings.get<number>(tx, LAST_EXPORT_BYTES_KEY),
    reminder: (await settings.get<boolean>(tx, REMINDER_KEY)) ?? true,
    hasActive: (await s.session.findActive()) !== null,
    todayKey: s.clock.todayKey(),
    restorePoint: readRestorePoint(),
    nowUtc: s.clock.nowUtc(),
  })), []));

  // ── Dışa aktar (B.7)
  const exportBackup = useCommand(async (s) => {
    const { zip, fileName, manifest } = await makeExporter(backupEnv(s)).export();
    // ZIP önce uygulama sandbox'ına yazılır; paylaşım iptali veri kaybı değildir.
    const out = new File(Paths.cache, fileName);
    if (out.exists) out.delete();
    out.create();
    out.write(zip);

    const now = s.clock.nowUtc().toISOString();
    await s.db.withTransaction(async (tx) => {
      await settings.set(tx, LAST_EXPORT_KEY, now, now);
      await settings.set(tx, LAST_EXPORT_BYTES_KEY, zip.byteLength, now);
    });

    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(out.uri, { mimeType: 'application/zip', dialogTitle: fileName });
    }
    const photos = manifest.photos?.count ?? 0;
    setResult(`${fileName} · ${formatBytes(zip.byteLength)} · ${photos} fotoğraf`);
  });

  // ── İçe aktar (B.8)
  const pickFile = useCommand(async () => {
    const Picker = await import('expo-document-picker');
    const picked = await Picker.getDocumentAsync({ type: 'application/zip', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;      // iptal durum değiştirmez
    const asset = picked.assets[0];
    setPending({ zip: await new File(asset.uri).bytes(), name: asset.name });
    setConfirming(true);
  });

  const runImport = useCommand(async (s) => {
    if (!pending) return;
    const report = await makeImporter(backupEnv(s)).import(pending.zip);
    writeRestorePoint({ importedAtUtc: s.clock.nowUtc().toISOString(), report: report.tables });
    setResult(`${Object.values(report.tables).reduce((a, b) => a + b, 0)} satır · ${report.photos} fotoğraf geri yüklendi`);
    setPending(null);
    setConfirming(false);
    restart();                                               // DB dosyası değişti (B.8 adım 6)
  });

  const toggleReminder = useCommand(async (s, value: boolean) => {
    await s.db.withTransaction((tx) =>
      settings.set(tx, REMINDER_KEY, value, s.clock.nowUtc().toISOString()));
  });

  if (q.loading) return <Screen><Skeleton height={24} width="45%" /><Card><Skeleton height={120} /></Card></Screen>;

  const d = q.data;
  const importError = runImport.error;
  const undo = d?.restorePoint ? undoWindow(d.restorePoint.importedAtUtc, d.nowUtc) : null;

  return (
    <Screen>
      {result ? <Card tone="warning"><Text>{result}</Text></Card> : null}

      {/* ── Dışa aktar */}
      <Card>
        <Text variant="heading">{t('settings.backup.export.button')}</Text>
        <Text variant="caption" color="muted">
          {d?.lastExport
            ? t('settings.backup.export.last', {
              date: dateTr(d.lastExport.slice(0, 10), d.todayKey),
              size: formatBytes(d.lastExportBytes),
            })
            : t('settings.backup.export.none')}
        </Text>
        {/* ZIP ŞİFRESİZDİR. Bunu gizlemek yerine açıkça söylüyoruz (02 §12.2). */}
        <Text variant="caption" color="muted">{t('settings.backup.export.unencryptedWarning')}</Text>
        {d?.hasActive
          ? <Text variant="caption" color="faint">{t('settings.backup.export.activeSessionNote')}</Text>
          : null}
        {exportBackup.error
          ? <ErrorBar message={t('settings.backup.export.failed')} details={exportBackup.error.message}
              onRetry={() => void exportBackup.run()} />
          : null}
        <Button label={t('settings.backup.export.button')} kind="primary" busy={exportBackup.busy}
          onPress={() => void exportBackup.run()} />
      </Card>

      {/* ── İçe aktar */}
      <Card>
        <Text variant="heading">{t('settings.backup.import.button')}</Text>
        <Text variant="caption" color="muted">{t('settings.backup.import.description')}</Text>
        {d?.hasActive ? (
          <Text color="danger">{t('settings.backup.import.blockedActiveSession')}</Text>
        ) : null}
        {importError ? (
          <ErrorBar
            message={t('error.import.title')}
            details={importError instanceof BackupImportError
              ? `${importError.message}` : String(importError.message)}
            onRetry={() => void runImport.run()}
          />
        ) : null}
        <Button
          label={t('settings.backup.import.button')}
          busy={pickFile.busy}
          disabled={d?.hasActive}
          onPress={() => void pickFile.run()}
        />
      </Card>

      {/* ── Geri al (7 gün) */}
      {undo && !undo.expired ? (
        <Card tone="warning">
          <Text variant="heading">{t('settings.backup.undo.button')}</Text>
          <Text variant="caption" color="muted">
            {t('settings.backup.undo.card', {
              date: dateTr(d!.restorePoint!.importedAtUtc.slice(0, 10), d!.todayKey),
              days: undo.remainingDays,
            })}
          </Text>
          <Row><Badge tone="warning" label={`${undo.remainingDays} gün`} /></Row>
        </Card>
      ) : null}

      <Divider />
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text>{t('settings.backup.reminder.toggle')}</Text>
            <Text variant="caption" color="faint">{t('settings.backup.reminder.card')}</Text>
          </View>
          <Button
            label={d?.reminder ? 'Açık' : 'Kapalı'}
            kind={d?.reminder ? 'primary' : 'secondary'}
            busy={toggleReminder.busy}
            onPress={async () => { if (await toggleReminder.run(!d?.reminder)) q.reload(); }}
          />
        </Row>
      </Card>

      <ConfirmDialog
        visible={confirming}
        title={t('settings.backup.import.button')}
        body={t('settings.backup.import.confirm')}
        confirmLabel={t('settings.backup.import.mode.replace')}
        cancelLabel={t('common.cancel')}
        destructive
        busy={runImport.busy}
        onCancel={() => { setConfirming(false); setPending(null); }}
        onConfirm={() => void runImport.run()}
      />

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}

/**
 * "Geri al" penceresi DB'nin İÇİNDE tutulamaz: import DB dosyasının kendisini
 * değiştirir, yazılan kayıt kaybolurdu. Bu yüzden yanına bir sidecar dosya
 * yazılır (06 açık nokta: "import zamanı DB dışında saklanmalı").
 */
function readRestorePoint(): { importedAtUtc: string } | null {
  try {
    const f = new File(new Directory(Paths.document), RESTORE_POINT_FILE);
    if (!f.exists) return null;
    return JSON.parse(f.textSync()) as { importedAtUtc: string };
  } catch { return null; }
}

function writeRestorePoint(value: { importedAtUtc: string; report: Record<string, number> }): void {
  try {
    const f = new File(new Directory(Paths.document), RESTORE_POINT_FILE);
    if (f.exists) f.delete();
    f.create();
    f.write(JSON.stringify(value));
  } catch { /* kayıt tutulamazsa yalnızca "Geri al" kartı görünmez */ }
}
