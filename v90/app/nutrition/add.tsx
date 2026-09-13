// Besin ekleme — docs/v90/06-ux-flows.md B.12 (arama + gram girişi).
//
// NOT: besin seed'i (§111 USDA / TR etiket) henüz üretilmedi; bu yüzden arama
// yalnızca kullanıcının kendi eklediği besinleri ve tarifleri bulur. Kaynak
// rozeti her satırda gösterilir ki değerin nereden geldiği belirsiz kalmasın
// (R111.1, R111.4).
import { useCallback, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { TextInput, View } from 'react-native';
import { newId } from '../../src/platform/id.ts';
import { MEAL_SLOTS } from '../../src/features/nutrition/nutritionQuery.ts';
import type { MealSlot } from '../../src/features/nutrition/nutritionQuery.ts';
import { insertSavedMeal, listSavedMeals, recentFoodIds, toggleFavorite } from '../../src/features/nutrition/copyService.ts';
import { addRecipeToMeal, listRecipes } from '../../src/features/nutrition/recipeQuery.ts';
import { num } from '../../src/features/format.ts';
import { useCommand, useDbQuery } from '../../src/ui/AppProvider.tsx';
import {
  Badge, Button, Card, Divider, ErrorBar, NumericStepper, Row, Screen, Segmented, Text,
} from '../../src/ui/components/primitives.tsx';
import { ErrorBoundary } from '../../src/ui/components/ErrorBoundary.tsx';
import { radius, space, usePalette } from '../../src/ui/theme.ts';
import { t, tr } from '../../src/ui/i18n/index.ts';

interface FoodRow {
  id: string; name: string; brand: string | null; source: string;
  serving_unit: string; serving_size_g: number | null;
  kcal_per_100g: number; protein_g_per_100g: number;
  carb_g_per_100g: number; fat_g_per_100g: number; fiber_g_per_100g: number | null;
  is_favorite: number;
}

/** Yeni besin formunda kullanıcının girdiği alanlar (100 g bazlı). */
type NewFoodInput = Pick<FoodRow,
  'name' | 'brand' | 'kcal_per_100g' | 'protein_g_per_100g' | 'carb_g_per_100g' | 'fat_g_per_100g' | 'fiber_g_per_100g'>;

type Tab = 'recent' | 'favorites' | 'saved' | 'recipes' | 'all';

const UNIT_LABEL: Record<string, string> = { piece: 'adet', scoop: 'ölçek', slice: 'dilim', g: 'g', ml: 'ml' };

const SOURCE_LABEL: Record<string, string> = {
  'seed:usda': tr['nutrition.source.seedUsda'],
  'seed:tr-label': tr['nutrition.source.seedTrLabel'],
  user: tr['nutrition.source.user'],
  'label-override': tr['nutrition.source.labelOverride'],
};

export default function AddFoodRoute() {
  return <ErrorBoundary onHome={() => router.back()}><AddFood /></ErrorBoundary>;
}

function AddFood() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const c = usePalette();
  const [query, setQuery] = useState('');
  const [slot, setSlot] = useState<MealSlot>('breakfast');
  const [picked, setPicked] = useState<FoodRow | null>(null);
  const [grams, setGrams] = useState<number | null>(100);
  const [servings, setServings] = useState<number | null>(1);
  const [creating, setCreating] = useState(false);
  // "Son" varsayılan sekme (B.12); arama yazılınca "Tümü"ne geçilir.
  const [tab, setTab] = useState<Tab>('recent');

  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => {
    const like = `%${query.trim()}%`;
    const base = `SELECT f.id, f.name, f.brand, f.source, f.serving_unit, f.serving_size_g,
                         f.kcal_per_100g, f.protein_g_per_100g, f.carb_g_per_100g, f.fat_g_per_100g, f.fiber_g_per_100g,
                         CASE WHEN ff.food_id IS NULL THEN 0 ELSE 1 END AS is_favorite
                  FROM food_items f LEFT JOIN food_favorites ff ON ff.food_id = f.id
                  WHERE f.is_deleted = 0 AND f.name LIKE ?`;
    const effective: Tab = query.trim() ? 'all' : tab;
    let foods: FoodRow[] = [];
    if (effective === 'recent') {
      const ids = await recentFoodIds(tx, s.clock.todayKey());
      const rows = ids.length ? await tx.all<FoodRow>(`${base} AND f.id IN (${ids.map(() => '?').join(',')})`, [like, ...ids]) : [];
      const order = new Map(ids.map((id, i) => [id, i]));
      foods = rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    } else if (effective === 'favorites') {
      foods = await tx.all<FoodRow>(`${base} AND ff.food_id IS NOT NULL ORDER BY f.name`, [like]);
    } else if (effective === 'all') {
      foods = await tx.all<FoodRow>(`${base} ORDER BY f.name LIMIT 50`, [like]);
    }
    return {
      effective, foods,
      saved: effective === 'saved' ? await listSavedMeals(tx) : [],
      recipes: effective === 'recipes' ? await listRecipes(tx) : [],
    };
  }), [query, tab]), [query, tab]);

  const favorite = useCommand(async (s, foodId: string) => {
    await s.db.withTransaction((tx) => toggleFavorite(tx, s.clock, foodId));
  });
  const addSaved = useCommand(async (s, savedMealId: string) => {
    await s.db.withTransaction((tx) => insertSavedMeal(tx, s.clock, newId, { savedMealId, toDateKey: date, slot }));
  });
  const addRecipe = useCommand(async (s, recipeId: string, portionG: number) => {
    await s.db.withTransaction((tx) => addRecipeToMeal(tx, s.clock, newId, { recipeId, dateKey: date, slot, portionG }));
  });
  const [recipePick, setRecipePick] = useState<{ id: string; name: string } | null>(null);
  const [portionG, setPortionG] = useState<number | null>(250);

  const log = useCommand(async (s) => {
    if (!picked || grams === null || grams <= 0) return;
    const factor = grams / 100;
    await s.db.withTransaction(async (tx) => {
      const now = s.clock.nowUtc().toISOString();
      const logId = newId();
      await tx.exec(
        `INSERT INTO meal_logs (id, local_date_key, time_zone, logged_at_utc, meal_slot)
         VALUES (?,?,?,?,?)`, [logId, date, s.clock.timeZone(), now, slot]);
      // Anlık değerler yazılır: besin sonradan düzenlense de bu kayıt değişmez.
      await tx.exec(
        `INSERT INTO meal_entries
           (id, meal_log_id, food_id, grams, kcal_snapshot, protein_g_snapshot,
            carb_g_snapshot, fat_g_snapshot, fiber_g_snapshot, order_index)
         VALUES (?,?,?,?,?,?,?,?,?,0)`,
        [newId(), logId, picked.id, grams,
          picked.kcal_per_100g * factor, picked.protein_g_per_100g * factor,
          picked.carb_g_per_100g * factor, picked.fat_g_per_100g * factor,
          picked.fiber_g_per_100g === null ? null : picked.fiber_g_per_100g * factor]);
    });
  });

  const createFood = useCommand(async (s, food: NewFoodInput) => {
    const id = newId();
    await s.db.withTransaction(async (tx) => {
      await tx.exec(
        `INSERT INTO food_items
           (id, name, brand, source, serving_unit, kcal_per_100g, protein_g_per_100g,
            carb_g_per_100g, fat_g_per_100g, fiber_g_per_100g, last_updated, custom_edited)
         VALUES (?,?,?,'user','g',?,?,?,?,?,?,1)`,
        [id, food.name, food.brand, food.kcal_per_100g, food.protein_g_per_100g,
          food.carb_g_per_100g, food.fat_g_per_100g, food.fiber_g_per_100g,
          s.clock.nowUtc().toISOString()]);
    });
    // Kullanıcı besini gram bazlı girilir; porsiyon/favori satır varsayılanlarıdır.
    setPicked({ ...food, id, source: 'user', serving_unit: 'g', serving_size_g: null, is_favorite: 0 });
    setCreating(false);
  });

  return (
    <Screen>
      <Segmented<MealSlot>
        value={slot}
        options={MEAL_SLOTS.slice(0, 3).map((s) => ({ value: s, label: (tr as Record<string, string>)[`nutrition.slot.${s}`]! }))}
        onChange={setSlot}
      />
      <Row wrap>
        {MEAL_SLOTS.slice(3).map((s) => (
          <Button key={s} label={(tr as Record<string, string>)[`nutrition.slot.${s}`]!}
            kind={slot === s ? 'primary' : 'secondary'} onPress={() => setSlot(s)} />
        ))}
      </Row>

      <TextInput
        placeholder={t('nutrition.search.placeholder')}
        placeholderTextColor={c.textFaint}
        value={query}
        onChangeText={setQuery}
        style={{
          minHeight: 44, borderRadius: radius.md, paddingHorizontal: space.md,
          backgroundColor: c.surface, color: c.text,
          borderWidth: 1, borderColor: c.border,
        }}
      />

      {picked ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="heading" style={{ flex: 1 }}>{picked.name}</Text>
            <Badge label={SOURCE_LABEL[picked.source] ?? picked.source} />
          </Row>
          {picked.serving_unit !== 'g' && picked.serving_unit !== 'ml' && picked.serving_size_g ? (
            <NumericStepper
              label={t('nutrition.servings', { unit: UNIT_LABEL[picked.serving_unit] ?? picked.serving_unit, g: picked.serving_size_g })}
              value={servings} step={0.5} min={0} max={50} decimals={1}
              onChange={(v) => { setServings(v); setGrams(Math.round(v * picked.serving_size_g!)); }}
            />
          ) : null}
          <NumericStepper label={t('nutrition.grams')} value={grams} onChange={(v) => { setGrams(v); setServings(null); }}
            step={10} min={0} max={5000} decimals={0} />
          {grams !== null && grams > 0 ? (
            <Row wrap>
              <Badge label={`${num(picked.kcal_per_100g * grams / 100, 0)} kcal`} />
              <Badge label={`P ${num(picked.protein_g_per_100g * grams / 100, 1)} g`} />
              <Badge label={`K ${num(picked.carb_g_per_100g * grams / 100, 1)} g`} />
              <Badge label={`Y ${num(picked.fat_g_per_100g * grams / 100, 1)} g`} />
            </Row>
          ) : null}
          {log.error ? <ErrorBar details={log.error.message} onRetry={() => void log.run()} /> : null}
          <Row>
            <Button label={t('common.cancel')} kind="ghost" onPress={() => setPicked(null)} />
            <Button label={t('common.add')} kind="primary" busy={log.busy}
              disabled={grams === null || grams <= 0}
              onPress={async () => { if (await log.run()) router.back(); }} />
          </Row>
        </Card>
      ) : null}

      <Divider />

      <Segmented<Tab>
        value={q.data?.effective ?? tab}
        disabled={!!query.trim()}
        options={[
          { value: 'recent', label: t('nutrition.search.tab.recent') },
          { value: 'favorites', label: t('nutrition.search.tab.favorites') },
          { value: 'saved', label: t('nutrition.savedMeal.tab') },
          { value: 'recipes', label: t('nutrition.search.tab.recipes') },
          { value: 'all', label: t('nutrition.search.tab.all') },
        ]}
        onChange={setTab}
      />

      {addSaved.error ? <ErrorBar details={addSaved.error.message} /> : null}
      {q.data?.saved.map((m) => (
        <Card key={m.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><Text>{m.name}</Text><Text variant="caption" color="faint">{`${m.itemCount} kalem`}</Text></View>
            <Button label={t('common.add')} kind="primary" busy={addSaved.busy}
              onPress={async () => { if (await addSaved.run(m.id)) router.back(); }} />
          </Row>
        </Card>
      ))}

      {addRecipe.error ? <ErrorBar details={addRecipe.error.message} /> : null}
      {q.data?.recipes.map((r) => (
        <Card key={r.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text>{r.name}</Text>
              {r.cookedYieldG === null ? <Text variant="caption" color="warning">{t('recipe.noCookedYield')}</Text> : null}
            </View>
            <Button label="Seç" onPress={() => setRecipePick({ id: r.id, name: r.name })} />
          </Row>
          {recipePick?.id === r.id ? (
            <>
              <NumericStepper label={t('recipe.portion')} value={portionG} onChange={setPortionG} step={25} min={0} max={5000} decimals={0} />
              <Button label={t('recipe.addToMeal')} kind="primary" busy={addRecipe.busy} disabled={!portionG}
                onPress={async () => { if (portionG && await addRecipe.run(r.id, portionG)) router.back(); }} />
            </>
          ) : null}
        </Card>
      ))}
      {q.data?.effective === 'recipes' && q.data.recipes.length === 0 ? (
        <Button label={t('recipe.title')} onPress={() => router.push(`/nutrition/recipe?date=${date}`)} />
      ) : null}

      {q.data?.foods.map((f) => (
        <Card key={f.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text>{f.name}</Text>
              <Text variant="caption" color="faint">
                {`${num(f.kcal_per_100g, 0)} kcal · P ${num(f.protein_g_per_100g, 1)} / 100 g`}
              </Text>
            </View>
            <Badge label={SOURCE_LABEL[f.source] ?? f.source} />
          </Row>
          <Row>
            <Button label="Seç" onPress={() => {
              setPicked(f);
              const g = f.serving_unit !== 'g' && f.serving_unit !== 'ml' && f.serving_size_g ? f.serving_size_g : 100;
              setGrams(g); setServings(1);
            }} />
            <Button label={f.is_favorite ? '★' : '☆'} kind="ghost" busy={favorite.busy}
              accessibilityHint={f.is_favorite ? t('nutrition.favorite.remove') : t('nutrition.favorite.add')}
              onPress={() => void favorite.run(f.id)} />
          </Row>
        </Card>
      ))}

      {q.data && q.data.effective !== 'saved' && q.data.effective !== 'recipes' && q.data.foods.length === 0 ? (
        <Card>
          <Text color="muted">{t('nutrition.search.empty')}</Text>
          {!creating
            ? <Button label="Yeni besin ekle" kind="primary" onPress={() => setCreating(true)} />
            : <NewFoodForm busy={createFood.busy} error={createFood.error}
                initialName={query} onSubmit={(f) => void createFood.run(f)} />}
        </Card>
      ) : null}

      <View style={{ height: space.xxl }} />
    </Screen>
  );
}

function NewFoodForm(p: {
  initialName: string; busy: boolean; error: Error | null;
  onSubmit: (f: NewFoodInput) => void;
}) {
  const c = usePalette();
  const [name, setName] = useState(p.initialName);
  const [kcal, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [carb, setCarb] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);

  return (
    <View style={{ gap: space.md }}>
      <TextInput
        placeholder="Besin adı" placeholderTextColor={c.textFaint}
        value={name} onChangeText={setName}
        style={{
          minHeight: 44, borderRadius: radius.md, paddingHorizontal: space.md,
          backgroundColor: c.surfaceAlt, color: c.text,
        }}
      />
      <Text variant="caption" color="faint">100 gram için değerler</Text>
      <NumericStepper label="Kalori (kcal)" value={kcal} onChange={setKcal} step={5} min={0} max={900} decimals={0} />
      <NumericStepper label="Protein (g)" value={protein} onChange={setProtein} step={0.5} min={0} max={100} decimals={1} />
      <NumericStepper label="Karbonhidrat (g)" value={carb} onChange={setCarb} step={0.5} min={0} max={100} decimals={1} />
      <NumericStepper label="Yağ (g)" value={fat} onChange={setFat} step={0.5} min={0} max={100} decimals={1} />
      {p.error ? <ErrorBar details={p.error.message} /> : null}
      <Button
        label={t('common.save')} kind="primary" busy={p.busy}
        disabled={!name.trim() || kcal === null || protein === null || carb === null || fat === null}
        onPress={() => p.onSubmit({
          name: name.trim(), brand: null,
          kcal_per_100g: kcal!, protein_g_per_100g: protein!,
          carb_g_per_100g: carb!, fat_g_per_100g: fat!, fiber_g_per_100g: null,
        })}
      />
    </View>
  );
}
