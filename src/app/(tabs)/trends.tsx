import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { BarChart, DualLineChart, LineChart } from '@/components/Charts';
import { Card, ErrorNote, Loading, Muted, Row, SectionLabel, StatTile } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { dayKey } from '@/lib/day';
import {
  getGoals,
  getHabitCompletions,
  getMealsBetween,
  getSleepNights,
  getWorkoutsBetween,
  lastNDays,
  sumCaloriesBurned,
  sumMacros,
} from '@/lib/queries';
import { formatVolume, volume } from '@/lib/strength';
import { useAsync } from '@/lib/useAsync';

const DAYS = 14;

export default function TrendsScreen() {
  const { data, error, refreshing, onRefresh } = useAsync(async () => {
    const days = lastNDays(DAYS);
    const from = days[0];
    const to = days[days.length - 1];
    const [meals, workouts, goals, sleep, habits] = await Promise.all([
      getMealsBetween(from, to),
      getWorkoutsBetween(from, to),
      getGoals(),
      getSleepNights(),
      getHabitCompletions(from, to),
    ]);
    return { days, meals, workouts, goals, sleep, habits };
  }, []);

  let content = null;
  if (data) {
    const { days, meals, workouts, goals, sleep, habits } = data;

    // Bucket by APP_TZ calendar day, never by the raw timestamp — same rule as
    // the web app. A day with no meals stays null so the chart shows a gap
    // rather than a dip to zero.
    const byDay = new Map(
      days.map((d) => [
        d,
        {
          eaten: null as number | null,
          protein: null as number | null,
          carbs: null as number | null,
          fat: null as number | null,
          burned: 0,
          volume: 0,
        },
      ])
    );

    for (const m of meals) {
      const k = dayKey(m.eaten_at);
      const slot = byDay.get(k);
      if (!slot) continue;
      const t = sumMacros([m]);
      slot.eaten = (slot.eaten ?? 0) + t.calories;
      slot.protein = (slot.protein ?? 0) + t.protein_g;
      slot.carbs = (slot.carbs ?? 0) + t.carbs_g;
      slot.fat = (slot.fat ?? 0) + t.fat_g;
    }
    for (const w of workouts) {
      const slot = byDay.get(dayKey(w.performed_at));
      if (!slot) continue;
      slot.burned += sumCaloriesBurned([w]);
      slot.volume =
        (slot.volume ?? 0) +
        (w.workout_exercises ?? []).reduce((n, ex) => n + volume(ex.exercise_sets ?? []), 0);
    }

    // Sleep and habits arrive keyed by day already.
    const sleepByDay = new Map(sleep.map((n) => [n.date, n.hours]));
    const shortDayLabel = (d: string) => d.slice(5).replace('-', '/');
    const sleepPoints = days.map((d) => ({
      label: shortDayLabel(d),
      value: sleepByDay.get(d) ?? null,
    }));
    const habitPoints = days.map((d) => ({
      label: shortDayLabel(d),
      value: habits.byDay[d] ?? null,
    }));
    const nightsWithSleep = sleepPoints.filter((p) => p.value != null).length;
    const avgSleep =
      nightsWithSleep > 0
        ? sleepPoints.reduce((n, p) => n + (p.value ?? 0), 0) / nightsWithSleep
        : null;
    const totalVolume = days.reduce((n, d) => n + (byDay.get(d)!.volume ?? 0), 0);

    const shortLabel = (d: string) => d.slice(5).replace('-', '/');
    const series = (pick: (s: NonNullable<ReturnType<typeof byDay.get>>) => number | null) =>
      days.map((d) => ({ label: shortLabel(d), value: pick(byDay.get(d)!) }));

    const loggedDays = days.filter((d) => byDay.get(d)!.eaten != null);
    const avgCal =
      loggedDays.length > 0
        ? loggedDays.reduce((n, d) => n + (byDay.get(d)!.eaten ?? 0), 0) / loggedDays.length
        : 0;
    const avgProtein =
      loggedDays.length > 0
        ? loggedDays.reduce((n, d) => n + (byDay.get(d)!.protein ?? 0), 0) / loggedDays.length
        : 0;

    content = (
      <>
        <Card>
          <SectionLabel>Last {DAYS} days</SectionLabel>
          <Row>
            <StatTile value={Math.round(avgCal).toLocaleString()} label="Avg kcal/day" accent />
            <StatTile value={`${Math.round(avgProtein)}g`} label="Avg protein" />
            <StatTile value={`${loggedDays.length}/${DAYS}`} label="Days logged" />
          </Row>
          <Row>
            <StatTile
              value={avgSleep == null ? '—' : `${avgSleep.toFixed(1)}h`}
              label="Avg sleep"
              sub={nightsWithSleep > 0 ? `${nightsWithSleep} nights` : 'no WHOOP data'}
            />
            <StatTile value={formatVolume(totalVolume)} label="Volume lifted" />
            <StatTile
              value={habits.activeHabits > 0 ? String(habits.activeHabits) : '—'}
              label="Habits tracked"
            />
          </Row>
        </Card>

        <Card>
          <DualLineChart
            title="Calories eaten vs. burned"
            a={series((s) => s.eaten)}
            b={series((s) => s.burned)}
            aLabel="Eaten"
            bLabel="Burned"
            unit="kcal"
          />
        </Card>

        <Card>
          <BarChart
            title="Protein"
            points={series((s) => s.protein)}
            unit="g"
            target={goals?.protein_target_g ?? null}
          />
          {goals?.protein_target_g ? (
            <Muted style={{ fontSize: 12 }}>Dashed line = your {Math.round(goals.protein_target_g)}g target</Muted>
          ) : null}
        </Card>

        <Card>
          <LineChart title="Carbs" points={series((s) => s.carbs)} unit="g" />
        </Card>

        <Card>
          <LineChart title="Fat" points={series((s) => s.fat)} unit="g" />
        </Card>

        <Card>
          <BarChart title="Calories burned" points={series((s) => s.burned)} unit="kcal" />
        </Card>

        <Card>
          <BarChart title="Training volume" points={series((s) => s.volume || null)} unit="lb" />
          <Muted style={{ fontSize: 12 }}>
            Total weight moved per session — sum of weight x reps across every set.
          </Muted>
        </Card>

        <Card>
          <LineChart title="Sleep" points={sleepPoints} unit="h" target={8} />
          <Muted style={{ fontSize: 12 }}>
            {nightsWithSleep > 0
              ? 'Dashed line is 8 hours. Gaps are nights WHOOP has not synced.'
              : 'No sleep data yet — connect WHOOP on the web app and press Sync now.'}
          </Muted>
        </Card>

        <Card>
          <BarChart
            title="Habits completed"
            points={habitPoints}
            target={habits.activeHabits || null}
          />
          <Muted style={{ fontSize: 12 }}>
            {habits.activeHabits > 0
              ? `Dashed line is all ${habits.activeHabits} of your daily habits.`
              : 'No habits tracked yet — add some on the Daily screen.'}
          </Muted>
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
      {error && <ErrorNote message={error} />}
      {!data && !error && <Loading />}
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});
