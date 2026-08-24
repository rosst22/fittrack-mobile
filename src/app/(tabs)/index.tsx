import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateNav } from '@/components/DateNav';
import {
  Card,
  EmptyState,
  ErrorNote,
  GoalRow,
  Loading,
  Muted,
  Row,
  SectionLabel,
  StatTile,
} from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { timeLabel, todayStr } from '@/lib/day';
import { formatMicro, TRACKED_MICROS } from '@/lib/micros';
import { estimateMaintenance } from '@/lib/profile';
import {
  addWater,
  getGoals,
  getMealsForDay,
  getProfile,
  getWaterForDay,
  getWorkoutsForDay,
  sumCaloriesBurned,
  sumMacros,
  sumWater,
} from '@/lib/queries';
import { formatVolume, volume } from '@/lib/strength';
import { useAsync } from '@/lib/useAsync';

export default function TodayScreen() {
  const [date, setDate] = useState(todayStr());

  const { data, error, refreshing, onRefresh, reload } = useAsync(
    async () => {
      // Independent queries, so fire them together rather than in sequence —
      // same reasoning as the web dashboard's single Promise.all batch.
      const [meals, workouts, water, goals, profile] = await Promise.all([
        getMealsForDay(date),
        getWorkoutsForDay(date),
        getWaterForDay(date),
        getGoals(),
        getProfile(),
      ]);
      return { meals, workouts, water, goals, profile };
    },
    [date]
  );

  async function quickAddWater(oz: number) {
    await addWater(oz, date);
    reload();
  }

  const macros = data ? sumMacros(data.meals) : null;
  const burned = data ? sumCaloriesBurned(data.workouts) : 0;
  const waterOz = data ? sumWater(data.water) : 0;
  const maintenance = data?.profile ? estimateMaintenance(data.profile) : null;
  const net = macros ? macros.calories - burned : 0;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <DateNav date={date} onChange={setDate} />

      {error && <ErrorNote message={error} />}
      {!data && !error && <Loading />}

      {data && macros && (
        <>
          <Card>
            <SectionLabel>Net calories</SectionLabel>
            <Text style={styles.bigNumber}>{Math.round(net).toLocaleString()}</Text>
            <Muted>
              {Math.round(macros.calories).toLocaleString()} eaten −{' '}
              {Math.round(burned).toLocaleString()} burned
            </Muted>
            {maintenance != null && (
              <Muted style={{ marginTop: 2 }}>
                {net < maintenance
                  ? `${Math.round(maintenance - net).toLocaleString()} under maintenance`
                  : `${Math.round(net - maintenance).toLocaleString()} over maintenance`}{' '}
                ({Math.round(maintenance).toLocaleString()} est.)
              </Muted>
            )}
          </Card>

          <Card>
            <SectionLabel>Macros</SectionLabel>
            <Row style={{ marginTop: spacing.xs }}>
              <StatTile value={`${Math.round(macros.protein_g)}g`} label="Protein" accent />
              <StatTile value={`${Math.round(macros.carbs_g)}g`} label="Carbs" />
              <StatTile value={`${Math.round(macros.fat_g)}g`} label="Fat" />
            </Row>
          </Card>

          <Card>
            <SectionLabel>Goals</SectionLabel>
            <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
              <GoalRow
                label="Calories"
                value={macros.calories}
                target={data.goals?.calorie_target}
                unit="kcal"
                overIsBad
              />
              <GoalRow
                label="Protein"
                value={macros.protein_g}
                target={data.goals?.protein_target_g}
                unit="g"
              />
              <GoalRow
                label="Water"
                value={waterOz}
                target={data.goals?.water_target_oz}
                unit="oz"
              />
            </View>
            {!data.goals && (
              <Pressable onPress={() => router.push('/goals')}>
                <Muted>No targets set yet — tap to add goals.</Muted>
              </Pressable>
            )}
          </Card>

          <Card>
            <Row>
              <SectionLabel>Water</SectionLabel>
              <Text style={styles.waterTotal}>{Math.round(waterOz)} oz</Text>
            </Row>
            <Row style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              {[8, 12, 16, 24].map((oz) => (
                <Pressable key={oz} style={styles.waterBtn} onPress={() => quickAddWater(oz)}>
                  <Text style={styles.waterBtnText}>+{oz}</Text>
                </Pressable>
              ))}
            </Row>
          </Card>

          <Card>
            <Row>
              <SectionLabel>Meals</SectionLabel>
              <Pressable onPress={() => router.push('/meal/new')} hitSlop={10}>
                <Ionicons name="add-circle" size={24} color={colors.accent} />
              </Pressable>
            </Row>
            {data.meals.length === 0 ? (
              <EmptyState text="Nothing logged yet." />
            ) : (
              data.meals.map((m) => {
                const cal = (m.meal_ingredients ?? []).reduce(
                  (n, i) => n + (Number(i.calories) || 0),
                  0
                );
                return (
                  <Pressable
                    key={m.id}
                    style={styles.listRow}
                    onPress={() => router.push(`/meal/${m.id}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{m.name}</Text>
                      <Muted style={{ fontSize: 13 }}>{timeLabel(m.eaten_at)}</Muted>
                    </View>
                    <Text style={styles.rowValue}>{Math.round(cal)} kcal</Text>
                  </Pressable>
                );
              })
            )}
          </Card>

          <Card>
            <Row>
              <SectionLabel>Training</SectionLabel>
              <Pressable onPress={() => router.push('/workout/new')} hitSlop={10}>
                <Ionicons name="add-circle" size={24} color={colors.accent} />
              </Pressable>
            </Row>
            {data.workouts.length === 0 ? (
              <EmptyState text="No workout logged." />
            ) : (
              data.workouts.map((w) => {
                const vol = (w.workout_exercises ?? []).reduce(
                  (n, ex) => n + volume(ex.exercise_sets ?? []),
                  0
                );
                const cal = (w.workout_exercises ?? []).reduce(
                  (n, ex) => n + (Number(ex.calories) || 0),
                  0
                );
                return (
                  <Pressable
                    key={w.id}
                    style={styles.listRow}
                    onPress={() => router.push(`/workout/${w.id}`)}
                  >
                    <View style={{ flex: 1 }}>
                      <Row style={{ justifyContent: 'flex-start', gap: spacing.sm }}>
                        <Text style={styles.rowTitle}>{w.name}</Text>
                        {w.source === 'whoop' && <Text style={styles.badge}>WHOOP</Text>}
                      </Row>
                      <Muted style={{ fontSize: 13 }}>
                        {vol > 0 ? `${formatVolume(vol)} volume` : timeLabel(w.performed_at)}
                      </Muted>
                    </View>
                    <Text style={styles.rowValue}>{Math.round(cal)} kcal</Text>
                  </Pressable>
                );
              })
            )}
          </Card>

          <Card>
            <SectionLabel>Micronutrients</SectionLabel>
            <Row style={{ marginTop: spacing.xs }}>
              {TRACKED_MICROS.map((m) => (
                <StatTile
                  key={m.label}
                  value={formatMicro(m.label, macros.micros[m.label] ?? 0)}
                  label={m.label}
                />
              ))}
            </Row>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  bigNumber: { color: colors.accent, fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  waterTotal: { color: colors.text, fontSize: 16, fontWeight: '700' },
  waterBtn: {
    flex: 1,
    backgroundColor: colors.bg,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  waterBtnText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  rowValue: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  badge: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: 'hidden',
  },
});
