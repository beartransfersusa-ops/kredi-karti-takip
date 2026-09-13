// Day 90 raporu — docs/v90/06-ux-flows.md B.19, AT-20 (R123).
//
// Sahte kesinlik yok: her değer ya ölçümden gelir ya da yoktur ("—").
// e1RM tahmindir ve rozetle işaretlenir. "kas kazandın" benzeri iddia YOK.
// Programı kapatma KULLANICI onayıyladır (02 §6.5); zorunlu değildir.
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { completeProgram, loadDay90Report } from '../../src/features/report/reportQuery.ts';
import type { SiteReport } from '../../src/features/report/day90Report.ts';
import { dateTr, num, UNKNOWN } from '../../src/features/format.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

const SITE_LABEL: Record<string, string> = {
  waist: tr['onboarding.initial.row.waist'], abdomen: tr['onboarding.initial.row.abdomen'],
  shoulder: tr['onboarding.initial.row.shoulder'], hip: tr['onboarding.initial.row.hip'],
  chest: tr['onboarding.initial.row.chest'], forearm: tr['onboarding.initial.row.forearm'],
};

export default function Day90Route() {
  return <ErrorBoundary onHome={() => router.replace('/')}><Day90 /></ErrorBoundary>;
}

function Day90() {
  const [confirming, setConfirming] = useState(false);
  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => ({
    report: await loadDay90Report(tx, s.clock.todayKey()),
    todayKey: s.clock.todayKey(),
  })), []));

  const complete = useCommand(async (s) => {
    const id = q.data?.report?.programId;
    if (!id) return;
    await s.db.withTransaction((tx) => completeProgram(tx, s.clock, id, s.clock.todayKey()));
  });

  if (q.loading) return <Screen><Skeleton height={28} width="50%" /><Card><Skeleton height={160} /></Card></Screen>;
  if (q.error) return <Screen><ErrorBar message={q.error.message} onRetry={q.reload} /></Screen>;
  const r = q.data?.report;
  if (!r) {
    return <Screen><Button label={t('home.empty.cta')} kind="primary" onPress={() => router.push('/onboarding')} /></Screen>;
  }
  const todayKey = q.data!.todayKey;
  const start = dateTr(addDays(r.day90Key, -(r.day.durationDays - 1) - r.day.pausedDays), todayKey);

  return (
    <Screen>
      <Text variant="title">{t('report.title')}</Text>
      <Row wrap>
        {r.isPreview ? <Badge tone="warning" label={t('report.preview', { day: r.day.day })} /> : null}
        {r.isCompleted ? <Badge tone="primary" label={t('report.completedOn', { date: dateTr(r.day90Key, todayKey) })} /> : null}
        <Badge label={t('report.period', { start, end: dateTr(r.day90Key, todayKey) })} />
        {r.day.pausedDays > 0 ? <Badge label={`${r.day.pausedDays} gün donduruldu`} /> : null}
      </Row>
      {/* R123.1: raporun ne OLMADIĞI açıkça yazılır. */}
      <Text variant="caption" color="muted">{t('report.disclaimer')}</Text>

      <Text variant="heading">{t('report.section.weight')}</Text>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="title">{t('report.row', { from: num(r.weight.baselineKg, 1, 'kg'), to: num(r.weight.finalKg, 1, 'kg') })}</Text>
          {r.weight.deltaKg !== null ? <Badge tone="primary" label={t('report.delta.kg', { delta: signed(r.weight.deltaKg, 1) })} /> : null}
        </Row>
        <Text variant="caption" color="faint">{t('report.weight.baselineHint')}</Text>
        <Text variant="caption" color="faint">{t('report.weight.finalHint')}</Text>
        {r.weight.slopeKgPerWeek !== null
          ? <Text variant="caption" color="muted">{t('report.weight.slope', { delta: signed(r.weight.slopeKgPerWeek, 2) })}</Text>
          : <Text variant="caption" color="faint">{t('dashboard.kpi.trend.insufficient')}</Text>}
      </Card>

      <Text variant="heading">{t('report.section.body')}</Text>
      <Card>
        {r.sites.map((s) => <SiteRow key={s.site} label={SITE_LABEL[s.site] ?? s.site} s={s} />)}
        <Divider />
        <Row style={{ justifyContent: 'space-between' }}>
          <Text>{t('report.ratio.title')}</Text>
          <Text>{t('report.row', { from: r.ratio.baseline?.toFixed(2) ?? UNKNOWN, to: r.ratio.final?.toFixed(2) ?? UNKNOWN })}</Text>
        </Row>
        {r.ratio.delta !== null ? <Row><Badge label={signed(r.ratio.delta, 2)} /></Row> : null}
        <Divider />
        {/* Biceps baseline yoksa CTA; 0 cm HİÇBİR koşulda basılmaz (R96.3, AT-12). */}
        {r.biceps
          ? <SiteRow label={tr['dashboard.kpi.biceps.title']} s={r.biceps} />
          : (
            <View style={{ gap: space.xs }}>
              <Text color="muted">{`${tr['dashboard.kpi.biceps.title']}: ${UNKNOWN}`}</Text>
              <Button label={tr['dashboard.kpi.biceps.cta']} kind="ghost"
                onPress={() => router.push('/measurements/new?site=bicepsFlexed')} />
            </View>
          )}
      </Card>

      <Text variant="heading">{t('report.section.training')}</Text>
      <Card>
        {/* Kısmi, tam'a DAHİL DEĞİL — dört ayrı sayı (R103.4). */}
        <Text>{t('report.adherence', r.adherence)}</Text>
      </Card>

      <Text variant="heading">{t('report.section.prs')}</Text>
      <Card>
        <Text>{t('report.prs.count', { n: r.prs.count })}</Text>
        {r.prs.bestE1rm !== null ? (
          <Row wrap>
            <Text variant="caption" color="muted">{t('report.prs.bestE1rm', { kg: num(r.prs.bestE1rm, 1) })}</Text>
            <Badge tone="estimate" label={t('pr.estimateBadge')} />
          </Row>
        ) : null}
      </Card>

      {complete.error ? <ErrorBar details={complete.error.message} onRetry={q.reload} /> : null}
      {r.canComplete ? (
        <View style={{ gap: space.xs }}>
          <Button label={t('report.complete.button')} kind="primary" onPress={() => setConfirming(true)} />
          <Text variant="caption" color="faint">{t('report.complete.hint')}</Text>
        </View>
      ) : null}

      <ConfirmDialog
        visible={confirming}
        title={t('report.complete.button')}
        body={t('report.complete.confirm')}
        confirmLabel={t('report.complete.button')}
        cancelLabel={t('common.cancel')}
        busy={complete.busy}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => { if (await complete.run()) { setConfirming(false); q.reload(); } }}
      />
      <View style={{ height: space.xxl }} />
    </Screen>
  );
}

function SiteRow({ label, s }: { label: string; s: SiteReport }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={{ flex: 1 }}>{label}</Text>
      {s.baselineCm === null && s.finalCm === null
        ? <Text variant="caption" color="faint">{t('report.noData')}</Text>
        : (
          <Row>
            <Text>{t('report.row', { from: num(s.baselineCm, 1), to: num(s.finalCm, 1) })}</Text>
            {s.deltaCm !== null ? <Badge label={t('report.delta.cm', { delta: signed(s.deltaCm, 1) })} /> : null}
          </Row>
        )}
    </Row>
  );
}

const signed = (v: number, d: number) => `${v > 0 ? '+' : ''}${v.toFixed(d)}`;

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
