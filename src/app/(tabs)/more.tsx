import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, ErrorNote, Muted, Row, SectionLabel } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { APP_TZ, dayRange, todayStr } from '@/lib/day';
import { useAuth } from '@/lib/auth';
import { useEntitlement } from '@/lib/entitlement';
import { showProUpsell } from '@/lib/purchases';

type Item = {
  label: string;
  sub: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
  /** Pro-only: free users are sent to the paywall instead of the screen. */
  pro?: boolean;
};

const ITEMS: Item[] = [
  { label: 'AI coach', sub: 'Ask about the data you logged', icon: 'chatbubbles-outline', href: '/coach' },
  { label: 'Weekly review', sub: 'Mon–Sun hit rate and totals', icon: 'calendar-outline', href: '/week' },
  { label: 'Daily', sub: 'Water, habits, supplements', icon: 'checkbox-outline', href: '/daily' },
  { label: 'Goals', sub: 'Calorie, macro and water targets', icon: 'flag-outline', href: '/goals' },
  { label: 'Profile', sub: 'Height, weight, age, BMR', icon: 'person-outline', href: '/profile' },
  { label: 'Account', sub: 'Plan, legal, delete account', icon: 'settings-outline', href: '/account' },
];

export default function MoreScreen() {
  const { session, signOut } = useAuth();
  const { tier, limitFor, remainingFor } = useEntitlement();

  function confirmSignOut() {
    Alert.alert('Sign out', 'Sign out of FitTrack.AI?', [
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
            onPress={() =>
              item.pro && tier !== 'pro' && showProUpsell()
                ? router.push('/paywall')
                : router.push(item.href as never)
            }
          >
            <Ionicons name={item.icon} size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Row style={{ justifyContent: 'flex-start', gap: spacing.sm }}>
                <Text style={styles.label}>{item.label}</Text>
                {item.pro && tier !== 'pro' && <Text style={styles.proBadge}>PRO</Text>}
              </Row>
              <Muted style={{ fontSize: 13 }}>{item.sub}</Muted>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>

      {tier === 'free' && showProUpsell() ? (
        <Pressable style={styles.proCard} onPress={() => router.push('/paywall')}>
          <Ionicons name="sparkles" size={24} color={colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.proTitle}>FitTrack.AI Pro</Text>
            <Muted style={{ fontSize: 13 }}>
              {remainingFor('photo_meal')} of {limitFor('photo_meal')} photo scans left today
            </Muted>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      ) : tier === 'free' ? (
        // No way to buy in this build, so state the allowance as a fact rather
        // than dangling an upgrade the user cannot complete.
        <Card>
          <Row>
            <Row style={{ justifyContent: 'flex-start', gap: spacing.sm, flex: 1 }}>
              <Ionicons name="camera-outline" size={20} color={colors.accent} />
              <Text style={styles.proTitle}>Daily AI limits</Text>
            </Row>
            <Muted style={{ fontSize: 13 }}>
              {remainingFor('photo_meal')}/{limitFor('photo_meal')} scans left
            </Muted>
          </Row>
        </Card>
      ) : (
        <Card>
          <Row>
            <Row style={{ justifyContent: 'flex-start', gap: spacing.sm, flex: 1 }}>
              <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
              <Text style={styles.proTitle}>FitTrack.AI Pro</Text>
            </Row>
            <Muted style={{ fontSize: 13 }}>
              {remainingFor('photo_meal')}/{limitFor('photo_meal')} scans left
            </Muted>
          </Row>
        </Card>
      )}

      <Card>
        <SectionLabel>Account</SectionLabel>
        <Muted>{session?.user.email}</Muted>
        <Pressable style={styles.signOut} onPress={confirmSignOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </Card>

      <TimezoneCheck />

      <Muted style={styles.footer}>
        WHOOP sync and sleep still live on the web app at fittrack.rosstoma.me — they need an OAuth
        secret the phone must not hold.
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
 *
 * The check formats ONE fixed instant in two zones that can never agree, rather
 * than looking at where today's boundary lands. The old version flagged any day
 * starting at 00:00Z as broken — correct while APP_TZ was pinned to Toronto,
 * but a false alarm for every real user in Europe/London or Atlantic/Reykjavik
 * now that the zone comes from the device.
 */
function intlHonoursTimeZone() {
  try {
    const instant = new Date('2026-07-20T12:00:00Z');
    const toronto = instant.toLocaleString('en-US', {
      timeZone: 'America/Toronto',
      hour: 'numeric',
    });
    const tokyo = instant.toLocaleString('en-US', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
    });
    return toronto !== tokyo;
  } catch {
    return false;
  }
}

function TimezoneCheck() {
  if (intlHonoursTimeZone()) return null;
  const { start } = dayRange(todayStr());
  return (
    <ErrorNote
      message={
        `Timezone handling is broken on this device: Hermes is ignoring the Intl ` +
        `timeZone option, so a ${APP_TZ} day is starting at ${start}. Day totals ` +
        `will be wrong for late-evening entries.`
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
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  proTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  proBadge: {
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
  footer: { fontSize: 12, textAlign: 'center', paddingHorizontal: spacing.md },
});
