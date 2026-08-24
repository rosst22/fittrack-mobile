import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import {
  Button,
  Card,
  Chip,
  ErrorNote,
  Input,
  Loading,
  Muted,
  Row,
  SectionLabel,
  StatTile,
} from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { estimateBMR, estimateMaintenance, formatHeight } from '@/lib/profile';
import { getProfile, saveProfile } from '@/lib/queries';
import { useAsync } from '@/lib/useAsync';

const numOrNull = (s: string) => {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default function ProfileScreen() {
  const { data, error } = useAsync(() => getProfile(), []);
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [sex, setSex] = useState<'male' | 'female' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!data || ready) return;
    if (data.height_in != null) {
      setFeet(String(Math.floor(data.height_in / 12)));
      setInches(String(Math.round(data.height_in % 12)));
    }
    setAge(data.age != null ? String(data.age) : '');
    setWeight(data.weight_lb != null ? String(data.weight_lb) : '');
    setSex(data.sex === 'male' || data.sex === 'female' ? data.sex : null);
    setReady(true);
  }, [data, ready]);

  const heightIn =
    feet.trim() === '' && inches.trim() === ''
      ? null
      : (numOrNull(feet) ?? 0) * 12 + (numOrNull(inches) ?? 0);

  const live = {
    id: '',
    height_in: heightIn,
    age: numOrNull(age),
    weight_lb: numOrNull(weight),
    sex,
  };
  const bmr = estimateBMR(live);
  const maintenance = estimateMaintenance(live);

  async function onSave() {
    setSaveError(null);
    setSaving(true);
    try {
      await saveProfile({
        height_in: heightIn,
        age: numOrNull(age),
        weight_lb: numOrNull(weight),
        sex,
      });
      router.back();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save.');
      setSaving(false);
    }
  }

  if (error) return <ErrorNote message={error} />;
  if (!data && !ready && !error) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        {saveError && <ErrorNote message={saveError} />}

        <Card>
          <SectionLabel>Estimated energy</SectionLabel>
          <Row>
            <StatTile
              value={bmr == null ? '—' : Math.round(bmr).toLocaleString()}
              label="BMR"
              sub="at rest"
              accent
            />
            <StatTile
              value={maintenance == null ? '—' : Math.round(maintenance).toLocaleString()}
              label="Maintenance"
              sub="sedentary"
            />
            <StatTile value={formatHeight(heightIn)} label="Height" />
          </Row>
          <Muted style={{ fontSize: 12 }}>
            Mifflin-St Jeor. Maintenance uses the resting multiplier (×1.2) because logged
            workouts are counted separately as calories burned.
          </Muted>
        </Card>

        <Card>
          <SectionLabel>Measurements</SectionLabel>
          <Row style={{ gap: spacing.sm }}>
            <Input label="Height (ft)" value={feet} onChangeText={setFeet} keyboardType="number-pad" placeholder="5" />
            <Input label="(in)" value={inches} onChangeText={setInches} keyboardType="number-pad" placeholder="10" />
          </Row>
          <Row style={{ gap: spacing.sm }}>
            <Input label="Weight (lb)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="175" />
            <Input label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="19" />
          </Row>

          <SectionLabel>Sex</SectionLabel>
          <Row style={{ gap: spacing.sm, justifyContent: 'flex-start' }}>
            <Chip label="Male" selected={sex === 'male'} onPress={() => setSex('male')} />
            <Chip label="Female" selected={sex === 'female'} onPress={() => setSex('female')} />
            <Chip label="Prefer not to say" selected={sex === null} onPress={() => setSex(null)} />
          </Row>
          <Muted style={{ fontSize: 12 }}>
            Used only for the BMR constant. Leaving it unset averages the two.
          </Muted>
        </Card>

        <Button title="Save profile" onPress={onSave} busy={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
});
