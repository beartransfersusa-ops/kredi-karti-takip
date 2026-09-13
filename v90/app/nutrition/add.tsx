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
  kcal_per_100g: number; protein_g_per_100g: number;
  carb_g_per_100g: number; fat_g_per_100g: number; fiber_g_per_100g: number | null;
}

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
  const [creating, setCreating] = useState(false);

  const q = useDbQuery(useCallback((s) => s.db.withTransaction(async (tx) => {
    const like = `%${query.trim()}%`;
    return tx.all<FoodRow>(
      `SELECT id, name, brand, source, kcal_per_100g, protein_g_per_100g,
              carb_g_per_100g, fat_g_per_100g, fiber_g_per_100g
       FROM food_items WHERE is_deleted = 0 AND name LIKE ? ORDER BY name LIMIT 50`, [like]);
  }), [query]), [query]);

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

  const createFood = useCommand(async (s, food: Omit<FoodRow, 'id' | 'source'>) => {
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
    setPicked({ ...food, id, source: 'user' });
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
          <NumericStepper label={t('nutrition.grams')} value={grams} onChange={setGrams}
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

      {q.data?.map((f) => (
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
          <Button label="Seç" onPress={() => { setPicked(f); setGrams(100); }} />
        </Card>
      ))}

      {q.data && q.data.length === 0 ? (
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
  onSubmit: (f: Omit<FoodRow, 'id' | 'source'>) => void;
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
