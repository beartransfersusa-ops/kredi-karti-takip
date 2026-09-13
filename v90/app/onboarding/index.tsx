// Onboarding — docs/v90/06-ux-flows.md B.1–B.4.
//
// Kaldığı adım DB'den TÜRETİLİR: yarım kalan onboarding hiçbir adımı iki kez
// sormaz. Bilinmeyen değer boş bırakılır ve NULL yazılır; `0` reddedilir
// (R119.3, R119.4).
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import initialProfileJson from '../../data/initial-profile.json';
import presetsJson from '../../data/equipment-presets.json';
import { newId } from '../../src/platform/id.ts';
import { evaluate } from '../../src/domain/measurements/MeasurementQuality.ts';
import type { EquipmentTag, Joint, SkillLevel } from '../../src/domain/types.ts';
import { readOnboardingState, stepNumber, validateCm, validateKg } from '../../src/features/profile/onboarding.ts';
import type { OnboardingStep } from '../../src/features/profile/onboarding.ts';
import {
  saveBiceps, saveEquipmentAndFinish, saveInitialValues, saveTrainingProfile, startProgram,
} from '../../src/features/profile/onboardingCommands.ts';
import type { GymType } from '../../src/features/profile/profileQuery.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, NumericStepper, Row, Screen, Segmented, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../src/ui/theme.ts';
import { t, tr, WEEKDAYS_SHORT_TR } from '../../src/ui/i18n/index.ts';

const PRESETS = (presetsJson as { presets: Record<GymType, EquipmentTag[]> }).presets;
const INITIAL = initialProfileJson as {
  profile: { heightCm: number };
  weightKg: number;
  measurementsCm: Record<string, number>;
};

const SITES = ['waist', 'abdomen', 'shoulder', 'hip', 'chest', 'forearm'] as const;
type Site = typeof SITES[number];

const SITE_LABEL: Record<Site, string> = {
  waist: tr['onboarding.initial.row.waist'],
  abdomen: tr['onboarding.initial.row.abdomen'],
  shoulder: tr['onboarding.initial.row.shoulder'],
  hip: tr['onboarding.initial.row.hip'],
  chest: tr['onboarding.initial.row.chest'],
  forearm: tr['onboarding.initial.row.forearm'],
};

const JOINTS: Joint[] = ['shoulder', 'elbow', 'wrist', 'lowerBack', 'hip', 'knee', 'ankle'];
const JOINT_LABEL: Record<Joint, string> = {
  shoulder: 'Omuz', elbow: 'Dirsek', wrist: 'Bilek',
  lowerBack: 'Bel', hip: 'Kalça', knee: 'Diz', ankle: 'Ayak bileği',
};

export default function OnboardingRoute() {
  return <ErrorBoundary onHome={() => router.replace('/')}><Onboarding /></ErrorBoundary>;
}

function Onboarding() {
  const q = useDbQuery(useCallback((s) => s.db.withTransaction(readOnboardingState), []));
  const [override, setOverride] = useState<OnboardingStep | null>(null);

  if (q.loading) return <Screen><Skeleton height={24} width="50%" /><Card><Skeleton height={160} /></Card></Screen>;
  if (q.error || !q.data) return <Screen><ErrorBar message={q.error?.message} onRetry={q.reload} /></Screen>;

  const step = override ?? q.data.step;
  const advance = (next: OnboardingStep) => { setOverride(next); q.reload(); };

  if (step === 'done') return <FinishStep onDone={() => router.replace('/')} />;

  const { index, total } = stepNumber(step);
  return (
    <Screen>
      <Text variant="caption" color="faint">{`${index} / ${total}`}</Text>
      {step === 'training' ? <TrainingStep onNext={() => advance('initialValues')} /> : null}
      {step === 'initialValues' ? <InitialValuesStep onNext={() => advance('biceps')} /> : null}
      {step === 'biceps' ? <BicepsStep onNext={() => advance('equipment')} /> : null}
      {step === 'equipment'
        ? <EquipmentStep gymType={q.data.gymType ?? 'fullCommercialGym'} onNext={() => advance('done')} />
        : null}
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────── B.1 Training

function TrainingStep({ onNext }: { onNext: () => void }) {
  const [experience, setExperience] = useState<SkillLevel>('intermediate');
  const [gymType, setGymType] = useState<GymType>('fullCommercialGym');
  const [minutes, setMinutes] = useState<number | null>(60);
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [sleep, setSleep] = useState<number | null>(8);
  const [pain, setPain] = useState<Joint[]>([]);

  const save = useCommand(async (s) => {
    await s.db.withTransaction((tx) => saveTrainingProfile(tx, s.clock, newId, {
      experience, gymType, typicalWorkoutMinutes: minutes,
      preferredWorkoutDays: days, sleepTargetHours: sleep, painAreas: pain,
    }));
  });

  return (
    <>
      <Text variant="title">{t('onboarding.training.title')}</Text>
      {/* Bu bilgiler programı DEĞİŞTİRMEZ; önerileri ve planlamayı ayarlar (R120.2). */}
      <Text color="muted">{t('onboarding.training.subtitle')}</Text>

      <Card>
        <Text variant="label" color="muted">{t('onboarding.training.experience.title')}</Text>
        <Segmented<SkillLevel>
          value={experience}
          options={[
            { value: 'beginner', label: t('onboarding.training.experience.beginner') },
            { value: 'intermediate', label: t('onboarding.training.experience.intermediate') },
            { value: 'advanced', label: t('onboarding.training.experience.advanced') },
          ]}
          onChange={setExperience}
        />
      </Card>

      <Card>
        <Text variant="label" color="muted">{t('onboarding.training.gymType.title')}</Text>
        <Segmented<GymType>
          value={gymType}
          options={[
            { value: 'fullCommercialGym', label: t('onboarding.training.gymType.fullCommercialGym') },
            { value: 'homeGym', label: t('onboarding.training.gymType.homeGym') },
            { value: 'limitedGym', label: t('onboarding.training.gymType.limitedGym') },
          ]}
          onChange={setGymType}
        />
      </Card>

      <Card>
        <NumericStepper
          label={t('onboarding.training.minutes.title')}
          hint={t('onboarding.training.minutes.hint')}
          value={minutes} onChange={setMinutes} step={5} min={15} max={240} decimals={0}
        />
      </Card>

      <Card>
        <Text variant="label" color="muted">{t('onboarding.training.days.title')}</Text>
        <Row wrap>
          {WEEKDAYS_SHORT_TR.map((label, i) => (
            <Button
              key={label}
              label={label}
              kind={days.includes(i) ? 'primary' : 'secondary'}
              onPress={() => setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()))}
            />
          ))}
        </Row>
        <Text variant="caption" color="faint">{t('onboarding.training.days.hint')}</Text>
      </Card>

      <Card>
        <NumericStepper
          label={t('onboarding.training.sleep.title')}
          value={sleep} onChange={setSleep} step={0.5} min={4} max={12} decimals={1}
        />
      </Card>

      <Card>
        <Text variant="label" color="muted">{t('onboarding.training.pain.title')}</Text>
        <Row wrap>
          <Button
            label={t('onboarding.training.pain.none')}
            kind={pain.length === 0 ? 'primary' : 'secondary'}
            onPress={() => setPain([])}
          />
          {JOINTS.map((j) => (
            <Button
              key={j}
              label={JOINT_LABEL[j]}
              kind={pain.includes(j) ? 'primary' : 'secondary'}
              onPress={() => setPain((v) => (v.includes(j) ? v.filter((x) => x !== j) : [...v, j]))}
            />
          ))}
        </Row>
        <Text variant="caption" color="faint">{t('onboarding.training.pain.hint')}</Text>
      </Card>

      {save.error ? <ErrorBar details={save.error.message} onRetry={() => void save.run()} /> : null}
      <Button label={t('common.next')} kind="primary" busy={save.busy}
        onPress={async () => { if (await save.run()) onNext(); }} />
    </>
  );
}

// ──────────────────────────────────────────────────────── B.2 Başlangıç değerleri

function InitialValuesStep({ onNext }: { onNext: () => void }) {
  const [mode, setMode] = useState<'prefilled' | 'blank' | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [cm, setCm] = useState<Partial<Record<Site, number | null>>>({});
  const [invalid, setInvalid] = useState<string | null>(null);

  const save = useCommand(async (s) => {
    // Girişler burada doğrulanır: 0 reddedilir, boş NULL olur (R119.4).
    const h = validateCm(height);
    const w = validateKg(weight);
    if (!h.ok) throw new Error(tr[h.messageKey]);
    if (!w.ok) throw new Error(tr[w.messageKey]);
    const measurements: Partial<Record<Site, number | null>> = {};
    for (const site of SITES) {
      const v = validateCm(cm[site] ?? null);
      if (!v.ok) throw new Error(`${SITE_LABEL[site]}: ${tr[v.messageKey]}`);
      measurements[site] = v.value;
    }
    await s.db.withTransaction((tx) => saveInitialValues(tx, s.clock, newId, {
      heightCm: h.value, weightKg: w.value, measurementsCm: measurements,
    }));
  });

  const usePrefilled = () => {
    setMode('prefilled');
    setHeight(INITIAL.profile.heightCm);
    setWeight(INITIAL.weightKg);
    setCm(Object.fromEntries(SITES.map((s) => [s, INITIAL.measurementsCm[s] ?? null])));
    setInvalid(null);
  };

  if (mode === null) {
    return (
      <>
        <Text variant="title">{t('onboarding.initial.title')}</Text>
        <Text color="muted">{t('onboarding.initial.subtitle')}</Text>
        <Button label={t('onboarding.initial.usePrefilled')} kind="primary" onPress={usePrefilled} />
        <Button label={t('onboarding.initial.enterMyself')} onPress={() => { setMode('blank'); setCm({}); }} />
      </>
    );
  }

  return (
    <>
      <Text variant="title">{t('onboarding.initial.title')}</Text>
      <Text variant="caption" color="faint">{t('onboarding.initial.emptyHint')}</Text>

      <Card>
        <NumericStepper label={t('onboarding.initial.row.height')} value={height} onChange={setHeight}
          step={1} min={0} max={299} decimals={0} />
        <NumericStepper label={t('onboarding.initial.row.weight')} value={weight} onChange={setWeight}
          step={0.5} min={0} max={400} decimals={1} />
      </Card>

      <Card>
        {SITES.map((site) => (
          <NumericStepper
            key={site}
            label={SITE_LABEL[site]}
            value={cm[site] ?? null}
            onChange={(v) => setCm((prev) => ({ ...prev, [site]: v }))}
            step={0.5} min={0} max={299} decimals={1}
          />
        ))}
      </Card>

      {/* Flexed biceps BİLİNMİYOR — sonraki adımda sorulur (R119.2). */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text color="muted">{t('onboarding.initial.row.bicepsFlexed')}</Text>
          <Badge tone="warning" label={t('onboarding.initial.bicepsUnknown')} />
        </Row>
      </Card>

      {invalid ? <ErrorBar message={invalid} /> : null}
      {save.error ? <ErrorBar message={save.error.message} onRetry={() => void save.run()} /> : null}
      <Button label={t('onboarding.initial.confirm')} kind="primary" busy={save.busy}
        onPress={async () => { setInvalid(null); if (await save.run()) onNext(); }} />
    </>
  );
}

// ───────────────────────────────────────────────────────────── B.3 Biceps

function BicepsStep({ onNext }: { onNext: () => void }) {
  const [mode, setMode] = useState<'separate' | 'single' | 'later'>('separate');
  const [left, setLeft] = useState<number[]>([]);
  const [right, setRight] = useState<number[]>([]);
  const [single, setSingle] = useState<number[]>([]);

  const save = useCommand(async (s) => {
    await s.db.withTransaction((tx) => saveBiceps(tx, s.clock, newId, {
      mode,
      samples: mode === 'separate'
        ? { bicepsLeftFlexed: left, bicepsRightFlexed: right }
        : mode === 'single' ? { bicepsFlexed: single } : {},
    }, (samples) => {
      const q = evaluate(samples);
      return { finalCm: q.finalValueCm, aggregation: q.aggregation };
    }));
  });

  return (
    <>
      <Text variant="title">{t('onboarding.biceps.title')}</Text>
      <Text color="muted">{t('onboarding.biceps.why')}</Text>
      <Card>
        {/* Ölçüm rehberi (R97.1, R97.2): her seferinde aynı pozisyon. */}
        <Text variant="label" color="muted">{t('measurement.guide.title')}</Text>
        <Text variant="caption" color="muted">
          Kol bükülü (flexed), her seferinde aynı pozisyon; en kalın nokta.
        </Text>
      </Card>

      <Segmented<'separate' | 'single' | 'later'>
        value={mode}
        options={[
          { value: 'separate', label: t('onboarding.biceps.mode.separate') },
          { value: 'single', label: t('onboarding.biceps.mode.single') },
          { value: 'later', label: t('onboarding.biceps.mode.later') },
        ]}
        onChange={setMode}
      />

      {mode === 'separate' ? (
        <>
          <SampleGroup label={t('onboarding.biceps.left')} samples={left} onChange={setLeft} />
          <SampleGroup label={t('onboarding.biceps.right')} samples={right} onChange={setRight} />
        </>
      ) : null}
      {mode === 'single' ? (
        <SampleGroup label={t('onboarding.biceps.single')} samples={single} onChange={setSingle} />
      ) : null}
      {mode === 'later' ? (
        <Card tone="warning"><Text variant="caption">{t('onboarding.biceps.laterHint')}</Text></Card>
      ) : null}

      {save.error ? <ErrorBar message={save.error.message} onRetry={() => void save.run()} /> : null}
      <Button
        label={mode === 'later' ? t('common.skip') : t('onboarding.biceps.save')}
        kind="primary" busy={save.busy}
        disabled={mode === 'separate' ? left.length === 0 || right.length === 0
          : mode === 'single' ? single.length === 0 : false}
        onPress={async () => { if (await save.run()) onNext(); }}
      />
    </>
  );
}

/**
 * 1–3 örnek. İki örnek arası fark eşiği aşarsa üçüncü ÖNERİLİR ama zorunlu
 * değildir (R97.3, R97.4).
 */
function SampleGroup(p: { label: string; samples: number[]; onChange: (v: number[]) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const quality = p.samples.length > 0 ? evaluate(p.samples) : null;

  return (
    <Card>
      <Text variant="heading">{p.label}</Text>
      {p.samples.map((v, i) => (
        <Row key={`${i}-${v}`} style={{ justifyContent: 'space-between' }}>
          <Text variant="caption" color="muted">{`${i + 1}. ölçüm`}</Text>
          <Text>{`${v} cm`}</Text>
        </Row>
      ))}
      {p.samples.length < 3 ? (
        <>
          <NumericStepper
            label={p.samples.length === 0 ? t('measurement.sample.1')
              : p.samples.length === 1 ? t('measurement.sample.2') : t('measurement.sample.3')}
            value={draft} onChange={setDraft} step={0.5} min={0} max={299} decimals={1}
          />
          <Button
            label={t('common.add')} disabled={draft === null || draft <= 0}
            onPress={() => { if (draft) { p.onChange([...p.samples, draft]); setDraft(null); } }}
          />
        </>
      ) : null}
      {quality ? (
        <Row wrap>
          <Badge label={
            quality.aggregation === 'single' ? t('measurement.final.single', { value: quality.finalValueCm })
              : quality.aggregation === 'mean' ? t('measurement.final.mean', { value: quality.finalValueCm })
                : t('measurement.final.median', { value: quality.finalValueCm })} />
          {quality.recommendThird ? <Badge tone="warning" label={t('measurement.sample.3')} /> : null}
        </Row>
      ) : null}
      {p.samples.length === 1 ? (
        <Text variant="caption" color="faint">{t('measurement.hint.second')}</Text>
      ) : null}
    </Card>
  );
}

// ───────────────────────────────────────────────────────────── B.4 Ekipman

function EquipmentStep({ gymType, onNext }: { gymType: GymType; onNext: () => void }) {
  const [selected, setSelected] = useState<EquipmentTag[]>(PRESETS[gymType]);
  const [preset, setPreset] = useState<GymType | 'custom'>(gymType);
  const all = PRESETS.fullCommercialGym;

  const save = useCommand(async (s) => {
    await s.db.withTransaction(async (tx) => {
      await saveEquipmentAndFinish(tx, s.clock, newId, preset, selected);
      await startProgram(tx, s.clock, newId);
    });
    // Katalog seçilebilirliği ekipmana bağlı; önbellek tazelenir.
    await s.catalog.reload();
  });

  const toggle = (tag: EquipmentTag) => {
    // `bodyweightOnly` her zaman mevcuttur; kapatılamaz (02 §11.4).
    if (tag === 'bodyweightOnly') return;
    setSelected((v) => (v.includes(tag) ? v.filter((x) => x !== tag) : [...v, tag]));
    setPreset('custom');
  };

  return (
    <>
      <Text variant="title">{t('onboarding.equipment.title')}</Text>
      <Text color="muted">{t('onboarding.equipment.presetHint')}</Text>
      {preset === 'custom' ? <Row><Badge label={t('onboarding.equipment.customBadge')} /></Row> : null}

      <Card>
        <View style={{ gap: space.xs }}>
          {all.map((tag) => (
            <Row key={tag} style={{ justifyContent: 'space-between' }}>
              <Text style={{ flex: 1 }}>{equipmentLabel(tag)}</Text>
              <Button
                label={selected.includes(tag) ? '✓' : '—'}
                kind={selected.includes(tag) ? 'primary' : 'secondary'}
                disabled={tag === 'bodyweightOnly'}
                onPress={() => toggle(tag)}
              />
            </Row>
          ))}
        </View>
      </Card>

      {save.error ? <ErrorBar details={save.error.message} onRetry={() => void save.run()} /> : null}
      <Button label={t('onboarding.equipment.finish')} kind="primary" busy={save.busy}
        onPress={async () => { if (await save.run()) onNext(); }} />
    </>
  );
}

export function equipmentLabel(tag: EquipmentTag): string {
  // Etiket adları da belgeden üretilen sözlükte (B.5 tablosu).
  const key = tag as keyof typeof tr;
  return (tr as Record<string, string>)[key] ?? tag;
}

function FinishStep({ onDone }: { onDone: () => void }) {
  return (
    <Screen>
      <Text variant="title">Hazırsın.</Text>
      <Divider />
      <Button label="Ana ekrana git" kind="primary" onPress={onDone} />
    </Screen>
  );
}
