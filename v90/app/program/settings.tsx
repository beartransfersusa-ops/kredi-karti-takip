// Program ayarları — docs/v90/06-ux-flows.md A.9 (R89).
//
// Dondurma süresince sıra İLERLEMEZ ve kaçırılan uyarısı ÜRETİLMEZ (R89.3).
// Takvim modu değişimi geçmişi bozmaz: Day X her zaman yeniden türetilir,
// hiçbir yerde saklanmaz (R89.5, R89.8).
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { View } from 'react-native';
import { challengeDay } from '../../src/domain/program/ChallengeCalendar.ts';
import { programs } from '../../src/core/db/repositories.ts';
import { loadProgramContext } from '../../src/features/program/programQuery.ts';
import { dateTr } from '../../src/features/format.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Segmented, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

type PauseReason = 'illness' | 'travel' | 'injury' | 'work' | 'personal' | 'other';

const REASONS: Array<{ value: PauseReason; label: string }> = [
  { value: 'illness', label: tr['program.pause.reason.illness'] },
  { value: 'travel', label: tr['program.pause.reason.travel'] },
  { value: 'injury', label: tr['program.pause.reason.injury'] },
  { value: 'work', label: tr['program.pause.reason.work'] },
  { value: 'personal', label: tr['program.pause.reason.personal'] },
  { value: 'other', label: tr['program.pause.reason.other'] },
];

export default function ProgramSettingsRoute() {
  return <ErrorBoundary onHome={() => router.replace('/')}><ProgramSettings /></ErrorBoundary>;
}

function ProgramSettings() {
  const [pausing, setPausing] = useState(false);
  const [reason, setReason] = useState<PauseReason>('illness');

  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => {
    const todayKey = s.clock.todayKey();
    const ctx = await loadProgramContext(tx, todayKey);
    if (!ctx.program) return { ctx, todayKey, strict: null, active: null };
    const common = {
      startDateKey: ctx.program.start_date_key,
      todayKey,
      durationDays: ctx.program.duration_days,
      pauses: ctx.pauses,
    };
    // İki modun canlı önizlemesi: "Bugün: Day 12 → Day 9".
    return {
      ctx, todayKey,
      strict: challengeDay({ ...common, calendarMode: 'strictCalendar' }),
      active: challengeDay({ ...common, calendarMode: 'activeDays' }),
    };
  }), []));

  const pause = useCommand(async (s, why: PauseReason) => {
    const id = q.data?.ctx.program?.id;
    if (!id) return;
    await s.db.withTransaction((tx) => s.pauseService.pause(tx, id, why));
  });
  const resume = useCommand(async (s) => {
    const id = q.data?.ctx.program?.id;
    if (!id) return;
    await s.db.withTransaction((tx) => s.pauseService.resume(tx, id));
  });
  const setMode = useCommand(async (s, mode: 'strictCalendar' | 'activeDays') => {
    const program = q.data?.ctx.program;
    if (!program || program.calendar_mode === mode) return;
    await s.db.withTransaction(async (tx) => {
      const now = s.clock.nowUtc().toISOString();
      await programs.setCalendarMode(tx, program.id, mode, now);
      // Ayar değişimi izlenir; geçmiş bozulmaz, yalnızca türetim değişir.
      await tx.exec(
        `INSERT INTO settings_history (id, key, old_value_json, new_value_json, changed_at_utc)
         VALUES (?,?,?,?,?)`,
        [`sh-${now}-calendarMode`, 'program.calendarMode',
          JSON.stringify(program.calendar_mode), JSON.stringify(mode), now]);
    });
  });

  if (q.loading) return <Screen><Skeleton height={24} width="45%" /><Card><Skeleton height={120} /></Card></Screen>;
  if (q.error || !q.data) return <Screen><ErrorBar message={q.error?.message} onRetry={q.reload} /></Screen>;

  const { ctx, todayKey, strict, active } = q.data;
  const program = ctx.program;

  if (!program) {
    return (
      <Screen>
        <Button label={t('home.empty.cta')} kind="primary" onPress={() => router.push('/onboarding')} />
      </Screen>
    );
  }

  const paused = program.status === 'paused';
  const readOnly = program.status === 'completed' || program.status === 'abandoned';
  const error = pause.error ?? resume.error ?? setMode.error;

  return (
    <Screen>
      <Text variant="title">{program.name}</Text>
      <Text color="muted">{`Başlangıç: ${dateTr(program.start_date_key, todayKey)}`}</Text>
      {strict ? (
        <Text variant="heading">
          {t('home.day', { X: program.calendar_mode === 'activeDays' ? (active?.day ?? strict.day) : strict.day })}
        </Text>
      ) : null}

      {error ? <ErrorBar details={error.message} onRetry={q.reload} /> : null}

      {paused ? (
        <Card tone="warning">
          <Text variant="heading">{t('home.paused.title')}</Text>
          <Text variant="caption" color="muted">{t('program.pause.hint')}</Text>
          <Button label={t('program.resume.button')} kind="primary" busy={resume.busy}
            onPress={async () => { if (await resume.run()) q.reload(); }} />
        </Card>
      ) : readOnly ? (
        <Card><Text color="muted">{`Durum: ${program.status}`}</Text></Card>
      ) : (
        <Card>
          {!pausing ? (
            <>
              <Button
                label={t('program.pause.button')}
                disabled={ctx.hasActiveSession}
                onPress={() => setPausing(true)}
              />
              {/* Aktif oturum varken dondurmak plan/sayaç durumunu tutarsız
                  bırakır; önce oturum kapatılmalı. */}
              {ctx.hasActiveSession
                ? <Text variant="caption" color="muted">{t('program.pause.blockedByActive')}</Text>
                : <Text variant="caption" color="faint">{t('program.pause.hint')}</Text>}
            </>
          ) : (
            <>
              <Text variant="label" color="muted">{t('program.pause.reason.title')}</Text>
              <Row wrap>
                {REASONS.map((r) => (
                  <Button
                    key={r.value}
                    label={r.label}
                    kind={reason === r.value ? 'primary' : 'secondary'}
                    onPress={() => setReason(r.value)}
                  />
                ))}
              </Row>
              <Row style={{ justifyContent: 'flex-end' }}>
                <Button label={t('finish.back')} kind="ghost" onPress={() => setPausing(false)} />
                <Button label={t('program.pause.confirm')} kind="primary" busy={pause.busy}
                  onPress={async () => { if (await pause.run(reason)) { setPausing(false); q.reload(); } }} />
              </Row>
            </>
          )}
        </Card>
      )}

      <Divider />

      <Card>
        <Text variant="heading">{t('program.mode.title')}</Text>
        <Segmented<'strictCalendar' | 'activeDays'>
          value={program.calendar_mode === 'activeDays' ? 'activeDays' : 'strictCalendar'}
          disabled={setMode.busy}
          options={[
            { value: 'strictCalendar', label: t('program.mode.strict') },
            { value: 'activeDays', label: t('program.mode.active') },
          ]}
          onChange={async (v) => { if (await setMode.run(v)) q.reload(); }}
        />
        <View style={{ gap: space.xs }}>
          <Text variant="caption" color="muted">
            {program.calendar_mode === 'activeDays' ? t('program.mode.active.hint') : t('program.mode.strict.hint')}
          </Text>
          {strict && active ? (
            <Row>
              <Badge label={t('program.mode.preview', { strict: strict.day, active: active.day })} />
            </Row>
          ) : null}
        </View>
      </Card>
    </Screen>
  );
}
