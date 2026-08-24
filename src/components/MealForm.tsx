import Ionicons from '@expo/vector-icons/Ionicons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FoodPicker } from '@/components/FoodPicker';
import { Button, Card, ErrorNote, Input, Muted, Row, SectionLabel, StatTile } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { dateTimeLabel } from '@/lib/day';
import { createMeal, updateMeal, type NewIngredient } from '@/lib/queries';
import type { Micronutrients } from '@/lib/types';

/**
 * Ingredient rows are held as strings while editing, not numbers. A controlled
 * numeric TextInput that runs every keystroke through Number() fights the user
 * — it eats the "." in "12." and turns a cleared field into 0. Parsing happens
 * once, on save.
 */
type Draft = {
  key: string;
  name: string;
  weight_g: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  fdc_id: number | null;
  micronutrients: Micronutrients;
};

let keySeq = 0;
const newKey = () => `row-${keySeq++}`;

function emptyDraft(): Draft {
  return {
    key: newKey(),
    name: '',
    weight_g: '',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
    fdc_id: null,
    micronutrients: {},
  };
}

function toDraft(i: NewIngredient): Draft {
  const round = (n: number) => (Math.round(n * 10) / 10).toString();
  return {
    key: newKey(),
    name: i.name,
    weight_g: round(i.weight_g),
    calories: round(i.calories),
    protein_g: round(i.protein_g),
    carbs_g: round(i.carbs_g),
    fat_g: round(i.fat_g),
    fdc_id: i.fdc_id ?? null,
    micronutrients: i.micronutrients ?? {},
  };
}

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export function MealForm({
  mealId,
  initialName,
  initialEatenAt,
  initialIngredients,
}: {
  mealId?: string;
  initialName?: string;
  initialEatenAt?: string;
  initialIngredients?: NewIngredient[];
}) {
  const [name, setName] = useState(initialName ?? '');
  const [eatenAt, setEatenAt] = useState(
    initialEatenAt ? new Date(initialEatenAt) : new Date()
  );
  const [showPicker, setShowPicker] = useState(false);
  const [rows, setRows] = useState<Draft[]>(
    initialIngredients?.length ? initialIngredients.map(toDraft) : [emptyDraft()]
  );
  const [foodPickerOpen, setFoodPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function patch(key: string, field: keyof Draft, value: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  const totals = rows.reduce(
    (t, r) => ({
      calories: t.calories + num(r.calories),
      protein: t.protein + num(r.protein_g),
      carbs: t.carbs + num(r.carbs_g),
      fat: t.fat + num(r.fat_g),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  async function save() {
    const ingredients: NewIngredient[] = rows
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        name: r.name.trim(),
        fdc_id: r.fdc_id,
        weight_g: num(r.weight_g),
        calories: num(r.calories),
        protein_g: num(r.protein_g),
        carbs_g: num(r.carbs_g),
        fat_g: num(r.fat_g),
        micronutrients: r.micronutrients,
      }));

    if (!name.trim()) return setError('Give the meal a name.');
    if (ingredients.length === 0) return setError('Add at least one ingredient.');

    setError(null);
    setSaving(true);
    try {
      const payload = { name: name.trim(), eatenAtIso: eatenAt.toISOString(), ingredients };
      if (mealId) await updateMeal(mealId, payload);
      else await createMeal(payload);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {error && <ErrorNote message={error} />}

        <Card>
          <Input label="Meal name" value={name} onChangeText={setName} placeholder="e.g. Chicken and rice" />
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.inputLabel}>Eaten at</Text>
            <Pressable style={styles.dateBtn} onPress={() => setShowPicker((v) => !v)}>
              <Text style={styles.dateText}>{dateTimeLabel(eatenAt.toISOString())}</Text>
              <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
            </Pressable>
            {showPicker && (
              <DateTimePicker
                value={eatenAt}
                mode="datetime"
                display="spinner"
                themeVariant="dark"
                maximumDate={new Date()}
                onChange={(_, d) => d && setEatenAt(d)}
              />
            )}
          </View>
        </Card>

        <Card>
          <Row>
            <SectionLabel>Totals</SectionLabel>
          </Row>
          <Row>
            <StatTile value={Math.round(totals.calories).toLocaleString()} label="kcal" accent />
            <StatTile value={`${Math.round(totals.protein)}g`} label="Protein" />
            <StatTile value={`${Math.round(totals.carbs)}g`} label="Carbs" />
            <StatTile value={`${Math.round(totals.fat)}g`} label="Fat" />
          </Row>
        </Card>

        <Button
          title="＋ Add from library or past meals"
          variant="secondary"
          onPress={() => setFoodPickerOpen(true)}
        />

        {rows.map((r, idx) => (
          <Card key={r.key}>
            <Row>
              <SectionLabel>Ingredient {idx + 1}</SectionLabel>
              {rows.length > 1 && (
                <Pressable
                  hitSlop={10}
                  onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              )}
            </Row>

            <Input
              value={r.name}
              onChangeText={(v) => patch(r.key, 'name', v)}
              placeholder="Ingredient name"
            />

            <Row style={{ gap: spacing.sm }}>
              <Input
                label="Grams"
                value={r.weight_g}
                onChangeText={(v) => patch(r.key, 'weight_g', v)}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <Input
                label="Calories"
                value={r.calories}
                onChangeText={(v) => patch(r.key, 'calories', v)}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </Row>

            <Row style={{ gap: spacing.sm }}>
              <Input
                label="Protein g"
                value={r.protein_g}
                onChangeText={(v) => patch(r.key, 'protein_g', v)}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <Input
                label="Carbs g"
                value={r.carbs_g}
                onChangeText={(v) => patch(r.key, 'carbs_g', v)}
                keyboardType="decimal-pad"
                placeholder="0"
              />
              <Input
                label="Fat g"
                value={r.fat_g}
                onChangeText={(v) => patch(r.key, 'fat_g', v)}
                keyboardType="decimal-pad"
                placeholder="0"
              />
            </Row>
          </Card>
        ))}

        <Button
          title="＋ Add another ingredient"
          variant="secondary"
          onPress={() => setRows((rs) => [...rs, emptyDraft()])}
        />

        <Muted style={{ fontSize: 12 }}>
          Every ingredient you save is added to your food library automatically, at per-100g, so
          you can reuse it next time.
        </Muted>

        <Button title={mealId ? 'Save changes' : 'Log meal'} onPress={save} busy={saving} />
      </ScrollView>

      <FoodPicker
        visible={foodPickerOpen}
        onClose={() => setFoodPickerOpen(false)}
        onPickIngredients={(ings) =>
          setRows((rs) => {
            // Drop a single untouched blank row so picking into a fresh form
            // does not leave an empty ingredient above the picked one.
            const base = rs.length === 1 && rs[0].name === '' ? [] : rs;
            return [...base, ...ings.map(toDraft)];
          })
        }
        onPickMealName={(n) => setName((cur) => cur || n)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  inputLabel: { color: colors.textMuted, fontSize: 13 },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 12,
  },
  dateText: { color: colors.text, fontSize: 16 },
});
