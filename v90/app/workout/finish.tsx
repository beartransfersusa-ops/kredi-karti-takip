// Bitirme ekranı — docs/v90/06-ux-flows.md A.4 (R103.1–R103.3, R113.4).
//
// Kısmi antrenman OTOMATİK olarak "tamamlandı" OLMAZ. Kullanıcı iki karardan
// birini seçer ve sıra yalnızca izin verilen nedenlerle ilerler (R88.6):
//   • Bitmiş say            → cause='partialCountedDone', sıra İLERLER
//   • Kalanı sonraki güne   → sıra İLERLEMEZ, devam planı açılır (R88.7)
import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { newId } from '../../src/platform/id.ts';
import { finishMode, allowedDateRange } from '../../src/features/active-workout/finishModel.ts';
import type { FinishMode } from '../../src/features/active-workout/finishModel.ts';
import { dateTr, elapsed, num, weekdayTr } from '../../src/features/format.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { DatePickerSheet } from '../../src/ui/components/DatePickerSheet.tsx';
import { space } from '../../src/ui/theme.ts';
import { t } from '../../src/ui/i18n/index.ts';

export default function FinishRoute() {
  return (
    <ErrorBoundary onHome={() => router.replace('/')}>
      <Finish />
    </ErrorBoundary>
  );
}

interface Summary {
  mode: FinishMode;
  sessionId: string;
  scheduledWorkoutId: string | null;
  calendarDateKey: string;
  dateOverridden: boolean;
  startedAtUtc: string;
  durationSeconds: number;
  setCount: number;
  totalVolumeKg: number | null;
  prCount: number;
  templateName: string;
  todayKey: string;
}

function Finish() {
  const params = useLocalSearchParams<{ origin?: string }>();
  const origin = params.origin === 'resumeCard' ? 'resumeCard' : 'workoutScreen';

  const q = useDbQuery<Summary | null>(useCallback(async (s) => {
    const snapshot = await s.session.hydrate();
    if (!snapshot) return null;
    const { session, exercises, setLogs } = snapshot;
    const counted = setLogs.filter((l) => l.discarded === 0);

    return s.db.withTransaction(async (tx) => {
      const template = session.workout_template_id
        ? await tx.get<{ name_tr: string }>('SELECT name_tr FROM workout_templates WHERE id = ?',
          [session.workout_template_id])
        : undefined;
      const prs = await tx.get<{ n: number }>(
        'SELECT COUNT(*) n FROM personal_records WHERE session_id = ?', [session.id]);
      const volume = await tx.get<{ v: number | null }>(
        `SELECT SUM(effective_load_kg * reps) v FROM v_set_effective_load
         WHERE session_id = ? AND set_type IN ('working','dropset','backoff')`, [session.id]);

      return {
        mode: finishMode(exercises.map((e) => ({
          id: e.id, exerciseId: e.exercise_id, status: e.status,
          plannedWorkingSets: e.planned_working_sets, loggedWorkingSets: e.loggedWorkingSets,
        })), counted.length),
        sessionId: session.id,
        scheduledWorkoutId: session.scheduled_workout_id,
        calendarDateKey: session.calendar_date_key,
        dateOverridden: session.calendar_date_overridden === 1,
        startedAtUtc: session.started_at_utc,
        durationSeconds: (Date.now() - new Date(session.started_at_utc).getTime()) / 1000,
        setCount: counted.length,
        totalVolumeKg: volume?.v ?? null,
        prCount: prs?.n ?? 0,
        templateName: template?.name_tr ?? '',
        todayKey: s.clock.todayKey(),
      } satisfies Summary;
    });
  }, []));

  if (q.loading) return <Screen><Skeleton height={28} width="50%" /><Card><Skeleton height={80} /></Card></Screen>;
  if (q.error) return <Screen><ErrorBar message={q.error.message} onRetry={q.reload} /></Screen>;
  if (!q.data) {
    return (
      <Screen>
        <Text variant="title">{t('active.noSession')}</Text>
        <Button label="Ana ekrana dön" kind="primary" onPress={() => router.replace('/')} />
      </Screen>
    );
  }
  return <FinishBody s={q.data} origin={origin} reload={q.reload} />;
}

function FinishBody({ s, origin, reload }: {
  s: Summary; origin: 'workoutScreen' | 'resumeCard'; reload: () => void;
}) {
  const [pickingDate, setPickingDate] = useState(false);
  const [pickingContinuation, setPickingContinuation] = useState(false);

  const finish = useCommand(async (svc, finishHere: boolean) => {
    await svc.session.finish({ commandId: newId(), origin, finishHere });
  });
  const decide = useCommand(async (svc, decision: 'countAsDone' | 'continueLater', dateKey?: string) => {
    if (!s.scheduledWorkoutId) return;
    await svc.session.decidePartial({
      commandId: newId(), scheduledWorkoutId: s.scheduledWorkoutId, decision,
      ...(dateKey ? { plannedDateKey: dateKey } : {}),
    });
  });
  const overrideDate = useCommand(async (svc, dateKey: string) => {
    await svc.session.overrideCalendarDate({ commandId: newId(), sessionId: s.sessionId, dateKey });
  });

  const busy = finish.busy || decide.busy || overrideDate.busy;
  const error = finish.error ?? decide.error ?? overrideDate.error;
  const range = allowedDateRange(s.calendarDateKey, s.todayKey);

  // A.4 "Boş": hiç set yok → kısmi kararı GÖSTERİLMEZ.
  if (s.mode.kind === 'empty') {
    return (
      <Screen>
        <Text variant="title">{t('finish.empty')}</Text>
        {error ? <ErrorBar details={error.message} /> : null}
        <Button label={t('active.cancel')} kind="destructive" onPress={() => router.back()} />
        <Button label={t('finish.back')} kind="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      {origin === 'resumeCard' ? (
        <Card tone="warning">
          <Text variant="caption">
            {t('finish.fromResume', { date: dateTr(s.calendarDateKey, s.todayKey) })}
          </Text>
        </Card>
      ) : null}

      <Text variant="title">
        {s.mode.kind === 'full' ? t('finish.title.full') : t('finish.title.partial')}
      </Text>
      <Text color="muted">{s.templateName}</Text>

      <Card>
        <SummaryRow label="Süre" value={elapsed(s.durationSeconds)} />
        <SummaryRow label="Set" value={String(s.setCount)} />
        <SummaryRow label="Toplam hacim" value={num(s.totalVolumeKg, 0, 'kg')} />
        {s.prCount > 0 ? (
          <Row><Badge tone="primary" label={`${s.prCount} PR`} /></Row>
        ) : null}
      </Card>

      {/* Antrenman tarihi — 23:50'de başlayıp 00:10'da biten antrenman
          başlangıç gününde KALIR (R113.1, R113.3). */}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Text variant="label" color="muted">{t('finish.date.label')}</Text>
            <Text>{`${weekdayTr(s.calendarDateKey)}, ${dateTr(s.calendarDateKey, s.todayKey)}`}</Text>
          </View>
          <Button label={t('finish.date.edit')} kind="ghost" onPress={() => setPickingDate(true)} />
        </Row>
        {s.dateOverridden ? <Row><Badge tone="warning" label={t('finish.date.overridden')} /></Row> : null}
      </Card>

      {error ? <ErrorBar details={error.message} onRetry={reload} /> : null}

      {s.mode.kind === 'full' ? (
        <Button
          label={t('finish.confirm')} kind="primary" busy={busy}
          onPress={async () => { if (await finish.run(false)) router.replace('/'); }}
        />
      ) : (
        <PartialDecision
          mode={s.mode}
          busy={busy}
          onCountDone={async () => {
            if (await finish.run(true) && await decide.run('countAsDone')) router.replace('/');
          }}
          onContinueLater={() => setPickingContinuation(true)}
        />
      )}

      <Divider />
      <Button label={t('finish.back')} kind="ghost" onPress={() => router.back()} />

      <DatePickerSheet
        visible={pickingDate}
        title={t('finish.date.label')}
        initialKey={s.calendarDateKey}
        minKey={range.min}
        maxKey={range.max}
        todayKey={s.todayKey}
        onCancel={() => setPickingDate(false)}
        onPick={async (key) => {
          if (await overrideDate.run(key)) { setPickingDate(false); reload(); }
        }}
      />

      <DatePickerSheet
        visible={pickingContinuation}
        title={t('reschedule.title')}
        initialKey={s.todayKey}
        minKey={s.todayKey}
        todayKey={s.todayKey}
        onCancel={() => setPickingContinuation(false)}
        onPick={async (key) => {
          if (await finish.run(true) && await decide.run('continueLater', key)) router.replace('/');
        }}
      />
    </Screen>
  );
}

function PartialDecision(p: {
  mode: Extract<FinishMode, { kind: 'partial' }>;
  busy: boolean; onCountDone: () => void; onContinueLater: () => void;
}) {
  return (
    <Card>
      <Text color="muted">
        {t('finish.partial.summary', {
          planned: p.mode.plannedCount, done: p.mode.doneCount, missing: p.mode.missingCount,
        })}
      </Text>
      <Text variant="heading">{t('finish.partial.question')}</Text>

      <View style={{ gap: space.xs }}>
        <Button label={t('finish.partial.countDone')} kind="primary" disabled={p.busy} onPress={p.onCountDone} />
        <Text variant="caption" color="faint">{t('finish.partial.countDone.hint')}</Text>
      </View>

      <View style={{ gap: space.xs }}>
        <Button label={t('finish.partial.continueLater')} disabled={p.busy} onPress={p.onContinueLater} />
        <Text variant="caption" color="faint">
          {t('finish.partial.continueLater.hint', { n: p.mode.missingCount })}
        </Text>
      </View>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text color="muted">{label}</Text>
      <Text variant="heading">{value}</Text>
    </Row>
  );
}
