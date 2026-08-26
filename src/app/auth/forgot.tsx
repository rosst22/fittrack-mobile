import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Card, ErrorNote, Input, Muted, SectionLabel } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/**
 * Step 1 of password recovery: ask Supabase to email a recovery link.
 *
 * `redirectTo` uses the app's own URL scheme so the link reopens FitTrack
 * rather than a browser. That scheme must be listed in Supabase → Authentication
 * → URL Configuration → Redirect URLs, or Supabase silently falls back to the
 * project's Site URL and the link lands on the web app instead. That exact
 * silent fallback has bitten this project before.
 */
export const RESET_REDIRECT = 'fittrack://auth/reset';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const address = email.trim();
    if (!address) return setError('Enter your email address.');

    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: RESET_REDIRECT,
      });
      if (error) throw error;
      // Deliberately shown whether or not the address has an account —
      // reporting "no such user" would let anyone test which emails are
      // registered.
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the reset email.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Card>
          <SectionLabel>Check your email</SectionLabel>
          <Text style={styles.heading}>Reset link sent</Text>
          <Muted>
            If an account exists for {email.trim()}, a password reset link is on its way. Open it on
            this phone and it will bring you back here to choose a new password.
          </Muted>
          <Muted style={{ fontSize: 13 }}>
            The link expires after an hour. Check your spam folder if it does not arrive within a
            few minutes.
          </Muted>
          <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/login')} />
        </Card>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Reset your password</Text>
        <Muted>We&apos;ll email you a link to choose a new one.</Muted>

        {error && <ErrorNote message={error} />}

        <Card>
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            inputMode="email"
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Button title="Send reset link" onPress={send} busy={busy} />
        </Card>

        <Button title="Back to sign in" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingTop: spacing.xl },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  heading: { color: colors.text, fontSize: 20, fontWeight: '700' },
  card: { borderRadius: radius.lg },
});
