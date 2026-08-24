import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateNav } from '@/components/DateNav';
import { Card, EmptyState, ErrorNote, Loading, Muted, Row, SectionLabel, StatTile } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { timeLabel, todayStr } from '@/lib/day';
import { deleteMeal, getMealsForDay, sumMacros, toggleMealFavorite } from '@/lib/queries';
import { useAsync } from '@/lib/useAsync';

export default function MealsScreen() {
  const [date, setDate] = useState(todayStr());
  const { data, error, refreshing, onRefresh, reload } = useAsync(
    () => getMealsForDay(date),
    [date]
  );

  function confirmDelete(id: string, name: string) {
    Alert.alert('Delete meal', `Delete "${name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteMeal(id);
          reload();
        },
      },
    ]);
  }

  const totals = data ? sumMacros(data) : null;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        <DateNav date={date} onChange={setDate} />
        {error && <ErrorNote message={error} />}
        {!data && !error && <Loading />}

        {totals && (
          <Card>
            <SectionLabel>Day total</SectionLabel>
            <Row>
              <StatTile value={Math.round(totals.calories).toLocaleString()} label="kcal" accent />
              <StatTile value={`${Math.round(totals.protein_g)}g`} label="Protein" />
              <StatTile value={`${Math.round(totals.carbs_g)}g`} label="Carbs" />
              <StatTile value={`${Math.round(totals.fat_g)}g`} label="Fat" />
            </Row>
          </Card>
        )}

        {data?.length === 0 && <EmptyState text="No meals logged for this day." />}

        {data?.map((m) => {
          const cal = (m.meal_ingredients ?? []).reduce((n, i) => n + (Number(i.calories) || 0), 0);
          const p = (m.meal_ingredients ?? []).reduce((n, i) => n + (Number(i.protein_g) || 0), 0);
          return (
            <Card key={m.id}>
              <Row>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/meal/${m.id}`)}>
                  <Text style={styles.mealName}>{m.name}</Text>
                  <Muted style={{ fontSize: 13 }}>{timeLabel(m.eaten_at)}</Muted>
                </Pressable>
                <Pressable
                  hitSlop={10}
                  onPress={async () => {
                    await toggleMealFavorite(m.id, !m.is_favorite);
                    reload();
                  }}
                >
                  <Ionicons
                    name={m.is_favorite ? 'star' : 'star-outline'}
                    size={22}
                    color={m.is_favorite ? colors.accent : colors.textMuted}
                  />
                </Pressable>
              </Row>

              <Row style={{ justifyContent: 'flex-start', gap: spacing.md }}>
                <Text style={styles.macro}>{Math.round(cal)} kcal</Text>
                <Text style={styles.macro}>{Math.round(p)}g protein</Text>
              </Row>

              {(m.meal_ingredients ?? []).map((i) => (
                <Row key={i.id}>
                  <Muted style={{ fontSize: 13, flex: 1 }}>{i.name}</Muted>
                  <Muted style={{ fontSize: 13 }}>{Math.round(Number(i.weight_g))}g</Muted>
                </Row>
              ))}

              <Row style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                <Pressable style={styles.smallBtn} onPress={() => router.push(`/meal/${m.id}`)}>
                  <Text style={styles.smallBtnText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.smallBtn} onPress={() => confirmDelete(m.id, m.name)}>
                  <Text style={[styles.smallBtnText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </Row>
            </Card>
          );
        })}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/meal/new')}>
        <Ionicons name="add" size={30} color="#000" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: 96 },
  mealName: { color: colors.text, fontSize: 17, fontWeight: '700' },
  macro: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  smallBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  smallBtnText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
