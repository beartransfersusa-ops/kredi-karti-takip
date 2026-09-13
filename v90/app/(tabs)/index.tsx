// Ana ekran (Dashboard) — docs/v90/06-ux-flows.md A.1, A.2, A.5.
//
// Ekranın TEK birincil kart alanı vardır; hangisinin gösterileceğini
// `dashboardModel` (saf, test edilmiş) söyler. Bu dosya yalnızca çizer ve
// komutları çağırır.
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { newId } from '../../src/platform/id.ts';
import { settings } from '../../src/core/db/repositories.ts';
import { loadDashboard, MISSED_DISMISS_KEY } from '../../src/features/program/dashboardQuery.ts';
import type { DashboardData } from '../../src/features/program/dashboardQuery.ts';
import { dateTr, elapsed, hhmm, weekdayShortOf, weekdayTr } from '../../src/features/format.ts';
import { useCommand, useDbQuery, useServices } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog.tsx';
import { space } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

export default function DashboardRoute() {
  return (
    <ErrorBoundary onHome={() => router.replace('/')}>
      <Dashboard />
    </ErrorBoundary>
  );
}

function Dashboard() {
  const services = useServices();
  const q = useDbQuery(useCallback(
    (s) => s.db.withTransaction((tx) => loadDashboard(tx, s.clock, s.scheduler)), []));

  if (q.loading) return <DashboardSkeleton />;
  if (q.error || !q.data) {
    return (
      <Screen>
        <ErrorBar message={q.error?.message} onRetry={q.reload} />
      </Screen>
    );
  }
  const d = q.data;

  return (
    <Screen>
      {/* Day sayacı — program yoksa gizli (A.1 "Boş" durumu). */}
      {d.challengeDay ? (
        <Row>
          <Button
            kind="ghost"
            label={t('home.day', { X: d.challengeDay.day })}
            onPress={() => router.push('/program/settings')}
            accessibilityHint="Program ayarlarını aç"
          />
          {d.challengeDay.pausedDays > 0
            ? <Badge label={`${d.challengeDay.pausedDays} gün donduruldu`} />
            : null}
        </Row>
      ) : null}

      <PrimaryCard data={d} reload={q.reload} />

      <BicepsKpiCard data={d} />

      {d.openPlateauCount > 0 ? (
        <Button
          kind="ghost"
          label={`${d.openPlateauCount} plato incelemesi açık`}
          onPress={() => router.push('/(tabs)/progress')}
        />
      ) : null}
    </Screen>
  );
}

function DashboardSkeleton() {
  // A.0: skeleton YALNIZCA ilk açılışta; hiçbir buton render edilmez.
  return (
    <Screen>
      <Skeleton height={28} width="40%" />
      <Card><Skeleton height={20} width="70%" /><Skeleton height={14} width="50%" /><Skeleton height={44} /></Card>
      <Card><Skeleton height={16} width="45%" /></Card>
    </Screen>
  );
}

function PrimaryCard({ data, reload }: { data: DashboardData; reload: () => void }) {
  const card = data.card;
  switch (card.kind) {
    case 'empty': return <EmptyProgramCard />;
    case 'finished': return <FinishedCard />;
    case 'resume': return <ResumeCard data={data} session={card.session} reload={reload} />;
    case 'paused': return <PausedCard reason={card.reason} days={card.days} />;
    case 'missed': return <MissedCard data={data} missed={card.missed} reload={reload} />;
    case 'doneToday': return <DoneTodayCard data={data} />;
    case 'next': return <NextWorkoutCard data={data} plan={card.plan} />;
    case 'noPlan': return <Card><Text color="muted">Planlanmış antrenman yok.</Text></Card>;
  }
}

function EmptyProgramCard() {
  return (
    <Card>
      <Text variant="title">V90</Text>
      <Button label={t('home.empty.cta')} kind="primary" onPress={() => router.push('/onboarding')} />
    </Card>
  );
}

function FinishedCard() {
  return (
    <Card>
      <Text variant="title">{t('home.finished.title')}</Text>
      <Button label="Day 90 raporunu aç" kind="primary" onPress={() => router.push('/(tabs)/progress')} />
    </Card>
  );
}

/** A.5 — devam eden antrenman kartı; üç seçenek + iptal onayı. */
function ResumeCard({ data, session, reload }: {
  data: DashboardData; session: DashboardData['card'] extends never ? never : import('../../src/core/db/repositories.ts').WorkoutSessionRow;
  reload: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const cancel = useCommand(async (s) => {
    await s.session.cancel({ commandId: newId(), origin: 'resumeCard' });
  });

  return (
    <Card>
      <Text variant="title">{t('resume.title')}</Text>
      {data.template ? <Text color="muted">{data.template.name_tr}</Text> : null}
      <Text variant="caption" color="faint">
        {/* Oturumun BAŞLADIĞI saat dilimi kullanılır: kullanıcı tz değiştirse
            bile "Başladı: Per 18:42" olduğu gibi kalır (R112.4). */}
        {t('resume.startedAt', {
          weekday: weekdayShortOf(session.started_at_utc, session.time_zone),
          'HH:mm': hhmm(session.started_at_utc, session.time_zone),
        })}
      </Text>
      <ResumeProgress sessionId={session.id} />
      {cancel.error ? <ErrorBar onRetry={() => void cancel.run()} details={cancel.error.message} /> : null}
      <Row wrap>
        <Button label={t('resume.continue')} kind="primary" onPress={() => router.push('/workout/active')} />
        <Button label={t('resume.finish')} onPress={() => router.push('/workout/finish?origin=resumeCard')} />
        <Button label={t('resume.cancel')} kind="destructive" onPress={() => setConfirming(true)} />
      </Row>
      <ConfirmDialog
        visible={confirming}
        title={t('resume.cancel')}
        body={t('resume.cancel.confirm.body')}
        confirmLabel={t('resume.cancel.confirm.ok')}
        cancelLabel={t('resume.cancel.confirm.cancel')}
        destructive
        busy={cancel.busy}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => { if (await cancel.run()) { setConfirming(false); reload(); } }}
      />
    </Card>
  );
}

function ResumeProgress({ sessionId }: { sessionId: string }) {
  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => {
    const ex = await tx.all<{ status: string }>(
      'SELECT status FROM session_exercises WHERE session_id = ?', [sessionId]);
    const sets = await tx.get<{ n: number }>(
      `SELECT COUNT(*) n FROM set_logs WHERE session_id = ? AND discarded = 0`, [sessionId]);
    return {
      done: ex.filter((e) => e.status === 'done' || e.status === 'skipped').length,
      planned: ex.length,
      sets: sets?.n ?? 0,
    };
  }), [sessionId]), [sessionId]);

  if (!q.data) return <Skeleton height={14} width="50%" />;
  return (
    <Text variant="caption" color="muted">
      {t('resume.progress', { doneExercises: q.data.done, plannedExercises: q.data.planned, sets: q.data.sets })}
    </Text>
  );
}

function PausedCard({ reason, days }: { reason: string | null; days: number }) {
  const resume = useCommand(async (s) => {
    const program = await s.db.withTransaction(async (tx) =>
      (await import('../../src/core/db/repositories.ts')).programs.findOpen(tx));
    if (!program) return;
    await s.db.withTransaction((tx) => s.pauseService.resume(tx, program.id));
  });
  return (
    <Card tone="warning">
      <Text variant="title">{t('home.paused.title')}</Text>
      <Text color="muted">{t('program.paused.banner', { reasonLabel: reasonLabel(reason), n: days })}</Text>
      <Text variant="caption" color="faint">{t('program.pause.hint')}</Text>
      {resume.error ? <ErrorBar onRetry={() => void resume.run()} details={resume.error.message} /> : null}
      <Button label={t('home.paused.resume')} kind="primary" busy={resume.busy} onPress={() => void resume.run()} />
    </Card>
  );
}

function reasonLabel(reason: string | null): string {
  const map: Record<string, string> = {
    illness: tr['program.pause.reason.illness'], travel: tr['program.pause.reason.travel'],
    injury: tr['program.pause.reason.injury'], work: tr['program.pause.reason.work'],
    personal: tr['program.pause.reason.personal'], other: tr['program.pause.reason.other'],
  };
  return reason ? (map[reason] ?? reason) : tr['program.pause.reason.other'];
}

/** A.2 — kaçırılan antrenman kararı. Karar verilmeden "Başla" gösterilmez. */
function MissedCard({ data, missed, reload }: {
  data: DashboardData;
  missed: import('../../src/domain/program/Scheduler.ts').MissedWorkout;
  reload: () => void;
}) {
  const [confirmingSkip, setConfirmingSkip] = useState(false);

  const moveToday = useCommand(async (s) => {
    await s.db.withTransaction((tx) =>
      s.scheduler.reschedule(tx, missed.scheduledWorkoutId, s.clock.todayKey(), 'moveToToday'));
  });
  const skip = useCommand(async (s) => {
    await s.db.withTransaction(async (tx) => {
      await s.scheduler.skip(tx, missed.scheduledWorkoutId);
      if (data.programId) await s.scheduler.ensurePlanned(tx, data.programId, s.clock.todayKey());
    });
  });
  const dismiss = useCommand(async (s) => {
    await s.db.withTransaction((tx) =>
      settings.set(tx, MISSED_DISMISS_KEY, s.clock.todayKey(), s.clock.nowUtc().toISOString()));
  });

  const templateName = data.template?.name_tr ?? data.template?.name ?? 'Antrenman';
  const busy = moveToday.busy || skip.busy || dismiss.busy;
  const error = moveToday.error ?? skip.error ?? dismiss.error;

  return (
    <Card tone="warning">
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="heading" style={{ flex: 1 }}>
          {t('home.missed.title', {
            templateName, plannedWeekday: weekdayTr(missed.plannedDateKey),
          })}
        </Text>
        <Button label={t('missed.dismiss')} kind="ghost" onPress={() => void dismiss.run()} />
      </Row>
      <Text variant="caption" color="muted">{t('missed.subtitle', { n: missed.daysLate })}</Text>
      {error ? <ErrorBar details={error.message} onRetry={() => void moveToday.run()} /> : null}
      <Row wrap>
        <Button label={t('missed.moveToday')} kind="primary" disabled={busy}
          onPress={async () => { if (await moveToday.run()) reload(); }} />
        <Button label={t('missed.moveToDate')} disabled={busy}
          onPress={() => router.push(`/program/reschedule?id=${missed.scheduledWorkoutId}`)} />
        <Button label={t('missed.skip')} kind="destructive" disabled={busy}
          onPress={() => setConfirmingSkip(true)} />
      </Row>
      <ConfirmDialog
        visible={confirmingSkip}
        title={t('missed.skip')}
        body={t('missed.skip.confirm.body')}
        confirmLabel={t('missed.skip.confirm.ok')}
        cancelLabel={t('missed.skip.confirm.cancel')}
        destructive
        busy={skip.busy}
        onCancel={() => setConfirmingSkip(false)}
        onConfirm={async () => { if (await skip.run()) { setConfirmingSkip(false); reload(); } }}
      />
    </Card>
  );
}

function DoneTodayCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <Text variant="title">{t('home.doneToday.title')}</Text>
      {data.card.kind === 'doneToday' && data.card.nextPlan && data.template ? (
        <Text color="muted">
          {t('home.doneToday.preview', {
            templateNameTr: data.template.name_tr,
            date: dateTr(data.card.nextPlan.planned_date_key, data.todayKey),
          })}
        </Text>
      ) : null}
      <Badge label={t('reschedule.forecast')} />
    </Card>
  );
}

function NextWorkoutCard({ data, plan }: {
  data: DashboardData; plan: import('../../src/core/db/repositories.ts').ScheduledWorkoutRow;
}) {
  const start = useCommand(async (s) => {
    const r = await s.session.start({ commandId: newId(), scheduledWorkoutId: plan.id });
    return r;
  });
  const name = data.template?.name_tr ?? data.template?.name ?? '';

  return (
    <Card>
      <Text variant="label" color="muted">{t('home.next.title')}</Text>
      <Text variant="title">
        {t('home.next.sequence', { n: data.sequenceLabel ?? 1, templateNameTr: name })}
      </Text>
      <Text color="muted">
        {t('home.next.planned', {
          weekday: weekdayTr(plan.planned_date_key),
          date: dateTr(plan.planned_date_key, data.todayKey),
        })}
      </Text>
      <Divider />
      <Row wrap gap={space.md}>
        {data.template?.estimated_minutes
          ? <Badge label={elapsed(data.template.estimated_minutes * 60)} />
          : null}
        {data.openRecommendationCount > 0
          ? <Badge tone="primary" label={t('home.next.recoCount', { n: data.openRecommendationCount })} />
          : null}
      </Row>
      {start.error ? <ErrorBar details={start.error.message} onRetry={() => void start.run()} /> : null}
      {data.canStartWorkout ? (
        <Button
          label={t('home.next.start')} kind="primary" busy={start.busy}
          onPress={async () => { if (await start.run()) router.push('/workout/active'); }}
        />
      ) : null}
    </Card>
  );
}

/** Kol KPI — baseline yoksa `0 cm` DEĞİL, CTA gösterilir (R96.3–R96.5, AT-12). */
function BicepsKpiCard({ data }: { data: DashboardData }) {
  if (data.bicepsKpi.state === 'missing') {
    return (
      <Card>
        <Text variant="label" color="muted">Bükülü üst kol</Text>
        <Text color="muted">{t('home.biceps.cta')}</Text>
        <Button label={t('common.add')} onPress={() => router.push('/measurements/new?site=bicepsFlexed')} />
      </Card>
    );
  }
  return (
    <Card>
      <Text variant="label" color="muted">Bükülü üst kol · başlangıç</Text>
      <View style={{ gap: space.xs }}>
        <Text variant="title">{`${data.bicepsKpi.valueCm} cm`}</Text>
      </View>
    </Card>
  );
}
