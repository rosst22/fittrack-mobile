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

import { Button, Card, Chip, ErrorNote, Input, Muted, Row, SectionLabel, StatTile } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { dateTimeLabel } from '@/lib/day';
import { caloriesBurned, categoryByKey, EXERCISE_CATEGORIES } from '@/lib/exercises';
import { createWorkout, updateWorkout, type NewExercise } from '@/lib/queries';
import { formatVolume, volume } from '@/lib/strength';

type SetDraft = { key: string; weight: string; reps: string };
type ExDraft = {
  key: string;
  name: string;
  category: string;
  duration: string;
  overrideCalories: string;
  sets: SetDraft[];
};

let seq = 0;
const k = () => `k-${seq++}`;

const emptySet = (): SetDraft => ({ key: k(), weight: '', reps: '' });
const emptyExercise = (): ExDraft => ({
  key: k(),
  name: '',
  category: 'weights_light',
  duration: '',
  overrideCalories: '',
  sets: [emptySet()],
});

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (s: string) => (s.trim() === '' ? null : num(s));

export function WorkoutForm({
  workoutId,
  initialName,
  initialPerformedAt,
  initialBodyweight,
  initialExercises,
}: {
  workoutId?: string;
  initialName?: string;
  initialPerformedAt?: string;
  initialBodyweight?: number | null;
  initialExercises?: {
    name: string;
    category: string;
    duration_min: number;
    calories: number;
    sets: { weight_lb: number | null; reps: number | null }[];
  }[];
}) {
  const [name, setName] = useState(initialName ?? '');
  const [performedAt, setPerformedAt] = useState(
    initialPerformedAt ? new Date(initialPerformedAt) : new Date()
  );
  const [showDate, setShowDate] = useState(false);
  const [bodyweight, setBodyweight] = useState(
    initialBodyweight != null ? String(initialBodyweight) : ''
  );
  const [exercises, setExercises] = useState<ExDraft[]>(
    initialExercises?.length
      ? initialExercises.map((e) => ({
          key: k(),
          name: e.name,
          category: e.category,
          duration: e.duration_min ? String(e.duration_min) : '',
          overrideCalories: '',
          sets: e.sets.length
            ? e.sets.map((s) => ({
                key: k(),
                weight: s.weight_lb != null ? String(s.weight_lb) : '',
                reps: s.reps != null ? String(s.reps) : '',
              }))
            : [emptySet()],
        }))
      : [emptyExercise()]
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const bw = num(bodyweight);

  function patchEx(key: string, field: keyof ExDraft, value: string) {
    setExercises((xs) => xs.map((x) => (x.key === key ? { ...x, [field]: value } : x)));
  }

  function patchSet(exKey: string, setKey: string, field: 'weight' | 'reps', value: string) {
    setExercises((xs) =>
      xs.map((x) =>
        x.key === exKey
          ? { ...x, sets: x.sets.map((s) => (s.key === setKey ? { ...s, [field]: value } : s)) }
          : x
      )
    );
  }

  /** "+ Add set" copies the previous set — you usually repeat the weight. */
  function addSet(exKey: string) {
    setExercises((xs) =>
      xs.map((x) => {
        if (x.key !== exKey) return x;
        const last = x.sets[x.sets.length - 1];
        return { ...x, sets: [...x.sets, { key: k(), weight: last?.weight ?? '', reps: last?.reps ?? '' }] };
      })
    );
  }

  function exCalories(x: ExDraft) {
    const override = numOrNull(x.overrideCalories);
    if (override != null) return override;
    const cat = categoryByKey(x.category);
    return caloriesBurned(cat?.met ?? 0, bw, num(x.duration));
  }

  const totalCalories = exercises.reduce((n, x) => n + exCalories(x), 0);
  const totalVolume = exercises.reduce(
    (n, x) =>
      n +
      volume(
        x.sets.map((s, i) => ({
          set_index: i + 1,
          weight_lb: numOrNull(s.weight),
          reps: numOrNull(s.reps),
        }))
      ),
    0
  );

  async function save() {
    if (!name.trim()) return setError('Give the workout a name.');
    const payloadExercises: NewExercise[] = exercises
      .filter((x) => x.name.trim().length > 0)
      .map((x) => {
        const cat = categoryByKey(x.category);
        return {
          name: x.name.trim(),
          category: x.category,
          met: cat?.met ?? 0,
          duration_min: num(x.duration),
          calories: exCalories(x),
          sets: x.sets
            .map((s) => ({ weight_lb: numOrNull(s.weight), reps: numOrNull(s.reps) }))
            .filter((s) => s.reps != null || s.weight_lb != null),
        };
      });

    if (payloadExercises.length === 0) return setError('Add at least one exercise.');

    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        performedAtIso: performedAt.toISOString(),
        bodyweightLb: numOrNull(bodyweight),
        exercises: payloadExercises,
      };
      if (workoutId) await updateWorkout(workoutId, payload);
      else await createWorkout(payload);
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
          <Input label="Workout name" value={name} onChangeText={setName} placeholder="e.g. Push day" />
          <Row style={{ gap: spacing.sm }}>
            <Input
              label="Bodyweight (lb)"
              value={bodyweight}
              onChangeText={setBodyweight}
              keyboardType="decimal-pad"
              placeholder="needed for calorie burn"
            />
          </Row>
          <View style={{ gap: spacing.xs }}>
            <Text style={styles.inputLabel}>Performed at</Text>
            <Pressable style={styles.dateBtn} onPress={() => setShowDate((v) => !v)}>
              <Text style={styles.dateText}>{dateTimeLabel(performedAt.toISOString())}</Text>
              <Ionicons name="calendar-outline" size={18} color={colors.textMuted} />
            </Pressable>
            {showDate && (
              <DateTimePicker
                value={performedAt}
                mode="datetime"
                display="spinner"
                themeVariant="dark"
                maximumDate={new Date()}
                onChange={(_, d) => d && setPerformedAt(d)}
              />
            )}
          </View>
        </Card>

        <Card>
          <SectionLabel>Session total</SectionLabel>
          <Row>
            <StatTile value={Math.round(totalCalories).toLocaleString()} label="kcal burned" accent />
            <StatTile value={formatVolume(totalVolume)} label="Volume lifted" />
          </Row>
          {bw === 0 && (
            <Muted style={{ fontSize: 12 }}>
              Enter your bodyweight to estimate calories — the MET formula needs it.
            </Muted>
          )}
        </Card>

        {exercises.map((x, idx) => {
          const setRows = x.sets.map((s, i) => ({
            set_index: i + 1,
            weight_lb: numOrNull(s.weight),
            reps: numOrNull(s.reps),
          }));
          return (
            <Card key={x.key}>
              <Row>
                <SectionLabel>Exercise {idx + 1}</SectionLabel>
                {exercises.length > 1 && (
                  <Pressable
                    hitSlop={10}
                    onPress={() => setExercises((xs) => xs.filter((e) => e.key !== x.key))}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                )}
              </Row>

              <Input
                value={x.name}
                onChangeText={(v) => patchEx(x.key, 'name', v)}
                placeholder="e.g. Bench press"
              />

              <Text style={styles.inputLabel}>Type</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Row style={{ gap: spacing.sm }}>
                  {EXERCISE_CATEGORIES.map((c) => (
                    <Chip
                      key={c.key}
                      label={c.label}
                      selected={x.category === c.key}
                      onPress={() => patchEx(x.key, 'category', c.key)}
                    />
                  ))}
                </Row>
              </ScrollView>

              <Row style={{ gap: spacing.sm }}>
                <Input
                  label="Duration (min)"
                  value={x.duration}
                  onChangeText={(v) => patchEx(x.key, 'duration', v)}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
                <Input
                  label="Calories (override)"
                  value={x.overrideCalories}
                  onChangeText={(v) => patchEx(x.key, 'overrideCalories', v)}
                  keyboardType="decimal-pad"
                  placeholder={String(Math.round(exCalories(x)))}
                />
              </Row>

              <Row>
                <Text style={styles.inputLabel}>Sets</Text>
                <Muted style={{ fontSize: 12 }}>{formatVolume(volume(setRows))} volume</Muted>
              </Row>

              {x.sets.map((s, i) => (
                <Row key={s.key} style={{ gap: spacing.sm }}>
                  <Text style={styles.setIndex}>{i + 1}</Text>
                  <Input
                    value={s.weight}
                    onChangeText={(v) => patchSet(x.key, s.key, 'weight', v)}
                    keyboardType="decimal-pad"
                    placeholder="bodyweight"
                  />
                  <Text style={styles.times}>×</Text>
                  <Input
                    value={s.reps}
                    onChangeText={(v) => patchSet(x.key, s.key, 'reps', v)}
                    keyboardType="number-pad"
                    placeholder="reps"
                  />
                  {x.sets.length > 1 && (
                    <Pressable
                      hitSlop={8}
                      onPress={() =>
                        setExercises((xs) =>
                          xs.map((e) =>
                            e.key === x.key
                              ? { ...e, sets: e.sets.filter((ss) => ss.key !== s.key) }
                              : e
                          )
                        )
                      }
                    >
                      <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                    </Pressable>
                  )}
                </Row>
              ))}

              <Button title="＋ Add set" variant="secondary" onPress={() => addSet(x.key)} />
            </Card>
          );
        })}

        <Button
          title="＋ Add exercise"
          variant="secondary"
          onPress={() => setExercises((xs) => [...xs, emptyExercise()])}
        />

        <Muted style={{ fontSize: 12 }}>
          Leave weight blank for bodyweight movements like pull-ups.
        </Muted>

        <Button title={workoutId ? 'Save changes' : 'Log workout'} onPress={save} busy={saving} />
      </ScrollView>
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
  setIndex: { color: colors.textMuted, fontSize: 14, width: 16, textAlign: 'center' },
  times: { color: colors.textMuted, fontSize: 16 },
});
