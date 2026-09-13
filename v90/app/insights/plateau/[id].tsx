// Plato incelemesi — docs/v90/06-ux-flows.md A.8 (R104).
//
// EN ÖNEMLİ KURAL: bu ekran programı DEĞİŞTİRMEZ. "Uygula" bile yalnızca bir
// ÖNERİ kartı (recommendations) üretir; kullanıcı onayı olmadan hiçbir yük,
// tekrar ya da hacim değişmez (R104.3, R104.7). "+5 set" gibi agresif
// seçenek yoktur (R104.5).
import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { newId } from '../../../src/platform/id.ts';
import { useCommand, useDbQuery } from '../../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Skeleton, Text,
} from '../../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../../src/ui/theme.ts';
import { dateTr } from '../../../src/features/format.ts';
import { t, tr } from '../../../src/ui/i18n/index.ts';

/** R104.4 sırası SABİTTİR; yeniden sıralanamaz. */
const CHECKLIST_ORDER = [
  'recovery', 'sleep', 'adherence', 'rirAccuracy', 'technique', 'rest', 'suitability',
] as const;
type ChecklistKey = typeof CHECKLIST_ORDER[number];

const CHECKLIST_LABEL: Record<ChecklistKey, string> = {
  recovery: 'Toparlanma', sleep: 'Uyku', adherence: 'Kalori / protein uyumu',
  rirAccuracy: 'RIR doğruluğu', technique: 'Teknik', rest: 'Dinlenme süresi',
  suitability: 'Hareket uygunluğu',
};

type Suggestion = 'sameLoad' | 'repTargetAdjust' | 'substitution' | 'deload';

const SUGGESTION_LABEL: Record<Suggestion, string> = {
  sameLoad: tr['plateau.suggest.sameLoad'],
  repTargetAdjust: tr['plateau.suggest.repTargetAdjust'],
  substitution: tr['plateau.suggest.substitution'],
  deload: tr['plateau.suggest.deload'],
};

/** Öneri türü → `recommendations.kind` eşlemesi (A.8 adım 5). */
const SUGGESTION_KIND: Record<Suggestion, string> = {
  sameLoad: 'holdLoad', repTargetAdjust: 'repIncrease',
  substitution: 'substitution', deload: 'deload',
};

interface ChecklistItem { key: ChecklistKey; checked?: boolean; summaryTr?: string; status?: string }

export default function PlateauRoute() {
  return <ErrorBoundary onHome={() => router.replace('/')}><Plateau /></ErrorBoundary>;
}

function Plateau() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [applied, setApplied] = useState<Suggestion[]>([]);

  const q = useDbQuery(useCallback(async (s) => {
    const catalog = await s.catalog.all();
    return s.db.withTransaction(async (tx) => {
      const row = await tx.get<{
        id: string; exercise_id: string; side: string; detected_at_utc: string;
        exposure_session_ids_json: string; checklist_json: string;
        suggestions_json: string; status: string; resolution_note: string | null;
      }>('SELECT * FROM plateau_insights WHERE id = ?', [id]);
      if (!row) return null;

      const exposureIds = JSON.parse(row.exposure_session_ids_json) as string[];
      const exposures = exposureIds.length > 0
        ? await tx.all<{ id: string; calendar_date_key: string }>(
          `SELECT id, calendar_date_key FROM workout_sessions
           WHERE id IN (${exposureIds.map(() => '?').join(',')})
           ORDER BY calendar_date_key`, exposureIds)
        : [];

      // Her exposure'ın en iyi seti (görünen kanıt, R122.1).
      const best = exposureIds.length > 0
        ? await tx.all<{ session_id: string; effective_load_kg: number | null; reps: number; rir: number | null }>(
          `SELECT session_id, effective_load_kg, reps, rir FROM v_set_effective_load
           WHERE exercise_id = ? AND session_id IN (${exposureIds.map(() => '?').join(',')})
             AND set_type = 'working'
           ORDER BY effective_load_kg DESC, reps DESC`, [row.exercise_id, ...exposureIds])
        : [];

      return {
        row,
        exercise: catalog.get(row.exercise_id),
        exposures,
        bestBySession: new Map(best.map((b) => [b.session_id, b] as const)),
        checklist: JSON.parse(row.checklist_json) as ChecklistItem[],
        suggestions: JSON.parse(row.suggestions_json) as Suggestion[],
        todayKey: s.clock.todayKey(),
      };
    });
  }, [id]), [id]);

  const setStatus = useCommand(async (s, status: string, note?: string) => {
    await s.db.withTransaction(async (tx) => {
      const now = s.clock.nowUtc().toISOString();
      await tx.exec(
        `UPDATE plateau_insights SET status = ?, resolution_note = COALESCE(?, resolution_note),
           resolved_at_utc = CASE WHEN ? IN ('resolved','dismissed') THEN ? ELSE resolved_at_utc END
         WHERE id = ?`, [status, note ?? null, status, now, id]);
    });
  });

  const check = useCommand(async (s, key: ChecklistKey, checked: boolean) => {
    await s.db.withTransaction(async (tx) => {
      const row = await tx.get<{ checklist_json: string }>(
        'SELECT checklist_json FROM plateau_insights WHERE id = ?', [id]);
      if (!row) return;
      const items = JSON.parse(row.checklist_json) as ChecklistItem[];
      const next = items.map((i) => (i.key === key ? { ...i, checked } : i));
      await tx.exec('UPDATE plateau_insights SET checklist_json = ? WHERE id = ?',
        [JSON.stringify(next), id]);
    });
  });

  const apply = useCommand(async (s, suggestion: Suggestion) => {
    const exerciseId = q.data?.row.exercise_id;
    if (!exerciseId) return;
    await s.db.withTransaction(async (tx) => {
      const now = s.clock.nowUtc().toISOString();
      await tx.exec(
        `INSERT INTO recommendations
           (id, kind, exercise_id, proposed_json, rationale_tr, evidence_json,
            is_estimate, created_at_utc, local_date_key, time_zone)
         VALUES (?,?,?,?,?,?,0,?,?,?)`,
        [newId(), SUGGESTION_KIND[suggestion], exerciseId, JSON.stringify({}),
          // Gerekçe kullanıcıya gösterilir (R122.1): neden önerildiği görünür.
          `${tr['plateau.explain']} Öneri: ${SUGGESTION_LABEL[suggestion]}.`,
          JSON.stringify({ plateauInsightId: id }), now, s.clock.todayKey(), s.clock.timeZone()]);
    });
    setApplied((v) => [...v, suggestion]);
  });

  if (q.loading) return <Screen><Skeleton height={24} width="55%" /><Card><Skeleton height={160} /></Card></Screen>;
  if (q.error) return <Screen><ErrorBar message={q.error.message} onRetry={q.reload} /></Screen>;
  if (!q.data) {
    return <Screen><Text color="muted">Bu inceleme bulunamadı.</Text></Screen>;
  }

  const d = q.data;
  const readOnly = d.row.status === 'resolved' || d.row.status === 'dismissed';
  const name = d.exercise?.nameTr ?? d.row.exercise_id;
  const error = setStatus.error ?? check.error ?? apply.error;

  return (
    <Screen>
      <Text variant="title">{t('plateau.title', { exerciseNameTr: name })}</Text>
      {d.row.side !== 'both'
        ? <Row><Badge label={d.row.side === 'left' ? tr['pr.side.left'] : tr['pr.side.right']} /></Row>
        : null}
      <Text color="muted">{t('plateau.explain')}</Text>

      {/* Üç exposure ve her birinin en iyi seti — iddianın KANITI. */}
      <Card>
        {d.exposures.map((e) => {
          const b = d.bestBySession.get(e.id);
          return (
            <Row key={e.id} style={{ justifyContent: 'space-between' }}>
              <Text variant="caption" color="muted">{dateTr(e.calendar_date_key, d.todayKey)}</Text>
              <Text variant="caption">
                {b ? `${b.effective_load_kg ?? '—'} kg × ${b.reps}${b.rir !== null ? ` @ RIR ${b.rir}` : ''}` : '—'}
              </Text>
            </Row>
          );
        })}
      </Card>

      {error ? <ErrorBar details={error.message} onRetry={q.reload} /> : null}

      <Text variant="heading">{t('plateau.checklist.title')}</Text>
      <Card>
        {CHECKLIST_ORDER.map((key) => {
          const item = d.checklist.find((i) => i.key === key);
          const hasData = item?.summaryTr !== undefined && item.summaryTr !== '';
          return (
            <View key={key} style={{ gap: space.xs }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text variant="label">{CHECKLIST_LABEL[key]}</Text>
                  <Text variant="caption" color={hasData ? 'muted' : 'faint'}>
                    {hasData ? item.summaryTr : t('plateau.checklist.noData')}
                  </Text>
                </View>
                <Button
                  label={item?.checked ? '✓' : t('plateau.checklist.checked')}
                  kind={item?.checked ? 'primary' : 'secondary'}
                  disabled={readOnly || check.busy}
                  onPress={async () => { if (await check.run(key, !item?.checked)) q.reload(); }}
                />
              </Row>
              <Divider />
            </View>
          );
        })}
      </Card>

      <Text variant="heading">Öneriler</Text>
      <Card>
        {/* Hiçbiri otomatik uygulanmaz; her biri bir ÖNERİ kartı üretir. */}
        <Text variant="caption" color="muted">{t('plateau.noAuto')}</Text>
        {d.suggestions.map((s) => (
          <Row key={s} style={{ justifyContent: 'space-between' }}>
            <Text style={{ flex: 1 }}>{SUGGESTION_LABEL[s]}</Text>
            <Button
              label={applied.includes(s) ? 'Eklendi' : t('plateau.suggest.apply')}
              kind={applied.includes(s) ? 'secondary' : 'primary'}
              disabled={readOnly || applied.includes(s) || apply.busy}
              onPress={() => void apply.run(s)}
            />
          </Row>
        ))}
        {d.suggestions.length === 0 ? <Text color="muted">Öneri üretilmedi.</Text> : null}
      </Card>

      {readOnly ? (
        <Card><Text color="muted">{d.row.resolution_note ?? `Durum: ${d.row.status}`}</Text></Card>
      ) : (
        <Row wrap>
          {d.row.status === 'open' ? (
            <Button label={t('plateau.ack')} kind="primary" busy={setStatus.busy}
              onPress={async () => { if (await setStatus.run('acknowledged')) q.reload(); }} />
          ) : (
            <Button label={t('plateau.resolve')} kind="primary" busy={setStatus.busy}
              onPress={async () => { if (await setStatus.run('resolved')) router.back(); }} />
          )}
          <Button label={t('plateau.dismiss')} busy={setStatus.busy}
            onPress={async () => { if (await setStatus.run('dismissed')) router.back(); }} />
        </Row>
      )}
    </Screen>
  );
}
