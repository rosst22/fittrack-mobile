import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, ErrorNote, Muted, SectionLabel } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { APP_TZ, dayRange, todayStr } from '@/lib/day';
import { useAuth } from '@/lib/auth';

type Item = {
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
};

const ITEMS: Item[] = [
  { label: 'Weekly review', sub: 'Mon–Sun hit rate and totals', icon: 'calendar-outline', href: '/week' },
  { label: 'Daily', sub: 'Water, habits, supplements', icon: 'checkbox-outline', href: '/daily' },
  { label: 'Goals', sub: 'Calorie, macro and water targets', icon: 'flag-outline', href: '/goals' },
  { label: 'Profile', sub: 'Height, weight, age, BMR', icon: 'person-outline', href: '/profile' },
];

export default function MoreScreen() {
  const { session, signOut } = useAuth();

  function confirmSignOut() {
    Alert.alert('Sign out', 'Sign out of FitTrack?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={{ gap: 0 }}>
        {ITEMS.map((item, i) => (
          <Pressable
            key={item.href}
            style={[styles.row, i > 0 && styles.rowDivider]}
            onPress={() => router.push(item.href as never)}
          >
            <Ionicons name={item.icon} size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{item.label}</Text>
              <Muted style={{ fontSize: 13 }}>{item.sub}</Muted>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>

      <Card>
        <SectionLabel>Account</SectionLabel>
        <Muted>{session?.user.email}</Muted>
        <Pressable style={styles.signOut} onPress={confirmSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </Card>

      <TimezoneCheck />

      <Muted style={styles.footer}>
        Sleep, WHOOP and the AI coach still live on the web app at
        fittrack.rosstoma.me — they need server-side keys the phone must not hold.
      </Muted>
    </ScrollView>
  );
}

/**
 * Day bucketing depends on Intl.DateTimeFormat honouring its `timeZone` option.
 * React Native runs on Hermes, whose Intl support is a separate implementation
 * from Node's — and if it silently ignores timeZone, dayRange() degrades to UTC
 * and every meal logged after ~8pm files itself under tomorrow. That exact bug
 * has shipped three times on the web app, so it gets a visible check here
 * rather than a comment hoping someone remembers.
 */
function TimezoneCheck() {
  const { start } = dayRange(todayStr());
  const ok = !start.endsWith('T00:00:00.000Z');
  if (ok) return null;
  return (
    <ErrorNote
      message={
        `Timezone handling is broken on this device: a ${APP_TZ} day is starting at ` +
        `${start} (UTC midnight). Day totals will be wrong for late-evening entries. ` +
        `Hermes is ignoring the Intl timeZone option.`
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 14 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  signOut: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  signOutText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  footer: { fontSize: 12, textAlign: 'center', paddingHorizontal: spacing.md },
});
