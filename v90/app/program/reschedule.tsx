// Reschedule tarih seçici — docs/v90/06-ux-flows.md A.10.
//
// Taşıma sırayı DEĞİŞTİRMEZ (R88.7); `Scheduler.reschedule` tek transaction
// içinde önce eski satırı `rescheduled` yapar, sonra yenisini ekler.
import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { scheduled } from '../../src/core/db/repositories.ts';
import { firstPreferredOnOrAfter } from '../../src/features/program/calendarGrid.ts';
import { loadProgramContext, rescheduleCount } from '../../src/features/program/programQuery.ts';
import { addDaysKey } from '../../src/features/format.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import { Badge, Card, ErrorBar, Row, Screen, Skeleton, Text } from '../../src/ui/components/primitives.tsx';
import { DatePickerSheet } from '../../src/ui/components/DatePickerSheet.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { t } from '../../src/ui/i18n/index.ts';

export default function RescheduleRoute() {
  return <ErrorBoundary onHome={() => router.back()}><Reschedule /></ErrorBoundary>;
}

function Reschedule() {
  const { id, from } = useLocalSearchParams<{ id: string; from?: string }>();
  const [open, setOpen] = useState(true);

  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => {
    const todayKey = s.clock.todayKey();
    const ctx = await loadProgramContext(tx, todayKey);
    const plan = await scheduled.get(tx, id);
    const moves = await rescheduleCount(tx, id);
    // Varsayılan: A.2'de bugünden, A.4'te yarından itibaren ilk tercih günü.
    const earliest = from === 'partial' ? addDaysKey(todayKey, 1) : todayKey;
    return {
      ctx, plan, moves, todayKey,
      initialKey: firstPreferredOnOrAfter(earliest, ctx.preferredWeekdays, ctx.pauses),
      minKey: earliest,
    };
  }), [id, from]), [id, from]);

  const move = useCommand(async (s, dateKey: string) => {
    await s.db.withTransaction((tx) =>
      s.scheduler.reschedule(tx, id, dateKey, from === 'partial' ? 'partialContinuation' : 'moveToDate'));
  });

  if (q.loading) return <Screen><Skeleton height={24} width="50%" /><Card><Skeleton height={200} /></Card></Screen>;
  if (q.error || !q.data) return <Screen><ErrorBar message={q.error?.message} onRetry={q.reload} /></Screen>;

  return (
    <Screen>
      <Text variant="title">{t('reschedule.title')}</Text>
      {q.data.moves > 0 ? (
        <Row><Badge tone="warning" label={t('reschedule.historyCount', { n: q.data.moves })} /></Row>
      ) : null}
      {move.error ? <ErrorBar details={move.error.message} /> : null}

      <DatePickerSheet
        visible={open}
        title={t('reschedule.title')}
        initialKey={q.data.initialKey}
        minKey={q.data.minKey}
        todayKey={q.data.todayKey}
        preferredWeekdays={q.data.ctx.preferredWeekdays}
        pauses={q.data.ctx.pauses}
        programEndKey={q.data.ctx.programEndKey}
        busy={move.busy}
        onCancel={() => { setOpen(false); router.back(); }}
        onPick={async (key) => { if (await move.run(key)) router.back(); }}
      />
    </Screen>
  );
}
