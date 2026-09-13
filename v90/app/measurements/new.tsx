// Ölçüm ekleme — docs/v90/06-ux-flows.md B.9 (R97, R119.3).
//
// 1–3 örnek alınır; iki örnek arası fark eşiği aşarsa ÜÇÜNCÜ ÖNERİLİR ama
// zorunlu değildir (R97.3, R97.4). Final değer `MeasurementQuality` ile
// türetilir ve ham örneklerle birlikte saklanır (R97.5). 0 reddedilir.
import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { newId } from '../../src/platform/id.ts';
import { evaluate } from '../../src/domain/measurements/MeasurementQuality.ts';
import { validateCm } from '../../src/features/profile/onboarding.ts';
import { dateTr } from '../../src/features/format.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, ErrorBar, NumericStepper, Row, Screen, Segmented, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

const SITES = [
  { value: 'bicepsFlexed', label: 'Üst kol (bükülü)', group: 'arms' },
  { value: 'bicepsLeftFlexed', label: 'Sol üst kol (bükülü)', group: 'arms' },
  { value: 'bicepsRightFlexed', label: 'Sağ üst kol (bükülü)', group: 'arms' },
  { value: 'forearm', label: 'Ön kol', group: 'arms' },
  { value: 'chest', label: 'Göğüs', group: 'torso' },
  { value: 'shoulder', label: 'Omuz', group: 'torso' },
  { value: 'waist', label: 'Bel', group: 'torso' },
  { value: 'abdomen', label: 'Karın', group: 'torso' },
  { value: 'hip', label: 'Kalça', group: 'legs' },
] as const;

type SiteValue = typeof SITES[number]['value'];

const GUIDE: Partial<Record<SiteValue, string>> = {
  bicepsFlexed: 'Kol bükülü (flexed), her seferinde aynı pozisyon; en kalın nokta.',
  bicepsLeftFlexed: 'Kol bükülü (flexed), her seferinde aynı pozisyon; en kalın nokta.',
  bicepsRightFlexed: 'Kol bükülü (flexed), her seferinde aynı pozisyon; en kalın nokta.',
  waist: 'Göbek deliği hizası; nefes ver, karnını içeri çekme.',
  abdomen: 'En geniş nokta; mezura yere paralel.',
  shoulder: 'Omuz deltoidlerinin en geniş yeri; kollar yanda.',
};

export default function MeasurementRoute() {
  return <ErrorBoundary onHome={() => router.back()}><NewMeasurement /></ErrorBoundary>;
}

function NewMeasurement() {
  const params = useLocalSearchParams<{ site?: string }>();
  const initial = SITES.find((s) => s.value === params.site)?.value ?? 'bicepsFlexed';
  const [site, setSite] = useState<SiteValue>(initial);
  const [samples, setSamples] = useState<number[]>([]);
  const [draft, setDraft] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<string | null>(null);

  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => ({
    previous: await tx.get<{ final_value_cm: number; local_date_key: string }>(
      `SELECT final_value_cm, local_date_key FROM body_measurements
       WHERE site = ? ORDER BY local_date_key DESC, measured_at_utc DESC LIMIT 1`, [site]),
    todayKey: s.clock.todayKey(),
  })), [site]), [site]);

  const save = useCommand(async (s) => {
    const quality = evaluate(samples);
    await s.db.withTransaction(async (tx) => {
      const now = s.clock.nowUtc().toISOString();
      const id = newId();
      // İlk kayıt aynı zamanda baseline'dır; sonrakiler değildir.
      const isFirst = !(await tx.get<{ n: number }>(
        'SELECT COUNT(*) n FROM body_measurements WHERE site = ?', [site]))?.n;
      await tx.exec(
        `INSERT INTO body_measurements
           (id, measured_at_utc, local_date_key, time_zone, site, final_value_cm, aggregation, is_baseline)
         VALUES (?,?,?,?,?,?,?,?)`,
        [id, now, s.clock.todayKey(), s.clock.timeZone(), site,
          quality.finalValueCm, quality.aggregation, isFirst ? 1 : 0]);
      for (const [i, value] of samples.entries()) {
        await tx.exec(
          'INSERT INTO measurement_samples (id, measurement_id, sample_index, value_cm) VALUES (?,?,?,?)',
          [newId(), id, i + 1, value]);
      }
    });
  });

  const quality = samples.length > 0 ? evaluate(samples) : null;
  const previous = q.data?.previous;

  const add = () => {
    const v = validateCm(draft);
    if (!v.ok) { setInvalid(tr[v.messageKey]); return; }
    if (v.value === null) return;
    setInvalid(null);
    setSamples((s) => [...s, v.value!]);
    setDraft(null);
  };

  return (
    <Screen>
      <Segmented<'arms' | 'torso' | 'legs'>
        value={SITES.find((s) => s.value === site)!.group}
        options={[
          { value: 'arms', label: t('measurement.group.arms') },
          { value: 'torso', label: t('measurement.group.torso') },
          { value: 'legs', label: t('measurement.group.legs') },
        ]}
        onChange={(g) => {
          const first = SITES.find((s) => s.group === g);
          if (first) { setSite(first.value); setSamples([]); setDraft(null); }
        }}
      />

      <Card>
        <Row wrap>
          {SITES.filter((s) => s.group === SITES.find((x) => x.value === site)!.group).map((s) => (
            <Button
              key={s.value} label={s.label}
              kind={s.value === site ? 'primary' : 'secondary'}
              onPress={() => { setSite(s.value); setSamples([]); setDraft(null); }}
            />
          ))}
        </Row>
      </Card>

      {GUIDE[site] ? (
        <Card>
          <Text variant="label" color="muted">{t('measurement.guide.title')}</Text>
          <Text variant="caption" color="muted">{GUIDE[site]}</Text>
        </Card>
      ) : null}

      <Card>
        {q.loading ? <Skeleton height={14} width="50%" /> : (
          <Text variant="caption" color="muted">
            {previous
              ? `Son kayıt: ${previous.final_value_cm} cm · ${dateTr(previous.local_date_key, q.data!.todayKey)}`
              : t('measurement.noPrev')}
          </Text>
        )}

        {samples.map((v, i) => (
          <Row key={`${i}-${v}`} style={{ justifyContent: 'space-between' }}>
            <Text variant="caption" color="muted">{`${i + 1}. ölçüm`}</Text>
            <Text>{`${v} cm`}</Text>
          </Row>
        ))}

        {samples.length < 3 ? (
          <>
            <NumericStepper
              label={samples.length === 0 ? t('measurement.sample.1')
                : samples.length === 1 ? t('measurement.sample.2') : t('measurement.sample.3')}
              value={draft} onChange={setDraft} step={0.5} min={0} max={299} decimals={1}
            />
            <Button label={t('common.add')} onPress={add} disabled={draft === null} />
          </>
        ) : null}

        {samples.length === 1 ? (
          <Text variant="caption" color="faint">{t('measurement.hint.second')}</Text>
        ) : null}

        {invalid ? <ErrorBar message={invalid} /> : null}
      </Card>

      {quality ? (
        <Card tone={quality.recommendThird ? 'warning' : 'default'}>
          <Row wrap>
            <Badge tone="primary" label={
              quality.aggregation === 'single' ? t('measurement.final.single', { value: quality.finalValueCm })
                : quality.aggregation === 'mean' ? t('measurement.final.mean', { value: quality.finalValueCm })
                  : t('measurement.final.median', { value: quality.finalValueCm })} />
            {previous ? (
              <Badge label={t('measurement.deltaPrev', {
                delta: (quality.finalValueCm - previous.final_value_cm).toFixed(1),
              })} />
            ) : null}
          </Row>
          {/* Üçüncü ölçüm ÖNERİ'dir; kullanıcı yine de kaydedebilir (R97.4). */}
          {quality.recommendThird && samples.length === 2 ? (
            <Text variant="caption" color="muted">
              {`İki ölçüm arasındaki fark ${quality.spreadCm} cm; üçüncü bir ölçüm öneriyoruz.`}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {save.error ? <ErrorBar details={save.error.message} onRetry={() => void save.run()} /> : null}

      <Button
        label={samples.length === 1 ? t('measurement.saveSingle') : t('common.save')}
        kind="primary" busy={save.busy} disabled={samples.length === 0}
        onPress={async () => { if (await save.run()) router.back(); }}
      />
      <View style={{ height: space.xl }} />
    </Screen>
  );
}
