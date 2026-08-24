import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, ErrorNote, Loading, Muted, Row, SectionLabel } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { prettyDate, dayKey } from '@/lib/day';
import { deleteWorkout, getRecentWorkouts } from '@/lib/queries';
import { formatSets, formatVolume, orderSets, volume } from '@/lib/strength';
import { useAsync } from '@/lib/useAsync';

export default function WorkoutsScreen() {
  const { data, error, refreshing, onRefresh, reload } = useAsync(() => getRecentWorkouts(), []);

  function confirmDelete(id: string, name: string) {
    Alert.alert('Delete workout', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteWorkout(id);
          reload();
        },
      },
    ]);
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {error && <ErrorNote message={error} />}
        {!data && !error && <Loading />}
        {data?.length === 0 && <EmptyState text="No workouts logged yet." />}

        {data?.map((w) => {
          const totalVol = (w.workout_exercises ?? []).reduce(
            (n, ex) => n + volume(ex.exercise_sets ?? []),
            0
          );
          const cal = (w.workout_exercises ?? []).reduce(
            (n, ex) => n + (Number(ex.calories) || 0),
            0
          );
          return (
            <Card key={w.id}>
              <Row>
                <Pressable style={{ flex: 1 }} onPress={() => router.push(`/workout/${w.id}`)}>
                  <Row style={{ justifyContent: 'flex-start', gap: spacing.sm }}>
                    <Text style={styles.name}>{w.name}</Text>
                    {w.source === 'whoop' && <Text style={styles.badge}>WHOOP</Text>}
                  </Row>
                  <Muted style={{ fontSize: 13 }}>{prettyDate(dayKey(w.performed_at))}</Muted>
                </Pressable>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.cal}>{Math.round(cal)} kcal</Text>
                  {totalVol > 0 && <Muted style={{ fontSize: 12 }}>{formatVolume(totalVol)}</Muted>}
                </View>
              </Row>

              {(w.workout_exercises ?? []).map((ex) => {
                const sets = orderSets(ex.exercise_sets ?? []);
                return (
                  <View key={ex.id} style={styles.exercise}>
                    <Row>
                      <Pressable
                        style={{ flex: 1 }}
                        onPress={() =>
                          router.push({
                            pathname: '/exercise/[name]',
                            params: { name: ex.name },
                          })
                        }
                      >
                        <Text style={styles.exName}>{ex.name}</Text>
                      </Pressable>
                      {ex.duration_min > 0 && (
                        <Muted style={{ fontSize: 12 }}>{ex.duration_min} min</Muted>
                      )}
                    </Row>
                    {sets.length > 0 && <Muted style={{ fontSize: 13 }}>{formatSets(sets)}</Muted>}
                  </View>
                );
              })}

              <Row style={{ gap: spacing.sm, marginTop: spacing.xs }}>
                <Pressable style={styles.smallBtn} onPress={() => router.push(`/workout/${w.id}`)}>
                  <Text style={styles.smallBtnText}>Edit</Text>
                </Pressable>
                <Pressable style={styles.smallBtn} onPress={() => confirmDelete(w.id, w.name)}>
                  <Text style={[styles.smallBtnText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </Row>
            </Card>
          );
        })}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/workout/new')}>
        <Ionicons name="add" size={30} color="#000" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: 96 },
  name: { color: colors.text, fontSize: 17, fontWeight: '700' },
  cal: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  exercise: {
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: 2,
  },
  exName: { color: colors.text, fontSize: 15, fontWeight: '600' },
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
