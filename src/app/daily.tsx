import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DateNav } from '@/components/DateNav';
import { Button, Card, EmptyState, ErrorNote, Input, Loading, Muted, Row, SectionLabel } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { timeLabel, todayStr } from '@/lib/day';
import {
  addWater,
  archiveHabit,
  archiveSupplement,
  createHabit,
  createSupplement,
  deleteWaterLog,
  getGoals,
  getHabitsWithTodayLogs,
  getSupplementsWithTodayLogs,
  getWaterForDay,
  setHabitDone,
  setSupplementTaken,
  sumWater,
} from '@/lib/queries';
import { useAsync } from '@/lib/useAsync';

export default function DailyScreen() {
  const [date, setDate] = useState(todayStr());
  const [newHabit, setNewHabit] = useState('');
  const [newSupp, setNewSupp] = useState('');
  const [newSuppDose, setNewSuppDose] = useState('');

  const { data, error, refreshing, onRefresh, reload } = useAsync(async () => {
    const [water, habits, supplements, goals] = await Promise.all([
      getWaterForDay(date),
      getHabitsWithTodayLogs(date),
      getSupplementsWithTodayLogs(date),
      getGoals(),
    ]);
    return { water, habits, supplements, goals };
  }, [date]);

  const waterOz = data ? sumWater(data.water) : 0;
  const waterTarget = data?.goals?.water_target_oz ?? null;

  function confirmArchive(kind: 'habit' | 'supplement', id: string, name: string) {
    Alert.alert(`Remove ${kind}`, `Stop tracking "${name}"? Past logs are kept.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (kind === 'habit') await archiveHabit(id);
          else await archiveSupplement(id);
          reload();
        },
      },
    ]);
  }

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

      {data && (
        <>
          <Card>
            <Row>
              <SectionLabel>Hydration</SectionLabel>
              <Text style={styles.total}>
                {Math.round(waterOz)}
                {waterTarget ? ` / ${Math.round(waterTarget)}` : ''} oz
              </Text>
            </Row>
            <Row style={{ gap: spacing.sm }}>
              {[8, 12, 16, 24, 32].map((oz) => (
                <Pressable
                  key={oz}
                  style={styles.waterBtn}
                  onPress={async () => {
                    await addWater(oz, date);
                    reload();
                  }}
                >
                  <Text style={styles.waterBtnText}>+{oz}</Text>
                </Pressable>
              ))}
            </Row>
            {data.water.map((w) => (
              <Row key={w.id} style={styles.logRow}>
                <Muted style={{ fontSize: 13 }}>
                  {Math.round(Number(w.amount_oz))} oz · {timeLabel(w.logged_at)}
                </Muted>
                <Pressable
                  hitSlop={10}
                  onPress={async () => {
                    await deleteWaterLog(w.id);
                    reload();
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              </Row>
            ))}
          </Card>

          <Card>
            <SectionLabel>Habits</SectionLabel>
            {data.habits.length === 0 && <EmptyState text="No habits tracked yet." />}
            {data.habits.map((h) => (
              <Row key={h.id} style={styles.checkRow}>
                <Pressable
                  style={styles.check}
                  onPress={async () => {
                    await setHabitDone(h.id, !h.done, date, h.logId);
                    reload();
                  }}
                >
                  <Ionicons
                    name={h.done ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={h.done ? colors.accent : colors.textMuted}
                  />
                  <Text style={[styles.checkLabel, h.done && styles.checkLabelDone]}>{h.name}</Text>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => confirmArchive('habit', h.id, h.name)}>
                  <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                </Pressable>
              </Row>
            ))}
            <Row style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              <Input value={newHabit} onChangeText={setNewHabit} placeholder="New habit" />
              <Button
                title="Add"
                variant="secondary"
                onPress={async () => {
                  if (!newHabit.trim()) return;
                  await createHabit(newHabit.trim());
                  setNewHabit('');
                  reload();
                }}
              />
            </Row>
          </Card>

          <Card>
            <SectionLabel>Supplements & meds</SectionLabel>
            {data.supplements.length === 0 && <EmptyState text="Nothing tracked yet." />}
            {data.supplements.map((s) => (
              <Row key={s.id} style={styles.checkRow}>
                <Pressable
                  style={styles.check}
                  onPress={async () => {
                    await setSupplementTaken(s.id, !s.taken, date, s.logId);
                    reload();
                  }}
                >
                  <Ionicons
                    name={s.taken ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={s.taken ? colors.accent : colors.textMuted}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.checkLabel, s.taken && styles.checkLabelDone]}>
                      {s.name}
                    </Text>
                    {s.dose ? <Muted style={{ fontSize: 12 }}>{s.dose}</Muted> : null}
                  </View>
                </Pressable>
                <Pressable hitSlop={10} onPress={() => confirmArchive('supplement', s.id, s.name)}>
                  <Ionicons name="trash-outline" size={17} color={colors.textMuted} />
                </Pressable>
              </Row>
            ))}
            <Row style={{ gap: spacing.sm, marginTop: spacing.xs }}>
              <Input value={newSupp} onChangeText={setNewSupp} placeholder="Name" />
              <Input value={newSuppDose} onChangeText={setNewSuppDose} placeholder="Dose" />
            </Row>
            <Button
              title="Add supplement"
              variant="secondary"
              onPress={async () => {
                if (!newSupp.trim()) return;
                await createSupplement(newSupp.trim(), newSuppDose.trim() || null, 'supplement');
                setNewSupp('');
                setNewSuppDose('');
                reload();
              }}
            />
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  total: { color: colors.text, fontSize: 16, fontWeight: '700' },
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
  logRow: {
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  checkRow: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  checkLabel: { color: colors.text, fontSize: 16 },
  checkLabelDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
});
