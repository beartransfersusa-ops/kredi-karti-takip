// Beslenme günlüğü — docs/v90/06-ux-flows.md B.12.
//
// Öğün girdileri ANLIK DEĞER saklar: besin tanımı sonradan düzenlense de
// geçmiş gün toplamları değişmez. "Copy Yesterday" üzerine YAZMAZ, ekler
// (06 açık nokta kararı).
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { newId } from '../../src/platform/id.ts';
import { MEAL_SLOTS, copyDay, loadDay } from '../../src/features/nutrition/nutritionQuery.ts';
import type { MealSlot, NutritionDay, Totals } from '../../src/features/nutrition/nutritionQuery.ts';
import { addDaysKey, dateTr, num, weekdayTr } from '../../src/features/format.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, Row, Screen, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ConfirmDialog } from '../../src/ui/components/ConfirmDialog.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { space } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: tr['nutrition.slot.breakfast'],
  lunch: tr['nutrition.slot.lunch'],
  dinner: tr['nutrition.slot.dinner'],
  snack: tr['nutrition.slot.snack'],
  preWorkout: tr['nutrition.slot.preWorkout'],
  postWorkout: tr['nutrition.slot.postWorkout'],
};

export default function NutritionRoute() {
  return <ErrorBoundary onHome={() => router.replace('/')}><Nutrition /></ErrorBoundary>;
}

function Nutrition() {
  const [offset, setOffset] = useState(0);
  const [confirmCopy, setConfirmCopy] = useState(false);

  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => {
    const todayKey = s.clock.todayKey();
    const dateKey = addDaysKey(todayKey, offset);
    return { day: await loadDay(tx, dateKey), todayKey };
  }), [offset]), [offset]);

  const copyYesterday = useCommand(async (s) => {
    const todayKey = s.clock.todayKey();
    const dateKey = addDaysKey(todayKey, offset);
    await s.db.withTransaction((tx) => copyDay(
      tx, addDaysKey(dateKey, -1), dateKey,
      s.clock.nowUtc().toISOString(), s.clock.timeZone(), newId));
  });

  if (q.loading) {
    return <Screen><Skeleton height={24} width="45%" /><Card><Skeleton height={140} /></Card></Screen>;
  }
  if (q.error || !q.data) return <Screen><ErrorBar message={q.error?.message} onRetry={q.reload} /></Screen>;

  const { day, todayKey } = q.data;
  const isToday = day.dateKey === todayKey;

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Button label="‹" kind="ghost" onPress={() => setOffset((v) => v - 1)} />
        <View style={{ alignItems: 'center' }}>
          <Text variant="heading">{isToday ? 'Bugün' : weekdayTr(day.dateKey)}</Text>
          <Text variant="caption" color="muted">{dateTr(day.dateKey, todayKey)}</Text>
        </View>
        <Button label="›" kind="ghost" disabled={offset >= 0} onPress={() => setOffset((v) => v + 1)} />
      </Row>

      <DayTotals day={day} />

      {copyYesterday.error ? <ErrorBar details={copyYesterday.error.message} /> : null}

      <Row wrap>
        <Button
          label={t('nutrition.copyYesterday')}
          disabled={!day.yesterdayHasData || copyYesterday.busy}
          onPress={() => setConfirmCopy(true)}
        />
        <Button label={t('nutrition.addFood')} kind="primary"
          onPress={() => router.push(`/nutrition/add?date=${day.dateKey}`)} />
      </Row>
      {!day.yesterdayHasData ? (
        <Text variant="caption" color="faint">{t('nutrition.copyYesterday.emptySource')}</Text>
      ) : null}

      <Divider />

      {MEAL_SLOTS.map((slot) => {
        const meals = day.meals.filter((m) => m.slot === slot);
        if (meals.length === 0) return null;
        return (
          <Card key={slot}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="heading">{SLOT_LABEL[slot]}</Text>
              <Text variant="caption" color="muted">
                {`${num(meals.reduce((a, m) => a + m.totals.kcal, 0), 0)} kcal`}
              </Text>
            </Row>
            {meals.flatMap((m) => m.entries).map((e) => (
              <Row key={e.id} style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1}>{e.name}</Text>
                  <Text variant="caption" color="faint">{`${num(e.grams, 0)} g`}</Text>
                </View>
                <Text variant="caption">
                  {`${num(e.kcal, 0)} kcal · P ${num(e.proteinG, 1)}`}
                </Text>
              </Row>
            ))}
            {meals.some((m) => m.note) ? (
              <Text variant="caption" color="faint">{meals.map((m) => m.note).filter(Boolean).join(' · ')}</Text>
            ) : null}
          </Card>
        );
      })}

      {day.meals.length === 0 ? (
        <Card><Text color="muted">Bu gün için kayıt yok.</Text></Card>
      ) : null}

      <ConfirmDialog
        visible={confirmCopy}
        title={t('nutrition.copyYesterday')}
        body={t('nutrition.copyYesterday.confirmAppend')}
        confirmLabel={t('common.add')}
        cancelLabel={t('common.cancel')}
        busy={copyYesterday.busy}
        onCancel={() => setConfirmCopy(false)}
        onConfirm={async () => { if (await copyYesterday.run()) { setConfirmCopy(false); q.reload(); } }}
      />

      <View style={{ height: space.xl }} />
    </Screen>
  );
}

function DayTotals({ day }: { day: NutritionDay }) {
  const { totals, target } = day;
  return (
    <Card>
      <Text variant="label" color="muted">{t('nutrition.dayTotal')}</Text>
      <Text variant="title">{`${num(totals.kcal, 0)} kcal`}</Text>
      <Row wrap>
        <Badge label={`P ${num(totals.proteinG, 1)} g`} />
        <Badge label={`K ${num(totals.carbG, 1)} g`} />
        <Badge label={`Y ${num(totals.fatG, 1)} g`} />
      </Row>
      {target ? (
        <>
          <Text variant="caption" color="muted">
            {t('nutrition.target', { kcal: target.kcal, p: target.proteinG })}
          </Text>
          <Remaining totals={totals} target={target} />
        </>
      ) : (
        // Hedef tanımlı değilse "0 kcal kaldı" gibi yanıltıcı bir şey YAZILMAZ.
        <Text variant="caption" color="faint">Kalori hedefi tanımlı değil.</Text>
      )}
    </Card>
  );
}

function Remaining({ totals, target }: { totals: Totals; target: { kcal: number; proteinG: number } }) {
  const kcalLeft = target.kcal - totals.kcal;
  const pLeft = target.proteinG - totals.proteinG;
  return (
    <Row wrap>
      <Badge tone={kcalLeft < 0 ? 'warning' : 'neutral'}
        label={kcalLeft >= 0 ? `${num(kcalLeft, 0)} kcal kaldı` : `${num(-kcalLeft, 0)} kcal fazla`} />
      <Badge tone={pLeft > 0 ? 'neutral' : 'primary'}
        label={pLeft > 0 ? `P ${num(pLeft, 1)} g kaldı` : 'protein hedefi tamam'} />
    </Row>
  );
}
