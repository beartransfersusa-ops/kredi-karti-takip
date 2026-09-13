// İlerleme — docs/v90/06-ux-flows.md B.10 (KPI kartları), B.11 (haftalık hacim).
//
// "Sahte kesinlik yok" (R123) bu ekranın tasarım kuralıdır:
//   • yeterli veri yoksa sayı YAZILMAZ, "yetersiz veri" denir,
//   • ikincil kas katkısı TAHMİNDİR ve "~" ile "tahmin" rozetiyle gösterilir,
//   • hiçbir bilinmeyen 0 olarak gösterilmez.
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { MUSCLE_DISPLAY_GROUPS } from '../../src/domain/analytics/VolumeAnalytics.ts';
import type { MuscleGroup } from '../../src/domain/types.ts';
import { loadProgress } from '../../src/features/progress/progressQuery.ts';
import type { ProgressData } from '../../src/features/progress/progressQuery.ts';
import { dateTr, num } from '../../src/features/format.ts';
import { useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Segmented, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { radius, space, usePalette } from '../../src/ui/theme.ts';
import { t } from '../../src/ui/i18n/index.ts';

const MUSCLE_TR: Partial<Record<MuscleGroup, string>> = {
  chest: 'Göğüs', lats: 'Lat', upperBack: 'Üst sırt', lowerBack: 'Bel',
  frontDelts: 'Ön omuz', lateralDelts: 'Yan omuz', rearDelts: 'Arka omuz',
  biceps: 'Biceps', triceps: 'Triceps', forearms: 'Ön kol',
  quads: 'Quad', hamstrings: 'Hamstring', glutes: 'Kalça', calves: 'Baldır',
  abs: 'Karın', neck: 'Boyun',
};

export default function ProgressRoute() {
  return <ErrorBoundary onHome={() => router.replace('/')}><Progress /></ErrorBoundary>;
}

function Progress() {
  const [tab, setTab] = useState<'direct' | 'secondary'>('direct');
  const q = useDbQuery(useCallback(async (s) => {
    const catalog = await s.catalog.all();
    return s.db.withTransaction((tx) => loadProgress(tx, s.clock.todayKey(), catalog));
  }, []));

  if (q.loading) {
    return <Screen><Skeleton height={24} width="40%" /><Card><Skeleton height={100} /></Card><Card><Skeleton height={180} /></Card></Screen>;
  }
  if (q.error || !q.data) return <Screen><ErrorBar message={q.error?.message} onRetry={q.reload} /></Screen>;
  const d = q.data;

  return (
    <Screen>
      <WeightCard data={d} />
      <RatioCard data={d} />
      <AdherenceCard data={d} />

      <Divider />
      <Text variant="title">{t('progress.volume.title')}</Text>
      <Segmented<'direct' | 'secondary'>
        value={tab}
        options={[
          { value: 'direct', label: t('progress.volume.tab.direct') },
          { value: 'secondary', label: t('progress.volume.tab.secondary') },
        ]}
        onChange={setTab}
      />
      <Text variant="caption" color="faint">
        {tab === 'direct' ? t('progress.volume.directHint') : t('progress.volume.secondaryHint')}
      </Text>
      <VolumeList data={d} mode={tab} />

      {d.openPlateaus.length > 0 ? (
        <>
          <Divider />
          <Text variant="heading">Plato incelemeleri</Text>
          {d.openPlateaus.map((p) => (
            <Card key={p.id}>
              <Text>{t('plateau.entry', { exerciseNameTr: p.exerciseNameTr })}</Text>
              <Button label="Aç" onPress={() => router.push(`/insights/plateau/${p.id}`)} />
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function WeightCard({ data }: { data: ProgressData }) {
  const trend = data.weightSlope;
  return (
    <Card>
      <Text variant="label" color="muted">{t('dashboard.kpi.weight.title')}</Text>
      {data.weightAverage ? (
        <>
          <Text variant="title">{num(data.weightAverage.value, 1, 'kg')}</Text>
          <Text variant="caption" color="muted">{t('dashboard.kpi.weight.avg7')}</Text>
        </>
      ) : (
        // 7 günde 3'ten az tartı → ortalama YAZILMAZ (R123.1).
        <Text color="muted">{t('dashboard.kpi.trend.insufficient')}</Text>
      )}
      {trend ? (
        <Row wrap>
          <Badge label={t('dashboard.kpi.weight.slope28', { delta: trend.kgPerWeek.toFixed(2) })} />
          <Badge tone={trend.label === 'stable' ? 'neutral' : 'primary'} label={
            trend.label === 'up' ? t('dashboard.kpi.trend.up')
              : trend.label === 'down' ? t('dashboard.kpi.trend.down')
                : t('dashboard.kpi.trend.stable')} />
        </Row>
      ) : null}
    </Card>
  );
}

function RatioCard({ data }: { data: ProgressData }) {
  return (
    <Card>
      <Text variant="label" color="muted">{t('dashboard.kpi.ratio.title')}</Text>
      {data.shoulderWaist ? (
        <>
          <Text variant="title">{data.shoulderWaist.ratio.toFixed(2)}</Text>
          <Text variant="caption" color="faint">
            {`omuz ${dateTr(data.shoulderWaist.shoulderKey, data.todayKey)} · bel ${dateTr(data.shoulderWaist.waistKey, data.todayKey)}`}
          </Text>
        </>
      ) : (
        // Omuz ve bel ölçümü ±3 gün içinde eşleşmiyorsa oran GÖSTERİLMEZ (AT-11).
        <>
          <Text color="muted">{t('dashboard.kpi.empty')}</Text>
          <Button label={t('dashboard.kpi.addMeasurement')} onPress={() => router.push('/measurements/new')} />
        </>
      )}
    </Card>
  );
}

function AdherenceCard({ data }: { data: ProgressData }) {
  const a = data.adherence;
  if (!a) return null;
  return (
    <Card>
      <Text variant="label" color="muted">Bu hafta</Text>
      {/* Tam / kısmi / atlanmış / kaçırılmış AYRI gösterilir (R103.4, AT-06). */}
      <Row wrap>
        <Badge tone="primary" label={`${a.completed} tam`} />
        <Badge tone="warning" label={`${a.partial} kısmi`} />
        <Badge label={`${a.skipped} atlandı`} />
        <Badge label={`${a.missed} kaçırıldı`} />
        <Badge label={`${a.planned} planlı`} />
      </Row>
    </Card>
  );
}

function VolumeList({ data, mode }: { data: ProgressData; mode: 'direct' | 'secondary' }) {
  const c = usePalette();
  if (data.volumes.length === 0) {
    return <Card><Text color="muted">{t('progress.volume.empty')}</Text></Card>;
  }

  const grouped = MUSCLE_DISPLAY_GROUPS.find((g) => g.muscles.length > 1);
  const rows = data.volumes
    .map((v) => ({ ...v, label: MUSCLE_TR[v.muscle] ?? v.muscle, target: data.targets.get(v.muscle) }))
    .sort((a, b) => (mode === 'direct' ? b.directSets - a.directSets
      : b.secondarySetsEstimate - a.secondarySetsEstimate));

  const maxScale = Math.max(
    ...rows.map((r) => Math.max(r.target?.max ?? 0, r.directSets, r.secondarySetsEstimate)), 1);

  return (
    <Card>
      {rows.map((r) => {
        const value = mode === 'direct' ? r.directSets : r.secondarySetsEstimate;
        const overMax = r.target ? r.directSets > r.target.max : false;
        return (
          <View key={r.muscle} style={{ gap: space.xs }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row gap={space.xs}>
                <Text variant="label">{r.label}</Text>
                {r.target?.isPriority ? <Badge tone="primary" label={t('progress.volume.priority')} /> : null}
              </Row>
              <Row gap={space.xs}>
                <Text>
                  {mode === 'direct'
                    ? t('progress.volume.setsUnit', { n: value })
                    : t('progress.volume.estimateUnit', { n: value })}
                </Text>
                {/* İkincil katkı TAHMİNDİR; rozetle işaretlenir (R123.4). */}
                {mode === 'secondary' ? <Badge tone="estimate" label={t('pr.estimateBadge')} /> : null}
              </Row>
            </Row>
            <View style={{ height: 8, backgroundColor: c.surfaceAlt, borderRadius: radius.pill }}>
              <View style={{
                height: 8, borderRadius: radius.pill,
                width: `${Math.min(100, (value / maxScale) * 100)}%`,
                backgroundColor: overMax ? c.warning : c.primary,
              }} />
            </View>
            {r.target ? (
              <Text variant="caption" color="faint">
                {`${t('progress.volume.baselineMark')} ${r.target.baseline} · ${t('progress.volume.maxMark')} ${r.target.max}`}
              </Text>
            ) : null}
          </View>
        );
      })}
      {grouped ? (
        <Text variant="caption" color="faint">
          {`Not: ${grouped.labelTr} grubu ayrı satırlarda gösteriliyor (lats / üst sırt).`}
        </Text>
      ) : null}
      <Text variant="caption" color="faint">{t('progress.volume.activeExcluded')}</Text>
    </Card>
  );
}
