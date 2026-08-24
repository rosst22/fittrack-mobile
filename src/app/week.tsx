import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BarChart } from '@/components/Charts';
import { Card, ErrorNote, Loading, Muted, Row, SectionLabel, StatTile } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { dayKey, prettyDate, shiftDate, todayStr, weekDates, weekStart } from '@/lib/day';
import {
  getGoals,
  getMealsBetween,
  getWaterForDay,
  getWorkoutsBetween,
  sumCaloriesBurned,
  sumMacros,
  sumWater,
} from '@/lib/queries';
import { formatVolume, volume } from '@/lib/strength';
import { useAsync } from '@/lib/useAsync';
import { averageOf, buildGoalRows, hitRate, type DayTotals } from '@/lib/weekReview';

export default function WeekScreen() {
  const [anchor, setAnchor] = useState(todayStr());
  const start = weekStart(anchor);
  const dates = weekDates(anchor);

  const { data, error, refreshing, onRefresh } = useAsync(async () => {
    const from = dates[0];
    const to = dates[dates.length - 1];
    const [meals, workouts, goals, ...waterDays] = await Promise.all([
      getMealsBetween(from, to),
      getWorkoutsBetween(from, to),
      getGoals(),
      ...dates.map((d) => getWaterForDay(d)),
    ]);
    return { meals, workouts, goals, waterDays };
  }, [start]);

  let body = null;
  if (data) {
    const { meals, workouts, goals, waterDays } = data;

    const days: DayTotals[] = dates.map((date, i) => {
      const dayMeals = meals.filter((m) => dayKey(m.eaten_at) === date);
      const dayWorkouts = workouts.filter((w) => dayKey(w.performed_at) === date);
      const t = sumMacros(dayMeals);
      const waterOz = sumWater(waterDays[i] ?? []);
      return {
        date,
        calories: t.calories,
        protein_g: t.protein_g,
        carbs_g: t.carbs_g,
        fat_g: t.fat_g,
        burned: sumCaloriesBurned(dayWorkouts),
        waterOz,
        workouts: dayWorkouts.length,
        // No WHOOP on mobile yet — sleep lives in a server-side blob the app
        // cannot reach without the service key.
        sleepMs: null,
        sleepPerformance: null,
        logged: dayMeals.length > 0 || dayWorkouts.length > 0 || waterOz > 0,
      };
    });

    const rows = buildGoalRows(days, goals);
    const rate = hitRate(rows.flatMap((r) => r.statuses));
    const avgCal = averageOf(days.map((d) => (d.logged ? d.calories : null)));
    const avgProtein = averageOf(days.map((d) => (d.logged ? d.protein_g : null)));
    const totalVolume = workouts.reduce(
      (n, w) => n + (w.workout_exercises ?? []).reduce((m, ex) => m + volume(ex.exercise_sets ?? []), 0),
      0
    );
    const workoutCount = workouts.length;
    const shortDay = (d: string) => ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][dates.indexOf(d)];

    body = (
      <>
        <Card>
          <SectionLabel>Week of {prettyDate(start)}</SectionLabel>
          <Row>
            <StatTile
              value={avgCal == null ? '—' : Math.round(avgCal).toLocaleString()}
              label="Avg kcal"
              accent
            />
            <StatTile value={avgProtein == null ? '—' : `${Math.round(avgProtein)}g`} label="Avg protein" />
            <StatTile
              value={`${workoutCount}${goals?.workouts_per_week ? `/${goals.workouts_per_week}` : ''}`}
              label="Workouts"
            />
            <StatTile value={formatVolume(totalVolume)} label="Volume" />
          </Row>
        </Card>

        <Card>
          <Row>
            <SectionLabel>Goals hit</SectionLabel>
            <Text style={styles.rate}>{rate == null ? '—' : `${Math.round(rate * 100)}%`}</Text>
          </Row>

          <Row style={styles.gridHead}>
            <Text style={styles.gridLabelCol} />
            {dates.map((d) => (
              <Text key={d} style={styles.gridHeadCell}>
                {shortDay(d)}
              </Text>
            ))}
          </Row>

          {rows.map((r) => (
            <View key={r.key}>
              <Row style={styles.gridRow}>
                <Text style={styles.gridLabelCol}>{r.label}</Text>
                {r.statuses.map((s, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.gridCell,
                      s === 'hit' && { color: colors.accent },
                      s === 'miss' && { color: colors.danger },
                      s === 'none' && { color: colors.border },
                    ]}
                  >
                    {s === 'hit' ? '✓' : s === 'miss' ? '✕' : '·'}
                  </Text>
                ))}
              </Row>
              <Muted style={styles.targetLabel}>{r.targetLabel}</Muted>
            </View>
          ))}
        </Card>

        <Card>
          <BarChart
            title="Calories"
            points={dates.map((d, i) => ({
              label: shortDay(d),
              value: days[i].logged ? days[i].calories : null,
            }))}
            unit="kcal"
            target={goals?.calorie_target ?? null}
          />
        </Card>

        <Card>
          <BarChart
            title="Protein"
            points={dates.map((d, i) => ({
              label: shortDay(d),
              value: days[i].logged ? days[i].protein_g : null,
            }))}
            unit="g"
            target={goals?.protein_target_g ?? null}
          />
        </Card>

        <Card>
          <SectionLabel>Day by day</SectionLabel>
          {days.map((d) => (
            <Row key={d.date} style={styles.dayRow}>
              <Text style={styles.dayName}>{prettyDate(d.date)}</Text>
              <Muted style={{ fontSize: 13 }}>
                {d.logged
                  ? `${Math.round(d.calories).toLocaleString()} kcal · ${Math.round(d.protein_g)}g P · ${d.workouts} workout${d.workouts === 1 ? '' : 's'}`
                  : 'nothing logged'}
              </Muted>
            </Row>
          ))}
        </Card>
      </>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
    >
      <Row style={styles.nav}>
        <Pressable hitSlop={12} onPress={() => setAnchor(shiftDate(start, -7))}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.navLabel}>{prettyDate(start)}</Text>
        <Pressable
          hitSlop={12}
          disabled={weekStart(todayStr()) === start}
          onPress={() => setAnchor(shiftDate(start, 7))}
          style={weekStart(todayStr()) === start ? { opacity: 0.3 } : undefined}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.text} />
        </Pressable>
      </Row>

      {error && <ErrorNote message={error} />}
      {!data && !error && <Loading />}
      {body}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  nav: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    padding: spacing.sm,
  },
  navLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rate: { color: colors.accent, fontSize: 20, fontWeight: '800' },
  gridHead: { marginTop: spacing.xs },
  gridRow: { marginTop: spacing.sm },
  gridLabelCol: { color: colors.text, fontSize: 14, fontWeight: '600', width: 74 },
  gridHeadCell: { color: colors.textMuted, fontSize: 12, flex: 1, textAlign: 'center' },
  gridCell: { fontSize: 17, flex: 1, textAlign: 'center', fontWeight: '700' },
  targetLabel: { fontSize: 11, marginLeft: 74 },
  dayRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  dayName: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
