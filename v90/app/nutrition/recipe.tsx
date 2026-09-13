// Tarif oluşturucu — docs/v90/06-ux-flows.md B.13 (R110).
//
// Cooked yield YOKSA ham toplam kullanılır ve bu AÇIKÇA yazılır (R110.5):
// "100 g pişmiş başına" ile "100 g ham başına" farklı şeylerdir ve
// hangisinin kullanıldığını gizlemek sahte kesinlik olurdu (R123).
import { useCallback, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { TextInput, View } from 'react-native';
import { newId } from '../../src/platform/id.ts';
import {
  addRecipeToMeal, draftNutrition, emptyDraft, loadFoods, loadRecipe, portion,
  saveRecipe, toPer100g,
} from '../../src/features/nutrition/recipeQuery.ts';
import type { FoodRow, RecipeDraft } from '../../src/features/nutrition/recipeQuery.ts';
import { MEAL_SLOTS } from '../../src/features/nutrition/nutritionQuery.ts';
import type { MealSlot } from '../../src/features/nutrition/nutritionQuery.ts';
import { num, UNKNOWN } from '../../src/features/format.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, NumericStepper, Row, Screen, Segmented, Skeleton, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { radius, space, usePalette } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

export default function RecipeRoute() {
  return <ErrorBoundary onHome={() => router.back()}><RecipeBuilderScreen /></ErrorBoundary>;
}

function RecipeBuilderScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const c = usePalette();
  const [draft, setDraft] = useState<RecipeDraft | null>(params.id ? null : emptyDraft());
  const [portionG, setPortionG] = useState<number | null>(null);
  const [slot, setSlot] = useState<MealSlot>('lunch');
  const [picking, setPicking] = useState(false);

  // Düzenleme: tarif ve mevcut besinler.
  const loaded = useDbQuery(useCallback(async (s) => {
    if (!params.id) return null;
    return s.db.withTransaction((tx) => loadRecipe(tx, params.id!));
  }, [params.id]), [params.id]);

  const current = draft ?? loaded.data ?? null;

  // Malzemelerin besin değerleri.
  const foodsQ = useDbQuery(useCallback(async (s) => {
    const ids = current?.ingredients.map((i) => i.foodId) ?? [];
    return s.db.withTransaction((tx) => loadFoods(tx, ids));
  }, [current?.ingredients.map((i) => i.foodId).join(',')]),
  [current?.ingredients.map((i) => i.foodId).join(',')]);

  const nutrition = useMemo(() => {
    if (!current || !foodsQ.data) return null;
    return draftNutrition(current, new Map([...foodsQ.data].map(([k, v]) => [k, toPer100g(v)])));
  }, [current, foodsQ.data]);

  const save = useCommand(async (s) => {
    if (!current) return;
    await s.db.withTransaction((tx) => saveRecipe(tx, s.clock, newId, current));
  });

  const addToMeal = useCommand(async (s) => {
    if (!current?.id || portionG === null || !params.date) return;
    await s.db.withTransaction((tx) => addRecipeToMeal(tx, s.clock, newId, {
      recipeId: current.id!, dateKey: params.date!, slot, portionG,
    }));
  });

  if (params.id && loaded.loading) {
    return <Screen><Skeleton height={24} width="45%" /><Card><Skeleton height={180} /></Card></Screen>;
  }
  if (!current) return <Screen><Text color="muted">Tarif bulunamadı.</Text></Screen>;

  const update = (patch: Partial<RecipeDraft>) => setDraft({ ...current, ...patch });
  const portionResult = nutrition && portionG !== null && portionG > 0
    ? portion(nutrition, portionG) : null;

  return (
    <Screen>
      <Text variant="title">{t('recipe.title')}</Text>

      <TextInput
        placeholder={t('recipe.name')}
        placeholderTextColor={c.textFaint}
        value={current.name}
        onChangeText={(v) => update({ name: v })}
        style={{
          minHeight: 44, borderRadius: radius.md, paddingHorizontal: space.md,
          backgroundColor: c.surface, color: c.text,
          borderWidth: 1, borderColor: c.border,
        }}
      />

      {/* ── Malzemeler */}
      <Card>
        <Text variant="heading">Malzemeler</Text>
        {current.ingredients.length === 0 ? (
          // Boş tarifte toplam "0" DEĞİL "—" gösterilir (B.13 "Boş" durumu).
          <Text color="muted">{`Toplam: ${UNKNOWN}`}</Text>
        ) : null}

        {current.ingredients.map((ing, i) => (
          <Row key={`${ing.foodId}-${i}`} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1}>{ing.foodName}</Text>
              <Text variant="caption" color="faint">{`${num(ing.grams, 0)} g`}</Text>
            </View>
            <Button
              label={t('nutrition.entry.delete')} kind="ghost"
              onPress={() => update({ ingredients: current.ingredients.filter((_, n) => n !== i) })}
            />
          </Row>
        ))}

        <Button label={t('recipe.addIngredient')} onPress={() => setPicking(true)} />
      </Card>

      {picking ? (
        <IngredientPicker
          onCancel={() => setPicking(false)}
          onPick={(food, grams) => {
            update({
              ingredients: [...current.ingredients,
                { foodId: food.id, foodName: food.name, grams }],
            });
            setPicking(false);
          }}
        />
      ) : null}

      {/* ── Pişmiş ağırlık */}
      <Card>
        <NumericStepper
          label={t('recipe.cookedYield')}
          hint={t('recipe.cookedYield.hint')}
          value={current.cookedYieldG}
          onChange={(v) => update({ cookedYieldG: v })}
          step={10} min={0} max={20000} decimals={0}
        />
        {current.cookedYieldG === null || current.cookedYieldG === 0 ? (
          <Text variant="caption" color="warning">{t('recipe.noCookedYield')}</Text>
        ) : null}
      </Card>

      {/* ── Özet */}
      {nutrition ? (
        <Card tone={nutrition.warnings.includes('yieldImplausible') ? 'warning' : 'default'}>
          <Text variant="caption" color="muted">
            {t('recipe.rawTotal', { g: num(nutrition.rawTotalG, 0) })}
          </Text>
          <Text variant="heading">
            {t('recipe.total', {
              kcal: num(nutrition.total.kcal, 0), p: num(nutrition.total.proteinG, 1),
              c: num(nutrition.total.carbG, 1), f: num(nutrition.total.fatG, 1),
            })}
          </Text>
          <Divider />
          {/* HANGİ TABAN kullanıldığı açıkça yazılır (R110.5). */}
          <Badge
            tone={nutrition.basis === 'cookedYield' ? 'primary' : 'warning'}
            label={nutrition.basis === 'cookedYield' ? t('recipe.per100.cooked') : t('recipe.per100.raw')}
          />
          <Text>
            {`${num(nutrition.per100g.kcal, 0)} kcal · P ${num(nutrition.per100g.proteinG, 1)} · `
              + `K ${num(nutrition.per100g.carbG, 1)} · Y ${num(nutrition.per100g.fatG, 1)}`}
          </Text>
          {nutrition.warnings.includes('yieldImplausible') ? (
            // Uyarı kaydetmeyi ENGELLEMEZ (B.13 "Uyarı" durumu).
            <Text variant="caption" color="danger">{t('recipe.cookedYield.unusual')}</Text>
          ) : null}
          {nutrition.warnings.includes('ingredientMissing') ? (
            <Text variant="caption" color="danger">Bazı malzemelerin besin değeri bulunamadı.</Text>
          ) : null}
        </Card>
      ) : null}

      {/* ── Porsiyon hesaplayıcı */}
      {nutrition ? (
        <Card>
          <NumericStepper
            label={t('recipe.portion')} value={portionG} onChange={setPortionG}
            step={25} min={0} max={5000} decimals={0}
          />
          {portionResult ? (
            <Text>
              {t('recipe.portionResult', {
                g: num(portionG, 0),
                kcal: num(portionResult.macros.kcal, 0),
                p: num(portionResult.macros.proteinG, 1),
                c: num(portionResult.macros.carbG, 1),
                f: num(portionResult.macros.fatG, 1),
              })}
            </Text>
          ) : null}
          {portionResult?.warnings.includes('portionExceedsBasis') ? (
            <Text variant="caption" color="warning">
              Porsiyon, hesap tabanından büyük. Değerler yine de oranla hesaplandı.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {save.error ? <ErrorBar details={save.error.message} onRetry={() => void save.run()} /> : null}
      {addToMeal.error ? <ErrorBar details={addToMeal.error.message} /> : null}

      <Button
        label={t('recipe.save')} kind="primary" busy={save.busy}
        disabled={!current.name.trim() || current.ingredients.length === 0}
        onPress={async () => {
          if (await save.run()) {
            if (!params.date) router.back();
            else loaded.reload();
          }
        }}
      />

      {/* Öğüne ekleme yalnızca kayıtlı tarif için anlamlı. */}
      {params.date && current.id ? (
        <Card>
          <Text variant="heading">{t('recipe.addToMeal')}</Text>
          <Segmented<MealSlot>
            value={slot}
            options={MEAL_SLOTS.slice(0, 3).map((sl) => ({
              value: sl, label: (tr as Record<string, string>)[`nutrition.slot.${sl}`]!,
            }))}
            onChange={setSlot}
          />
          <Button
            label={t('common.add')} kind="primary" busy={addToMeal.busy}
            disabled={portionG === null || portionG <= 0}
            onPress={async () => { if (await addToMeal.run()) router.back(); }}
          />
        </Card>
      ) : null}

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}

/** Malzeme seçici: besin ara + gram gir (B.13 adım 2). */
function IngredientPicker(p: { onCancel: () => void; onPick: (food: FoodRow, grams: number) => void }) {
  const c = usePalette();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<FoodRow | null>(null);
  const [grams, setGrams] = useState<number | null>(100);

  const q = useDbQuery(useCallback((s) => s.db.withTransaction((tx) =>
    tx.all<FoodRow>(
      `SELECT * FROM food_items WHERE is_deleted = 0 AND name LIKE ? ORDER BY name LIMIT 30`,
      [`%${query.trim()}%`])), [query]), [query]);

  return (
    <Card>
      <TextInput
        placeholder={t('nutrition.search.placeholder')}
        placeholderTextColor={c.textFaint}
        value={query} onChangeText={setQuery} autoFocus
        style={{
          minHeight: 44, borderRadius: radius.md, paddingHorizontal: space.md,
          backgroundColor: c.surfaceAlt, color: c.text,
        }}
      />

      {picked ? (
        <>
          <Text variant="heading">{picked.name}</Text>
          <NumericStepper
            label={t('nutrition.grams')} value={grams} onChange={setGrams}
            step={10} min={0} max={5000} decimals={0}
          />
          {/* Gram 0 olamaz (R110 / validation.positiveGrams). */}
          {grams !== null && grams <= 0
            ? <Text color="danger">{t('validation.positiveGrams')}</Text>
            : null}
          <Row style={{ justifyContent: 'flex-end' }}>
            <Button label={t('common.cancel')} kind="ghost" onPress={() => setPicked(null)} />
            <Button
              label={t('common.add')} kind="primary"
              disabled={grams === null || grams <= 0}
              onPress={() => { if (grams && grams > 0) p.onPick(picked, grams); }}
            />
          </Row>
        </>
      ) : (
        <>
          {q.data?.map((f) => (
            <Row key={f.id} style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1}>{f.name}</Text>
                <Text variant="caption" color="faint">
                  {`${num(f.kcal_per_100g, 0)} kcal / 100 g`}
                </Text>
              </View>
              <Button label="Seç" onPress={() => { setPicked(f); setGrams(100); }} />
            </Row>
          ))}
          {q.data && q.data.length === 0 ? (
            <Text color="muted">{t('nutrition.search.empty')}</Text>
          ) : null}
          <Button label={t('common.cancel')} kind="ghost" onPress={p.onCancel} />
        </>
      )}
    </Card>
  );
}
