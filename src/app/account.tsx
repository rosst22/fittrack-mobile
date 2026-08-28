import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Card, ErrorNote, Input, Muted, Row, SectionLabel } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { deleteAccount } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEntitlement } from '@/lib/entitlement';
import { showProUpsell } from '@/lib/purchases';

/**
 * Account management, including deletion.
 *
 * App Store Review guideline 5.1.1(v): an app that supports account creation
 * must also let the user initiate deletion from within the app. It has to be
 * genuinely reachable — not an email link, not a web page — and it must delete
 * the account, not merely deactivate it.
 */
export default function AccountScreen() {
  const { session, signOut } = useAuth();
  const { tier } = useEntitlement();
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  function confirmAndDelete() {
    Alert.alert(
      'Delete account permanently?',
      'Every meal, workout, goal and photo will be erased. This cannot be undone and there is no backup.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await deleteAccount();
              // The user row is gone, so the session is already invalid; this
              // just clears it locally and drops us back to the login screen.
              await signOut();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete the account.');
              setBusy(false);
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <SectionLabel>Signed in as</SectionLabel>
        <Text style={styles.email}>{session?.user.email}</Text>
        <Row>
          <Muted>Plan</Muted>
          <Text style={[styles.plan, tier === 'pro' && { color: colors.accent }]}>
            {tier === 'pro' ? 'FitTrack.AI Pro' : 'Free'}
          </Text>
        </Row>
        {tier === 'pro' ? (
          <Button
            title="Manage subscription"
            variant="secondary"
            onPress={() => Linking.openURL('https://apps.apple.com/account/subscriptions')}
          />
        ) : (
          showProUpsell() && (
            <Button title="See FitTrack.AI Pro" onPress={() => router.push('/paywall')} />
          )
        )}
      </Card>

      <Card>
        <SectionLabel>Legal</SectionLabel>
        <Pressable style={styles.linkRow} onPress={() => router.push('/legal/privacy')}>
          <Text style={styles.linkText}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => router.push('/legal/terms')}>
          <Text style={styles.linkText}>Terms of Use</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>
      </Card>

      <Card style={styles.dangerCard}>
        <SectionLabel>Delete account</SectionLabel>
        <Muted>
          This permanently erases your account and everything in it — meals, ingredients, workouts,
          sets, goals, water, habits, supplements and photos. It happens immediately and cannot be
          undone.
        </Muted>

        {tier === 'pro' && (
          <View style={styles.warnBox}>
            <Text style={styles.warnText}>
              Deleting your account does not cancel your subscription. Apple controls billing —
              cancel it in Settings → Apple ID → Subscriptions, or you will keep being charged.
            </Text>
          </View>
        )}

        {error && <ErrorNote message={error} />}

        <Input
          label="Type DELETE to confirm"
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DELETE"
        />

        <Button
          title="Delete my account"
          variant="danger"
          disabled={!canDelete}
          busy={busy}
          onPress={confirmAndDelete}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  email: { color: colors.text, fontSize: 17, fontWeight: '600' },
  plan: { color: colors.textMuted, fontSize: 15, fontWeight: '700' },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  linkText: { color: colors.text, fontSize: 16 },
  dangerCard: { borderColor: colors.danger },
  warnBox: {
    borderColor: '#F59E0B',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    backgroundColor: '#2A2113',
  },
  warnText: { color: '#F59E0B', fontSize: 13 },
});
