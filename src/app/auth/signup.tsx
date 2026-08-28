import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Card, ErrorNote, Input, Muted } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim()) return setError('Enter your email address.');
    // Supabase enforces 6; 8 is the floor worth having, and matching the reset
    // screen keeps the rule consistent wherever a password is chosen.
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');

    setBusy(true);
    setError(null);
    try {
      await signUp(email, password);
      // No navigation here — the auth gate redirects once the session lands.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account.');
    } finally {
      // Must run on success too. Leaving it only in the catch meant a signup
      // that worked left the button spinning forever whenever the auth gate did
      // not swap the navigator promptly — the account existed and the session
      // was live, but the screen never said so. login.tsx already does this.
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Create your account</Text>
        <Muted>Track meals and workouts. Free to start.</Muted>

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
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            placeholder="At least 8 characters"
          />
          <Input
            label="Confirm password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            autoCapitalize="none"
            textContentType="newPassword"
            placeholder="Type it again"
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <Button title="Create account" onPress={submit} busy={busy} />
        </Card>

        <Muted style={styles.legal}>
          By creating an account you agree to the{' '}
          <Text style={styles.link} onPress={() => router.push('/legal/terms')}>
            Terms of Use
          </Text>{' '}
          and{' '}
          <Text style={styles.link} onPress={() => router.push('/legal/privacy')}>
            Privacy Policy
          </Text>
          .
        </Muted>

        <Pressable onPress={() => router.replace('/login')} hitSlop={8}>
          <Text style={styles.switch}>Already have an account? Sign in</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingTop: spacing.xl },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
  legal: { fontSize: 12, textAlign: 'center' },
  link: { color: colors.accent, textDecorationLine: 'underline' },
  switch: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: spacing.sm,
    textDecorationLine: 'underline',
  },
});
