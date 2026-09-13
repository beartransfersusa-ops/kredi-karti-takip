// Hareketi Değiştir — docs/v90/06-ux-flows.md A.3 "Hareketi Değiştir" (R99).
//
// Ekipmanı olmayan hareketler LİSTELENMEZ (R99.2): gösterip sonra
// "yapamazsın" demek yerine hiç önerilmez. Geçmiş kaybolmaz: yeni hareket
// `original_exercise_id` ile eski aileye bağlanır (R99.5, R99.7).
import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { newId } from '../../src/platform/id.ts';
import { alternatives } from '../../src/domain/exercise/SubstitutionEngine.ts';
import type { SubstitutionCandidate } from '../../src/domain/exercise/SubstitutionEngine.ts';
import { readEquipmentProfile, readTrainingProfile } from '../../src/features/profile/profileQuery.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Segmented, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../src/ui/theme.ts';
import { t } from '../../src/ui/i18n/index.ts';

type Reason = 'equipmentBusy' | 'pain' | 'preference';

export default function SubstituteRoute() {
  return (
    <ErrorBoundary onHome={() => router.back()}>
      <Substitute />
    </ErrorBoundary>
  );
}

interface Data {
  baseName: string;
  sameIntent: SubstitutionCandidate[];
  otherIntent: SubstitutionCandidate[];
  hasEquipmentProfile: boolean;
}

function Substitute() {
  const { sessionExerciseId } = useLocalSearchParams<{ sessionExerciseId: string }>();
  const [reason, setReason] = useState<Reason | null>(null);

  const q = useDbQuery<Data | null>(useCallback(async (s) => {
    const catalog = [...(await s.catalog.selectable())];
    const relations = await s.catalog.relations();

    return s.db.withTransaction(async (tx) => {
      const row = await tx.get<{ exercise_id: string }>(
        'SELECT exercise_id FROM session_exercises WHERE id = ?', [sessionExerciseId]);
      if (!row) return null;

      const equipment = await readEquipmentProfile(tx);
      const training = await readTrainingProfile(tx);
      const available = equipment?.available ?? [];
      const painAreas = training?.painAreas ?? [];
      const experience = training?.experience;

      // "Daha önce yaptın" etiketi için geçmiş.
      const history = await tx.all<{ exercise_id: string }>(
        `SELECT DISTINCT exercise_id FROM set_logs WHERE discarded = 0`);

      const result = alternatives(row.exercise_id, catalog, {
        available,
        painAreas,
        ...(experience ? { experience } : {}),
        historyExerciseIds: new Set(history.map((h) => h.exercise_id)),
        relations,
      });

      const base = catalog.find((e) => e.id === row.exercise_id);
      return {
        baseName: base?.nameTr ?? row.exercise_id,
        // İlk 5 aday (A.3); "farklı amaç" listesi ayrı başlık altında.
        sameIntent: result.sameIntent.slice(0, 5),
        otherIntent: result.otherIntent.slice(0, 5),
        hasEquipmentProfile: available.length > 0,
      } satisfies Data;
    });
  }, [sessionExerciseId]), [sessionExerciseId]);

  const substitute = useCommand(async (s, newExerciseId: string, why: Reason | null) => {
    await s.session.substituteExercise({
      commandId: newId(), sessionExerciseId, newExerciseId,
      ...(why ? { reason: why } : {}),
    });
  });

  if (q.loading) {
    return <Screen><Skeleton height={20} width="60%" /><Card><Skeleton height={64} /></Card></Screen>;
  }
  if (q.error || !q.data) {
    return <Screen><ErrorBar message={q.error?.message} onRetry={q.reload} /></Screen>;
  }

  const pick = async (id: string) => {
    if (await substitute.run(id, reason)) router.back();
  };

  return (
    <Screen>
      <Text variant="title">{q.data.baseName}</Text>

      {!q.data.hasEquipmentProfile ? (
        <Card tone="warning">
          <Text variant="caption">
            Ekipman profilin boş; tüm hareketler listeleniyor olabilir.
          </Text>
          <Button label={t('active.substitute.editEquipment')} kind="ghost"
            onPress={() => router.push('/settings/equipment')} />
        </Card>
      ) : null}

      <View style={{ gap: space.xs }}>
        <Text variant="label" color="muted">Sebep (isteğe bağlı)</Text>
        <Segmented<Reason>
          value={reason ?? 'preference'}
          options={[
            { value: 'equipmentBusy', label: t('active.substitute.reason.equipmentBusy') },
            { value: 'pain', label: t('active.substitute.reason.pain') },
            { value: 'preference', label: t('active.substitute.reason.preference') },
          ]}
          onChange={setReason}
        />
      </View>

      {substitute.error ? <ErrorBar details={substitute.error.message} /> : null}

      {q.data.sameIntent.map((c) => (
        <CandidateCard key={c.exercise.id} candidate={c} busy={substitute.busy} onPick={() => void pick(c.exercise.id)} />
      ))}

      {q.data.otherIntent.length > 0 ? (
        <>
          <Divider />
          <Text variant="heading">{t('active.substitute.otherIntent')}</Text>
          {q.data.otherIntent.map((c) => (
            <CandidateCard key={c.exercise.id} candidate={c} busy={substitute.busy} onPick={() => void pick(c.exercise.id)} />
          ))}
        </>
      ) : null}

      {q.data.sameIntent.length === 0 && q.data.otherIntent.length === 0 ? (
        <Card>
          <Text color="muted">Ekipmanınla yapılabilecek alternatif bulunamadı.</Text>
          <Button label={t('active.substitute.editEquipment')}
            onPress={() => router.push('/settings/equipment')} />
        </Card>
      ) : null}

      <Button label={t('finish.back')} kind="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

function CandidateCard(p: { candidate: SubstitutionCandidate; busy: boolean; onPick: () => void }) {
  const { exercise, reasonsTr } = p.candidate;
  return (
    <Card>
      <Text variant="heading">{exercise.nameTr}</Text>
      <Row wrap>
        {exercise.equipment.map((e) => <Badge key={e} label={e} />)}
      </Row>
      {reasonsTr.length > 0
        ? <Text variant="caption" color="muted">{reasonsTr.join(' · ')}</Text>
        : <Text variant="caption" color="muted">{t('active.substitute.rationale')}</Text>}
      <Button label={t('active.substitute')} kind="primary" busy={p.busy} onPress={p.onPick} />
    </Card>
  );
}
