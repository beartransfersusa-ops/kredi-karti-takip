// Gym Equipment — docs/v90/06-ux-flows.md B.5 (R98).
//
// Ekipman değişikliği DEVAM EDEN antrenmanı etkilemez; sonraki antrenmanda
// uygulanır. `bodyweightOnly` kapatılamaz (02 §11.4).
import { useCallback, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import presetsJson from '../../data/equipment-presets.json';
import { newId } from '../../src/platform/id.ts';
import { isAvailable } from '../../src/domain/exercise/SubstitutionEngine.ts';
import type { EquipmentTag } from '../../src/domain/types.ts';
import { readEquipmentProfile } from '../../src/features/profile/profileQuery.ts';
import type { GymType } from '../../src/features/profile/profileQuery.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Segmented, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

const PRESETS = (presetsJson as { presets: Record<GymType, EquipmentTag[]> }).presets;
const ALL = PRESETS.fullCommercialGym;

export default function EquipmentRoute() {
  return <ErrorBoundary onHome={() => router.back()}><Equipment /></ErrorBoundary>;
}

function Equipment() {
  const [selected, setSelected] = useState<EquipmentTag[] | null>(null);
  const [preset, setPreset] = useState<GymType | 'custom'>('custom');
  const [confirmPreset, setConfirmPreset] = useState<GymType | null>(null);

  const q = useDbQuery(useCallback(async (s) => {
    const catalog = await s.catalog.all();
    return s.db.withTransaction(async (tx) => {
      const profile = await readEquipmentProfile(tx);
      const active = await tx.get<{ id: string }>(`SELECT id FROM workout_sessions WHERE status='active'`);
      // Programdaki hareketler: şablonlardan.
      const rows = await tx.all<{ exercise_id: string }>(
        'SELECT DISTINCT exercise_id FROM template_exercises');
      return {
        profile,
        hasActiveSession: !!active,
        programExercises: rows.map((r) => catalog.get(r.exercise_id)).filter((e) => e !== undefined),
      };
    });
  }, []));

  const save = useCommand(async (s, tags: EquipmentTag[], p: GymType | 'custom') => {
    await s.db.withTransaction(async (tx) => {
      const now = s.clock.nowUtc().toISOString();
      const existing = await tx.get<{ id: string }>('SELECT id FROM equipment_profiles LIMIT 1');
      if (existing) {
        await tx.exec('UPDATE equipment_profiles SET preset=?, available_json=?, updated_at_utc=? WHERE id=?',
          [p, JSON.stringify(tags), now, existing.id]);
      } else {
        await tx.exec('INSERT INTO equipment_profiles (id, preset, available_json, updated_at_utc) VALUES (?,?,?,?)',
          [newId(), p, JSON.stringify(tags), now]);
      }
    });
    await s.catalog.reload();
  });

  const current = selected ?? q.data?.profile?.available ?? PRESETS.fullCommercialGym;

  // Etki önizlemesi: bu ekipmanla programdaki kaç hareket yapılamıyor?
  const blocked = useMemo(
    () => (q.data?.programExercises ?? []).filter((e) => !isAvailable(e, current)).length,
    [q.data, current]);

  if (q.loading) return <Screen><Skeleton height={24} width="40%" /><Card><Skeleton height={200} /></Card></Screen>;
  if (q.error) return <Screen><ErrorBar message={q.error.message} onRetry={q.reload} /></Screen>;

  const applyPreset = (p: GymType) => {
    setSelected(PRESETS[p]);
    setPreset(p);
    setConfirmPreset(null);
  };

  const toggle = (tag: EquipmentTag) => {
    if (tag === 'bodyweightOnly') return;              // her zaman mevcut
    setSelected(current.includes(tag) ? current.filter((x) => x !== tag) : [...current, tag]);
    setPreset('custom');
  };

  return (
    <Screen>
      <Segmented<GymType | 'custom'>
        value={preset}
        options={[
          { value: 'fullCommercialGym', label: t('settings.equipment.preset.fullCommercialGym') },
          { value: 'homeGym', label: t('settings.equipment.preset.homeGym') },
          { value: 'limitedGym', label: t('settings.equipment.preset.limitedGym') },
          { value: 'custom', label: t('settings.equipment.preset.custom') },
        ]}
        onChange={(v) => { if (v !== 'custom') setConfirmPreset(v); else setPreset('custom'); }}
      />

      <Card tone={blocked > 0 ? 'warning' : 'default'}>
        <Text variant="caption">
          {blocked > 0
            ? t('settings.equipment.impact', { n: blocked })
            : t('settings.equipment.impactNone')}
        </Text>
        {q.data?.hasActiveSession
          ? <Text variant="caption" color="faint">{t('settings.equipment.activeSessionNote')}</Text>
          : null}
      </Card>

      <Card>
        <View style={{ gap: space.xs }}>
          {ALL.map((tag) => (
            <Row key={tag} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text>{(tr as Record<string, string>)[tag] ?? tag}</Text>
                {tag === 'bodyweightOnly'
                  ? <Text variant="caption" color="faint">her zaman mevcut</Text>
                  : null}
              </View>
              <Button
                label={current.includes(tag) ? '✓' : '—'}
                kind={current.includes(tag) ? 'primary' : 'secondary'}
                disabled={tag === 'bodyweightOnly'}
                onPress={() => toggle(tag)}
              />
            </Row>
          ))}
        </View>
      </Card>

      {save.error ? <ErrorBar details={save.error.message} onRetry={() => void save.run(current, preset)} /> : null}
      <Divider />
      <Row>
        <Badge label={`${current.length} / ${ALL.length}`} />
      </Row>
      <Button label={t('common.save')} kind="primary" busy={save.busy}
        onPress={async () => { if (await save.run(current, preset)) router.back(); }} />

      <ConfirmDialog
        visible={confirmPreset !== null}
        title={t('settings.equipment.preset.custom')}
        body={t('settings.equipment.presetReplaceConfirm')}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        onCancel={() => setConfirmPreset(null)}
        onConfirm={() => { if (confirmPreset) applyPreset(confirmPreset); }}
      />
    </Screen>
  );
}
