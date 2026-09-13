// Bootstrap durum ekranları — docs/v90/06-ux-flows.md B.16.1, B.16.2.
//
// Bu ekranlar DB'ye ve ağa DOKUNMADAN render edilir: veritabanı açılamadığında
// gösterilecek ekran veritabanına bağımlı olamaz.
import { useState } from 'react';
import { Platform, View } from 'react-native';
import Constants from 'expo-constants';
import type { BootstrapError } from '../../bootstrap/container.ts';
import { Button, Card, Row, Screen, Skeleton, Text } from '../components/primitives.tsx';
import { space, usePalette } from '../theme.ts';
import { t } from '../i18n/index.ts';

/** Splash — hiçbir veri gösterilmez, bu yüzden kilit gerekmez (B.17 adım 1). */
export function BootstrapLoading(p: { message?: string }) {
  const c = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: space.xl, gap: space.lg, justifyContent: 'center' }}>
      <Text variant="display">V90</Text>
      {p.message ? <Text color="muted">{p.message}</Text> : null}
      <Skeleton height={12} width="60%" />
      <Skeleton height={12} width="40%" />
    </View>
  );
}

export function BootstrapErrorScreen(p: {
  error: BootstrapError; onRetry: () => void; onRestoreBackup?: () => void; onExportBackup?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const retry = () => { setBusy(true); p.onRetry(); };

  if (p.error.step === 'diskSpace') {
    return (
      <ErrorFrame title={t('error.diskSpace.title')} body={t('error.diskSpace.body')} error={p.error}>
        <Button label={t('common.retry')} kind="primary" onPress={retry} busy={busy} />
      </ErrorFrame>
    );
  }

  if (p.error.step === 'migrate') {
    return (
      <ErrorFrame title={t('error.migration.title')} error={p.error}>
        <Row wrap>
          <Button label={t('error.migration.retry')} kind="primary" onPress={retry} busy={busy} />
          {p.onExportBackup ? <Button label={t('error.migration.export')} onPress={p.onExportBackup} /> : null}
        </Row>
      </ErrorFrame>
    );
  }

  if (p.error.step === 'build') {
    // R93.4/R93.7: bu sürüm güvenli veritabanı olmadan başlatılamaz.
    return <ErrorFrame title="Bu sürüm bu ortamda çalıştırılamaz." body={p.error.message} error={p.error} />;
  }

  // 'open' ve 'seed' → DbOpenError ekranı (B.16.1).
  return (
    <ErrorFrame title={t('error.dbOpen.title')} body={t('error.dbOpen.body')} error={p.error}>
      <Row wrap>
        <Button label={t('error.dbOpen.retry')} kind="primary" onPress={retry} busy={busy} />
        {p.onRestoreBackup ? <Button label={t('error.dbOpen.restore')} onPress={p.onRestoreBackup} /> : null}
      </Row>
    </ErrorFrame>
  );
}

function ErrorFrame(p: { title: string; body?: string; error: BootstrapError; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Screen>
      <View style={{ height: space.xxl }} />
      <Text variant="title">{p.title}</Text>
      {p.body ? <Text color="muted">{p.body}</Text> : null}
      {p.children}
      <Button label={open ? 'Ayrıntıları gizle' : t('common.details')} kind="ghost" onPress={() => setOpen((v) => !v)} />
      {open ? (
        <Card>
          {/*
            Destek bilgisi: yalnızca adım, hata metni, sürüm ve platform.
            Hiçbir kullanıcı verisi (ölçüm, lab, fotoğraf, not) YOKTUR — R118.2.
          */}
          <Text variant="caption" color="muted">{`adım: ${p.error.step}`}</Text>
          <Text variant="caption" color="muted">{`hata: ${p.error.message.slice(0, 300)}`}</Text>
          <Text variant="caption" color="muted">
            {`sürüm: ${Constants.expoConfig?.version ?? '?'} · ${Platform.OS} ${String(Platform.Version)}`}
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
