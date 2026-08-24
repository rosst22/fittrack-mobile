import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button, Card, ErrorNote, Input, Loading, Muted, Row, SectionLabel } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { getGoals, saveGoals } from '@/lib/queries';
import { useAsync } from '@/lib/useAsync';

const str = (n: number | null | undefined) => (n == null ? '' : String(n));
const numOrNull = (s: string) => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default function GoalsScreen() {
  const { data, error } = useAsync(() => getGoals(), []);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      calorie_target: str(data.calorie_target),
      protein_target_g: str(data.protein_target_g),
      carbs_target_g: str(data.carbs_target_g),
      fat_target_g: str(data.fat_target_g),
      workouts_per_week: str(data.workouts_per_week),
      water_target_oz: str(data.water_target_oz),
      notes: data.notes ?? '',
    });
  }, [data]);

  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await saveGoals({
        calorie_target: numOrNull(form.calorie_target ?? ''),
        protein_target_g: numOrNull(form.protein_target_g ?? ''),
        carbs_target_g: numOrNull(form.carbs_target_g ?? ''),
        fat_target_g: numOrNull(form.fat_target_g ?? ''),
        workouts_per_week: numOrNull(form.workouts_per_week ?? ''),
        water_target_oz: numOrNull(form.water_target_oz ?? ''),
        notes: (form.notes ?? '').trim() || null,
      });
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!data && !error && Object.keys(form).length === 0) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {saveError && <ErrorNote message={saveError} />}

        <Card>
          <SectionLabel>Daily nutrition</SectionLabel>
          <Row style={{ gap: spacing.sm }}>
            <Input
              label="Calories"
              value={form.calorie_target ?? ''}
              onChangeText={set('calorie_target')}
              keyboardType="decimal-pad"
              placeholder="2400"
            />
            <Input
              label="Protein (g)"
              value={form.protein_target_g ?? ''}
              onChangeText={set('protein_target_g')}
              keyboardType="decimal-pad"
              placeholder="180"
            />
          </Row>
          <Row style={{ gap: spacing.sm }}>
            <Input
              label="Carbs (g)"
              value={form.carbs_target_g ?? ''}
              onChangeText={set('carbs_target_g')}
              keyboardType="decimal-pad"
              placeholder="250"
            />
            <Input
              label="Fat (g)"
              value={form.fat_target_g ?? ''}
              onChangeText={set('fat_target_g')}
              keyboardType="decimal-pad"
              placeholder="70"
            />
          </Row>
        </Card>

        <Card>
          <SectionLabel>Training & hydration</SectionLabel>
          <Row style={{ gap: spacing.sm }}>
            <Input
              label="Workouts / week"
              value={form.workouts_per_week ?? ''}
              onChangeText={set('workouts_per_week')}
              keyboardType="number-pad"
              placeholder="4"
            />
            <Input
              label="Water (oz)"
              value={form.water_target_oz ?? ''}
              onChangeText={set('water_target_oz')}
              keyboardType="decimal-pad"
              placeholder="100"
            />
          </Row>
        </Card>

        <Card>
          <SectionLabel>Notes</SectionLabel>
          <Input
            value={form.notes ?? ''}
            onChangeText={set('notes')}
            placeholder="Anything you want to remember"
            multiline
            style={{ minHeight: 90, textAlignVertical: 'top' }}
          />
          <Muted style={{ fontSize: 12 }}>Leave any field blank to have no target for it.</Muted>
        </Card>

        <Button title="Save goals" onPress={onSave} busy={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});
