import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { Button, Card, ErrorNote, Loading, Muted, Row, SectionLabel } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { FREE_LIMITS, PRO_LIMITS } from '@/lib/api';
import { useEntitlement } from '@/lib/entitlement';
import { getOfferings, isPurchasesAvailable, purchase, restore } from '@/lib/purchases';

const PERKS: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }[] = [
  {
    icon: 'camera',
    title: `${PRO_LIMITS.photo_meal} photo scans a day`,
    body: `Snap a plate or a nutrition label and get the macros filled in. Free gives you ${FREE_LIMITS.photo_meal}.`,
  },
  {
    icon: 'chatbubbles',
    title: `${PRO_LIMITS.coach_chat} coach messages a day`,
    body: `Ask about your actual logged data. Free gives you ${FREE_LIMITS.coach_chat}.`,
  },
  {
    icon: 'sparkles',
    title: `${PRO_LIMITS.text_meal} AI meal estimates a day`,
    body: `Describe a meal in words and skip the ingredient form. Free gives you ${FREE_LIMITS.text_meal}.`,
  },
];

export default function PaywallScreen() {
  const { tier, refresh } = useEntitlement();
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isPurchasesAvailable()) {
      setPackages([]);
      return;
    }
    getOfferings()
      .then(setPackages)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Could not load plans.');
        setPackages([]);
      });
  }, []);

  async function buy(pkg: PurchasesPackage) {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const outcome = await purchase(pkg);
      if (outcome === 'cancelled') return;
      // StoreKit is done, but Pro is granted by our webhook, not by the app.
      // Give it a moment, then re-read; if it has not landed, say so honestly
      // rather than showing a success screen that is not true yet.
      await new Promise((r) => setTimeout(r, 1500));
      const next = await refresh();
      if (next === 'pro') router.back();
      else setNotice('Payment went through. Unlocking can take a moment — pull to refresh shortly.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The purchase could not be completed.');
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const found = await restore();
      await refresh();
      setNotice(found ? 'Purchases restored.' : 'No previous purchase was found for this Apple ID.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not restore purchases.');
    } finally {
      setBusy(false);
    }
  }

  if (tier === 'pro') {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <Row style={{ justifyContent: 'flex-start', gap: spacing.sm }}>
            <Ionicons name="checkmark-circle" size={26} color={colors.accent} />
            <Text style={styles.proTitle}>You&apos;re on FitTrack Pro</Text>
          </Row>
          <Muted>
            Manage or cancel any time in Settings → Apple ID → Subscriptions. Cancelling keeps Pro
            until the end of the period you have paid for.
          </Muted>
          <Button
            title="Manage subscription"
            variant="secondary"
            onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
          />
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>FitTrack Pro</Text>
        <Muted style={{ textAlign: 'center' }}>
          Everything in FitTrack stays free — logging, workouts, trends, the weekly review. Pro
          raises the limits on the AI features, which cost real money to run.
        </Muted>
      </View>

      {error && <ErrorNote message={error} />}
      {notice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      )}

      <Card>
        {PERKS.map((p, i) => (
          <Row key={p.title} style={[styles.perk, i > 0 && styles.perkDivider]}>
            <Ionicons name={p.icon} size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.perkTitle}>{p.title}</Text>
              <Muted style={{ fontSize: 13 }}>{p.body}</Muted>
            </View>
          </Row>
        ))}
      </Card>

      {packages === null ? (
        <Loading />
      ) : packages.length === 0 ? (
        <Card>
          <SectionLabel>Not available yet</SectionLabel>
          <Muted>
            In-app purchases are not configured on this build. This needs the RevenueCat key and an
            App Store Connect subscription product, so it only works in a real build — not in Expo
            Go.
          </Muted>
        </Card>
      ) : (
        packages.map((pkg) => (
          <Pressable
            key={pkg.identifier}
            style={styles.plan}
            disabled={busy}
            onPress={() => buy(pkg)}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.planTitle}>{pkg.product.title}</Text>
              <Muted style={{ fontSize: 13 }}>{pkg.product.description}</Muted>
            </View>
            <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
          </Pressable>
        ))
      )}

      <Button title="Restore purchases" variant="secondary" onPress={onRestore} busy={busy} />

      <Muted style={styles.legal}>
        Payment is charged to your Apple ID. Subscriptions renew automatically unless cancelled at
        least 24 hours before the period ends. Manage or cancel in Settings → Apple ID →
        Subscriptions.
      </Muted>

      <Row style={{ gap: spacing.md, justifyContent: 'center' }}>
        <Pressable onPress={() => router.push('/legal/privacy')}>
          <Text style={styles.link}>Privacy Policy</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/legal/terms')}>
          <Text style={styles.link}>Terms of Use</Text>
        </Pressable>
      </Row>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  heroTitle: { color: colors.accent, fontSize: 32, fontWeight: '800' },
  proTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
  perk: { gap: spacing.md, paddingVertical: 12, alignItems: 'flex-start' },
  perkDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  perkTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  planTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  planPrice: { color: colors.accent, fontSize: 20, fontWeight: '800' },
  legal: { fontSize: 11, textAlign: 'center' },
  link: { color: colors.textMuted, fontSize: 12, textDecorationLine: 'underline' },
  notice: {
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: '#14301F',
  },
  noticeText: { color: colors.accent, fontSize: 14 },
});
