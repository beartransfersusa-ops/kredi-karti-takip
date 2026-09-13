// Aktif antrenman ekranı — docs/v90/06-ux-flows.md A.3.
//
// Üç kural bu ekranın tamamını belirler:
//   • Ekran DB'den `hydrate()` edilir; bellekte türetilmemiş durum YOKTUR
//     (R90.3, R90.7). Bu yüzden çökme/kapanma sonrası hiçbir set kaybolmaz.
//   • Dinlenme sayacı bellekte SAYILMAZ: kalan süre her render'da
//     `rest_started_at_utc + rest_duration_seconds` formülünden hesaplanır
//     (R91.1, R91.3). Saniyelik tik yalnızca EKRANI tazeler.
//   • Yük alanının anlamı `load_progression_type`'tan gelir; "+" her zaman
//     "daha zor" DEMEK DEĞİLDİR (R101.3, AT-09).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { newId } from '../../src/platform/id.ts';
import type { RawLoad } from '../../src/domain/types.ts';
import type { ActiveWorkoutSnapshot } from '../../src/domain/workout/ActiveSessionService.ts';
import type { Exercise } from '../../src/domain/types.ts';
import { fromRawLoad, loadField, toRawLoad } from '../../src/features/active-workout/loadField.ts';
import type { LoadField } from '../../src/features/active-workout/loadField.ts';
import { prefillValue } from '../../src/features/active-workout/recommendation.ts';
import type { RecommendationCard } from '../../src/features/active-workout/recommendation.ts';
import {
  closeOpenOnSetLogged, decide, openForExercise,
} from '../../src/features/active-workout/recommendationService.ts';
import { resolveIncrement } from '../../src/domain/exercise/IncrementResolver.ts';
import { elapsed, mmss } from '../../src/features/format.ts';
import { useCommand, useDbQuery, useServices } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, NumericStepper, Row, Screen, Segmented, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog.tsx';
import { RecommendationCardView } from '../../src/ui/components/RecommendationCard.tsx';
import { space, usePalette } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

export default function ActiveWorkoutRoute() {
  return (
    <ErrorBoundary onHome={() => router.replace('/')}>
      <ActiveWorkout />
    </ErrorBoundary>
  );
}

interface Loaded {
  snapshot: ActiveWorkoutSnapshot;
  catalog: ReadonlyMap<string, Exercise>;
  templateName: string;
  /** Hareket başına açık ya da karar verilmiş öneri (A.7 (a)). */
  recommendations: Map<string, RecommendationCard>;
}

function ActiveWorkout() {
  const params = useLocalSearchParams<{ focus?: string }>();
  const q = useDbQuery<Loaded | null>(useCallback(async (s) => {
    const snapshot = await s.session.hydrate();
    if (!snapshot) return null;
    const catalog = await s.catalog.all();
    return s.db.withTransaction(async (tx) => {
      const id = snapshot.session.workout_template_id;
      const row = id
        ? await tx.get<{ name_tr: string }>('SELECT name_tr FROM workout_templates WHERE id = ?', [id])
        : undefined;

      const recommendations = new Map<string, RecommendationCard>();
      for (const ex of snapshot.exercises) {
        const cards = await openForExercise(tx, ex.exercise_id, s.clock.nowUtc());
        if (cards[0]) recommendations.set(ex.id, cards[0]);
      }
      return { snapshot, catalog, templateName: row?.name_tr ?? '', recommendations };
    });
  }, []));

  const [focusId, setFocusId] = useState<string | null>(params.focus ?? null);

  if (q.loading) return <ActiveSkeleton />;
  if (q.error) return <Screen><ErrorBar message={q.error.message} onRetry={q.reload} /></Screen>;

  // A.3 "Boş": oturum başka yerde iptal edilmiş olabilir.
  if (!q.data) {
    return (
      <Screen>
        <Text variant="title">{t('active.noSession')}</Text>
        <Button label="Ana ekrana dön" kind="primary" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return <ActiveBody loaded={q.data} reload={q.reload} focusId={focusId} setFocusId={setFocusId} />;
}

function ActiveSkeleton() {
  return (
    <Screen>
      <Skeleton height={24} width="55%" />
      <Card><Skeleton height={18} width="40%" /><Skeleton height={56} /><Skeleton height={44} /></Card>
      <Card><Skeleton height={16} width="60%" /></Card>
    </Screen>
  );
}

function ActiveBody({ loaded, reload, focusId, setFocusId }: {
  loaded: Loaded; reload: () => void;
  focusId: string | null; setFocusId: (id: string | null) => void;
}) {
  const { snapshot, catalog, templateName, recommendations } = loaded;
  const [cancelling, setCancelling] = useState(false);
  const cancel = useCommand(async (s) => {
    await s.session.cancel({ commandId: newId(), origin: 'workoutScreen' });
  });

  // Odak: kullanıcı seçtiyse o, yoksa ilk bitmemiş hareket.
  const focus = snapshot.exercises.find((e) => e.id === focusId)
    ?? snapshot.exercises.find((e) => e.status === 'pending' || e.status === 'inProgress')
    ?? snapshot.exercises[0];

  const allResolved = snapshot.exercises.every((e) => e.status === 'done' || e.status === 'skipped');

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{templateName}</Text>
          <ElapsedLabel startedAtUtc={snapshot.session.started_at_utc} />
        </View>
        <Button
          label={t('active.finish')}
          kind={allResolved ? 'primary' : 'secondary'}
          onPress={() => router.push('/workout/finish?origin=workoutScreen')}
        />
      </Row>

      {snapshot.exercises.map((ex) => {
        const exercise = catalog.get(ex.exercise_id);
        const isFocus = focus?.id === ex.id;
        return (
          <ExerciseCard
            key={ex.id}
            row={ex}
            exercise={exercise}
            setLogs={snapshot.setLogs.filter((l) => l.session_exercise_id === ex.id)}
            bodyweightKg={snapshot.session.bodyweight_kg_snapshot}
            recommendation={recommendations.get(ex.id) ?? null}
            sessionId={snapshot.session.id}
            focused={isFocus}
            onFocus={() => setFocusId(ex.id)}
            onChanged={reload}
          />
        );
      })}

      <Divider />
      <Button label={t('active.cancel')} kind="destructive" onPress={() => setCancelling(true)} />
      <ConfirmDialog
        visible={cancelling}
        title={t('active.cancel')}
        body={t('resume.cancel.confirm.body')}
        confirmLabel={t('resume.cancel.confirm.ok')}
        cancelLabel={t('resume.cancel.confirm.cancel')}
        destructive
        busy={cancel.busy}
        onCancel={() => setCancelling(false)}
        onConfirm={async () => { if (await cancel.run()) router.replace('/'); }}
      />

      <RestTimerBar timer={snapshot.restTimer} onChanged={reload} restSeconds={focus?.rest_seconds ?? 120} />
    </Screen>
  );
}

/** Geçen süre `started_at_utc`'den türetilir; sayaç bellekte tutulmaz. */
function ElapsedLabel({ startedAtUtc }: { startedAtUtc: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((v) => v + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const seconds = (Date.now() - new Date(startedAtUtc).getTime()) / 1000;
  return <Text variant="caption" color="muted">{elapsed(seconds)}</Text>;
}

type ExRow = ActiveWorkoutSnapshot['exercises'][number];

function ExerciseCard(p: {
  row: ExRow; exercise: Exercise | undefined;
  setLogs: ActiveWorkoutSnapshot['setLogs'];
  bodyweightKg: number | null;
  recommendation: RecommendationCard | null;
  sessionId: string;
  focused: boolean; onFocus: () => void; onChanged: () => void;
}) {
  const c = usePalette();
  const { row, exercise } = p;
  const done = row.status === 'done';
  const skipped = row.status === 'skipped';

  if (!p.focused) {
    return (
      <Card style={{ opacity: skipped ? 0.5 : 1 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text variant="heading" style={{ flex: 1 }} numberOfLines={1}>
            {exercise?.nameTr ?? row.exercise_id}
          </Text>
          <Badge
            tone={done ? 'primary' : 'neutral'}
            label={skipped ? 'atlandı' : `${row.loggedWorkingSets}/${row.planned_working_sets}`}
          />
        </Row>
        <Button label="Aç" kind="ghost" onPress={p.onFocus} />
      </Card>
    );
  }

  return (
    <Card style={{ borderColor: c.primary }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="heading" style={{ flex: 1 }}>{exercise?.nameTr ?? row.exercise_id}</Text>
        <Badge label={`${row.loggedWorkingSets}/${row.planned_working_sets}`} />
      </Row>
      <Text variant="caption" color="muted">
        {`Hedef ${row.rep_min}–${row.rep_max} tekrar · RIR ${row.target_rir} · dinlenme ${row.rest_seconds}s`}
      </Text>

      <UnilateralToggle row={row} exercise={exercise} onChanged={p.onChanged} />

      {/* Öneri kartı ilk working set'ten ÖNCE görünür (A.7 (a)). */}
      {p.recommendation && p.setLogs.length === 0 ? (
        <RecommendationSlot
          card={p.recommendation}
          exercise={exercise}
          sessionId={p.sessionId}
          onChanged={p.onChanged}
        />
      ) : null}

      {p.setLogs.length > 0 ? <LoggedSets logs={p.setLogs} exercise={exercise} /> : null}

      {done || skipped ? null : (
        <SetEntry
          row={row}
          exercise={exercise}
          bodyweightKg={p.bodyweightKg}
          recommendation={p.recommendation}
          nextSetIndex={nextSetIndex(p.setLogs)}
          onChanged={p.onChanged}
        />
      )}

      <Row wrap>
        <Button
          label={t('active.substitute')} kind="ghost"
          onPress={() => router.push(`/workout/substitute?sessionExerciseId=${row.id}`)}
        />
        {done || skipped ? null : <SkipExerciseButton sessionExerciseId={row.id} onChanged={p.onChanged} />}
      </Row>
    </Card>
  );
}

const nextSetIndex = (logs: ActiveWorkoutSnapshot['setLogs']): number =>
  logs.length === 0 ? 0 : Math.max(...logs.map((l) => l.set_index)) + 1;

function UnilateralToggle(p: { row: ExRow; exercise: Exercise | undefined; onChanged: () => void }) {
  const services = useServices();
  const set = useCommand(async (s, mode: 'bothSame' | 'separate') => {
    await s.db.withTransaction(async (tx) => {
      const now = s.clock.nowUtc().toISOString();
      await tx.exec('UPDATE session_exercises SET tracking_mode = ?, updated_at_utc = ? WHERE id = ?',
        [mode, now, p.row.id]);
      // Tercih hatırlanır (R102.2).
      await tx.exec(
        `INSERT INTO user_exercise_settings (exercise_id, default_tracking_mode, updated_at_utc)
         VALUES (?,?,?)
         ON CONFLICT(exercise_id) DO UPDATE SET default_tracking_mode = excluded.default_tracking_mode,
           updated_at_utc = excluded.updated_at_utc`,
        [p.row.exercise_id, mode, now]);
    });
  });
  void services;
  if (!p.exercise?.isUnilateral) return null;
  return (
    <Segmented
      value={p.row.tracking_mode}
      disabled={set.busy}
      options={[
        { value: 'bothSame', label: t('active.unilateral.bothSame') },
        { value: 'separate', label: t('active.unilateral.separate') },
      ]}
      onChange={async (v) => { if (await set.run(v)) p.onChanged(); }}
    />
  );
}

function SkipExerciseButton(p: { sessionExerciseId: string; onChanged: () => void }) {
  const skip = useCommand(async (s) => {
    await s.session.skipExercise({ commandId: newId(), sessionExerciseId: p.sessionExerciseId });
  });
  return (
    <Button
      label={t('active.skipExercise')} kind="ghost" busy={skip.busy}
      onPress={async () => { if (await skip.run()) p.onChanged(); }}
    />
  );
}

/** Kart + karar komutu. Karar prefill'i değiştirir, seti KULLANICI loglar. */
function RecommendationSlot(p: {
  card: RecommendationCard; exercise: Exercise | undefined;
  sessionId: string; onChanged: () => void;
}) {
  const decideCmd = useCommand(async (s, decision: 'accepted' | 'modified' | 'ignored', userValue?: number) => {
    await s.db.withTransaction((tx) => decide(tx, s.clock, {
      commandId: newId(),
      recommendationId: p.card.id,
      decision,
      ...(userValue !== undefined ? { userValue } : {}),
      appliedSessionId: p.sessionId,
    }));
  });

  // "Değiştir" adımı hareketin kendi artışından gelir (R100.1).
  const step = p.exercise ? resolveIncrement(p.exercise).incrementKg : undefined;

  return (
    <RecommendationCardView
      card={p.card}
      {...(step !== undefined ? { step } : {})}
      busy={decideCmd.busy}
      error={decideCmd.error}
      onDecide={async (decision, userValue) => {
        if (await decideCmd.run(decision, userValue)) p.onChanged();
      }}
    />
  );
}

function LoggedSets({ logs, exercise }: { logs: ActiveWorkoutSnapshot['setLogs']; exercise: Exercise | undefined }) {
  const field = exercise ? loadField(exercise) : null;
  return (
    <View style={{ gap: space.xs }}>
      {logs.slice().sort((a, b) => a.set_index - b.set_index).map((l) => (
        <Row key={l.id} style={{ justifyContent: 'space-between' }}>
          <Text variant="caption" color="muted">
            {`${l.set_type === 'warmup' ? 'Isınma' : `Set ${l.set_index + 1}`}${
              l.side !== 'both' ? ` · ${l.side === 'left' ? tr['active.side.left'] : tr['active.side.right']}` : ''}`}
          </Text>
          <Text variant="caption">
            {`${field ? describeLoad(field, l) : ''}${l.reps} tekrar${l.rir !== null ? ` · RIR ${l.rir}` : ''}`}
          </Text>
        </Row>
      ))}
    </View>
  );
}

function describeLoad(field: LoadField, l: ActiveWorkoutSnapshot['setLogs'][number]): string {
  switch (field.kind) {
    case 'load': return l.load_kg !== null ? `${l.load_kg} kg × ` : '';
    case 'assistance': return l.assistance_kg !== null ? `−${l.assistance_kg} kg yardım × ` : '';
    case 'machineLevel': return l.machine_level !== null ? `Sv. ${l.machine_level} × ` : '';
    case 'band': return l.band_rank !== null ? `Band ${l.band_rank} × ` : '';
    default: return '';
  }
}

/** Set girişi — hedef ≤ 3 dokunuş (R108.3, R108.4). */
function SetEntry(p: {
  row: ExRow; exercise: Exercise | undefined; bodyweightKg: number | null;
  recommendation: RecommendationCard | null;
  nextSetIndex: number; onChanged: () => void;
}) {
  const field = useMemo(() => (p.exercise ? loadField(p.exercise) : null), [p.exercise]);
  const prefill = p.row.prefill;

  /*
   * Prefill kaynağı (02 §7.3): kabul/değiştirilmiş öneri, hareketin İLK
   * working set'inde kaynak 2'nin (son antrenman) ÖNÜNE geçer. Yok sayılmış
   * öneri prefill'i etkilemez (A.7 adım 5).
   */
  const fromReco = p.recommendation && p.nextSetIndex === 0
    ? prefillValue(p.recommendation) : null;

  const [load, setLoad] = useState<number | null>(
    fromReco?.value ?? (field ? fromRawLoad(field, prefill.load) : null));
  const [reps, setReps] = useState<number>(prefill.reps ?? p.row.rep_min);
  const [rir, setRir] = useState<number>(prefill.rir ?? p.row.target_rir);
  const [side, setSide] = useState<'left' | 'right'>('left');
  // Aynı `command_id` ile tekrar denemek çift kayıt üretmez (`command_log`).
  const [commandId, setCommandId] = useState(() => newId());

  const complete = useCommand(async (s) => {
    const raw: RawLoad = field ? toRawLoad(field, load, p.bodyweightKg) : {};
    await s.session.completeSet({
      commandId,
      sessionExerciseId: p.row.id,
      setIndex: p.nextSetIndex,
      setType: 'working',
      side: p.row.tracking_mode === 'separate' ? side : 'both',
      raw,
      reps,
      rir,
    });

    /*
     * İlk working set karar verilmeden loglandıysa açık öneri `ignored`
     * olarak kapanır ve LOGLANAN değeri taşır: kullanıcının fiili tercihi
     * kaydedilir, sessizce kaybolmaz (R121.3, A.7 adım 6).
     */
    if (p.nextSetIndex === 0 && p.recommendation && p.recommendation.decision === null) {
      await s.db.withTransaction((tx) => closeOpenOnSetLogged(tx, s.clock, {
        exerciseId: p.row.exercise_id,
        loggedValue: load,
        sessionId: p.row.session_id,
      }));
    }
  });

  const prefillBadge = fromReco
    ? (fromReco.source === 'userValue' ? t('reco.userValueBadge') : t('active.prefill.recommended'))
    : { draft: null, previousSet: t('active.prefill.prevSet'), template: t('active.prefill.target') }[prefill.source];

  return (
    <View style={{ gap: space.md }}>
      {prefillBadge ? <Row><Badge label={prefillBadge} /></Row> : null}

      {field && field.kind !== 'none' ? (
        <NumericStepper
          label={field.labelKey ? tr[field.labelKey] : ''}
          hint={field.hintKey ? tr[field.hintKey] : undefined}
          value={load}
          onChange={setLoad}
          step={field.step}
          decimals={field.decimals === 0 ? 0 : 1}
          min={0}
        />
      ) : null}

      <NumericStepper label={t('active.reps')} value={reps} onChange={setReps} step={1} min={1} decimals={0} />

      <View style={{ gap: space.xs }}>
        <Text variant="label" color="muted">{t('active.rir')}</Text>
        <Segmented
          value={String(Math.min(4, rir))}
          options={[
            { value: '0', label: '0' }, { value: '1', label: '1' }, { value: '2', label: '2' },
            { value: '3', label: '3' }, { value: '4', label: '4+' },
          ]}
          onChange={(v) => setRir(Number(v))}
        />
      </View>

      {p.row.tracking_mode === 'separate' ? (
        <Segmented
          value={side}
          options={[
            { value: 'left', label: tr['active.side.left'] },
            { value: 'right', label: tr['active.side.right'] },
          ]}
          onChange={setSide}
        />
      ) : null}

      {complete.error ? (
        <ErrorBar details={complete.error.message} onRetry={() => void complete.run()} />
      ) : null}

      <Button
        label={t('active.completeSet')} kind="primary" busy={complete.busy}
        onPress={async () => {
          if (await complete.run()) {
            setCommandId(newId());   // sıradaki set yeni komuttur
            p.onChanged();
          }
        }}
      />
    </View>
  );
}

/**
 * Dinlenme çubuğu. Saniyelik tik YALNIZCA ekranı tazeler; kalan süre
 * `RestTimerService.view()` ile zaman damgasından hesaplanır (AT-03).
 */
function RestTimerBar(p: {
  timer: ActiveWorkoutSnapshot['restTimer']; restSeconds: number; onChanged: () => void;
}) {
  const c = usePalette();
  const [, tick] = useState(0);
  const running = p.timer && p.timer.state === 'running';

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const skip = useCommand(async (s) => {
    if (!p.timer) return;
    const ids = await s.db.withTransaction((tx) => s.restTimers.skip(tx, p.timer!.id));
    await s.restTimers.cancelNotifications(ids);
  });

  if (!p.timer || p.timer.state !== 'running') return null;

  // Kalan süre her render'da bitiş ANINDAN hesaplanır — bellekte sayaç yok.
  // Ekran kilidi, arka plan ve yeniden başlatma bu hesabı etkilemez (AT-03).
  const remaining = Math.max(0, Math.round((Date.parse(p.timer.endsAtUtc) - Date.now()) / 1000));
  const expired = remaining <= 0;

  return (
    <Card tone={expired ? 'warning' : 'default'} style={{ borderColor: expired ? c.warning : c.border }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="heading">
          {expired ? t('active.rest.done') : t('active.rest.remaining', { 'mm:ss': mmss(remaining) })}
        </Text>
        <Button label={t('active.rest.skip')} kind="ghost" busy={skip.busy}
          onPress={async () => { if (await skip.run()) p.onChanged(); }} />
      </Row>
    </Card>
  );
}
