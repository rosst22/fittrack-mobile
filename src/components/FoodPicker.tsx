import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Chip, EmptyState, ErrorNote, Muted, Row } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { prettyDate, dayKey } from '@/lib/day';
import {
  deleteFoodLibraryItem,
  getFoodLibrary,
  getRecentMeals,
  toggleFoodFavorite,
  type NewIngredient,
} from '@/lib/queries';
import type { FoodLibraryItem, MealWithIngredients, Micronutrients } from '@/lib/types';

type Tab = 'favorites' | 'all' | 'meals';

/**
 * Picks ingredients out of the personal food library, or re-logs a whole past
 * meal. Mirrors the web app's three-tab picker.
 *
 * Library rows are stored per 100 g; a picked item is scaled to a default
 * 100 g serving that the user then edits on the form.
 */
export function FoodPicker({
  visible,
  onClose,
  onPickIngredients,
  onPickMealName,
}: {
  visible: boolean;
  onClose: () => void;
  onPickIngredients: (ingredients: NewIngredient[]) => void;
  onPickMealName: (name: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('favorites');
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState<FoodLibraryItem[] | null>(null);
  const [meals, setMeals] = useState<MealWithIngredients[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError(null);
    (async () => {
      try {
        if (tab === 'meals') setMeals(await getRecentMeals());
        else setLibrary(await getFoodLibrary());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load.');
      }
    })();
  }, [visible, tab]);

  const filteredLibrary = useMemo(() => {
    if (!library) return null;
    const q = query.trim().toLowerCase();
    return library
      .filter((i) => (tab === 'favorites' ? i.is_favorite : true))
      .filter((i) => (q ? i.name.toLowerCase().includes(q) : true));
  }, [library, tab, query]);

  const filteredMeals = useMemo(() => {
    if (!meals) return null;
    const q = query.trim().toLowerCase();
    return q ? meals.filter((m) => m.name.toLowerCase().includes(q)) : meals;
  }, [meals, query]);

  function pickLibraryItem(item: FoodLibraryItem) {
    const grams = 100;
    const scale = grams / 100;
    onPickIngredients([
      {
        name: item.name,
        fdc_id: item.fdc_id,
        weight_g: grams,
        calories: Number(item.calories) * scale,
        protein_g: Number(item.protein_g) * scale,
        carbs_g: Number(item.carbs_g) * scale,
        fat_g: Number(item.fat_g) * scale,
        micronutrients: scaleMicros(item.micronutrients, scale),
      },
    ]);
    onClose();
  }

  function repeatMeal(meal: MealWithIngredients) {
    onPickIngredients(
      (meal.meal_ingredients ?? []).map((i) => ({
        name: i.name,
        fdc_id: i.fdc_id,
        weight_g: Number(i.weight_g),
        calories: Number(i.calories),
        protein_g: Number(i.protein_g),
        carbs_g: Number(i.carbs_g),
        fat_g: Number(i.fat_g),
        micronutrients: i.micronutrients,
      }))
    );
    onPickMealName(meal.name);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <Row style={styles.header}>
          <Text style={styles.headerTitle}>Add food</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </Row>

        <View style={styles.tabs}>
          <Chip label="★ Favorites" selected={tab === 'favorites'} onPress={() => setTab('favorites')} />
          <Chip label="All foods" selected={tab === 'all'} onPress={() => setTab('all')} />
          <Chip label="Past meals" selected={tab === 'meals'} onPress={() => setTab('meals')} />
        </View>

        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search…"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />

        {error && <ErrorNote message={error} />}

        {tab === 'meals' ? (
          filteredMeals == null ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
          ) : filteredMeals.length === 0 ? (
            <EmptyState text="No past meals yet." />
          ) : (
            <FlatList
              data={filteredMeals}
              keyExtractor={(m) => m.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => {
                const cal = (item.meal_ingredients ?? []).reduce(
                  (n, i) => n + (Number(i.calories) || 0),
                  0
                );
                return (
                  <Pressable style={styles.item} onPress={() => repeatMeal(item)}>
                    <View style={{ flex: 1 }}>
                      <Row style={{ justifyContent: 'flex-start', gap: 6 }}>
                        {item.is_favorite && (
                          <Ionicons name="star" size={13} color={colors.accent} />
                        )}
                        <Text style={styles.itemName}>{item.name}</Text>
                      </Row>
                      <Muted style={{ fontSize: 12 }}>
                        {prettyDate(dayKey(item.eaten_at))} · {(item.meal_ingredients ?? []).length}{' '}
                        ingredients · {Math.round(cal)} kcal
                      </Muted>
                    </View>
                    <Text style={styles.repeat}>Repeat</Text>
                  </Pressable>
                );
              }}
            />
          )
        ) : filteredLibrary == null ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.lg }} />
        ) : filteredLibrary.length === 0 ? (
          <EmptyState
            text={
              tab === 'favorites'
                ? 'No favorites yet — star a food from All foods.'
                : 'Nothing here yet. Foods are saved automatically when you log a meal.'
            }
          />
        ) : (
          <FlatList
            data={filteredLibrary}
            keyExtractor={(i) => i.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <Pressable style={{ flex: 1 }} onPress={() => pickLibraryItem(item)}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Muted style={{ fontSize: 12 }}>
                    per 100g · {Math.round(Number(item.calories))} kcal ·{' '}
                    {Math.round(Number(item.protein_g))}p / {Math.round(Number(item.carbs_g))}c /{' '}
                    {Math.round(Number(item.fat_g))}f
                  </Muted>
                </Pressable>
                <Pressable
                  hitSlop={10}
                  onPress={async () => {
                    await toggleFoodFavorite(item.id, !item.is_favorite);
                    setLibrary(await getFoodLibrary());
                  }}
                >
                  <Ionicons
                    name={item.is_favorite ? 'star' : 'star-outline'}
                    size={20}
                    color={item.is_favorite ? colors.accent : colors.textMuted}
                  />
                </Pressable>
                {tab === 'all' && (
                  <Pressable
                    hitSlop={10}
                    style={{ marginLeft: spacing.sm }}
                    onPress={async () => {
                      await deleteFoodLibraryItem(item.id);
                      setLibrary(await getFoodLibrary());
                    }}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            )}
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}

function scaleMicros(micros: Micronutrients, scale: number): Micronutrients {
  const out: Record<string, { amount: number; unit: string }> = {};
  for (const [k, v] of Object.entries(micros ?? {})) {
    out[k] = { amount: Number(v?.amount ?? 0) * scale, unit: v?.unit ?? '' };
  }
  return out;
}

const styles = StyleSheet.create({
  modal: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md },
  search: {
    margin: spacing.md,
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    color: colors.text,
    fontSize: 16,
    padding: 12,
  },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  repeat: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});
