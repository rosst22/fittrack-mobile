import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { LineChart } from '@/components/Charts';
import { Card, EmptyState, ErrorNote, Loading, Muted, Row, SectionLabel, StatTile } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { dayKey, prettyDate } from '@/lib/day';
import { getRecentWorkouts } from '@/lib/queries';
import {
  best1RM,
  epley1RM,
  formatSets,
  formatVolume,
  normalizeExerciseName,
  orderSets,
  topSet,
  volume,
} from '@/lib/strength';
import { useAsync } from '@/lib/useAsync';

export default function ExerciseHistoryScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const target = normalizeExerciseName(name ?? '');

  const { data, error } = useAsync(async () => {
    // Pull recent workouts and filter client-side. The alternative — a
    // case-folded server-side filter — cannot reproduce normalizeExerciseName's
    // whitespace folding, and history for one lift is small either way.
    const workouts = await getRecentWorkouts(200);
    const sessions = workouts
      .flatMap((w) =>
        (w.workout_exercises ?? [])
          .filter((ex) => normalizeExerciseName(ex.name) === target)
          .map((ex) => ({
            date: dayKey(w.performed_at),
            performedAt: w.performed_at,
            displayName: ex.name,
            sets: orderSets(ex.exercise_sets ?? []),
          }))
      )
      .filter((s) => s.sets.length > 0)
      .sort((a, b) => a.performedAt.localeCompare(b.performedAt));
    return sessions;
  }, [target]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading />;

  const title = data[0]?.displayName ?? name ?? 'Exercise';

  if (data.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <EmptyState text="No sets logged for this exercise yet." />
      </>
    );
  }

  const allSets = data.flatMap((s) => s.sets);
  const heaviest = topSet(allSets);
  const best1 = best1RM(allSets);
  const bestVolume = Math.max(...data.map((s) => volume(s.sets)));
  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const lastVol = volume(last.sets);
  const prevVol = prev ? volume(prev.sets) : null;
  const delta = prevVol != null && prevVol > 0 ? ((lastVol - prevVol) / prevVol) * 100 : null;

  const short = (d: string) => d.slice(5).replace('-', '/');

  return (
    <>
      <Stack.Screen options={{ title }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <SectionLabel>All-time bests</SectionLabel>
          <Row>
            <StatTile
              value={heaviest?.weight_lb ? `${Math.round(Number(heaviest.weight_lb))}` : '—'}
              label="Heaviest set"
              sub={heaviest?.reps ? `× ${heaviest.reps} reps` : undefined}
              accent
            />
            <StatTile value={best1 ? `${Math.round(best1)}` : '—'} label="Best est. 1RM" sub="lb" />
            <StatTile value={formatVolume(bestVolume)} label="Best session" />
          </Row>
        </Card>

        <Card>
          <SectionLabel>Last session</SectionLabel>
          <Text style={styles.lastSets}>{formatSets(last.sets)}</Text>
          <Muted>
            {prettyDate(last.date)} · {formatVolume(lastVol)}
            {delta != null && (
              <Text style={{ color: delta >= 0 ? colors.accent : colors.danger }}>
                {'  '}
                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% vs. previous
              </Text>
            )}
          </Muted>
        </Card>

        <Card>
          <LineChart
            title="Top-set weight"
            unit="lb"
            points={data.map((s) => ({
              label: short(s.date),
              value: topSet(s.sets)?.weight_lb != null ? Number(topSet(s.sets)!.weight_lb) : null,
            }))}
          />
        </Card>

        <Card>
          <LineChart
            title="Estimated 1RM"
            unit="lb"
            points={data.map((s) => {
              const t = topSet(s.sets);
              const e = t ? epley1RM(t.weight_lb, t.reps) : 0;
              return { label: short(s.date), value: e > 0 ? e : null };
            })}
          />
        </Card>

        <Card>
          <LineChart
            title="Session volume"
            unit="lb"
            points={data.map((s) => ({ label: short(s.date), value: volume(s.sets) }))}
          />
        </Card>

        <Card>
          <SectionLabel>Every session</SectionLabel>
          {[...data].reverse().map((s, i) => (
            <View key={`${s.performedAt}-${i}`} style={styles.session}>
              <Row>
                <Text style={styles.sessionDate}>{prettyDate(s.date)}</Text>
                <Muted style={{ fontSize: 13 }}>{formatVolume(volume(s.sets))}</Muted>
              </Row>
              <Muted style={{ fontSize: 14 }}>{formatSets(s.sets)}</Muted>
            </View>
          ))}
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  lastSets: { color: colors.text, fontSize: 18, fontWeight: '700' },
  session: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 2,
  },
  sessionDate: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
