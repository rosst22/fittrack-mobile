import { router, useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import { Button, Card, ErrorNote, Input, Loading, Muted } from '@/components/ui';
import { colors, spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';

/**
 * Step 2 of password recovery: the recovery link reopened the app here.
 *
 * Supabase hands the credential back in one of two shapes depending on the
 * project's auth flow, and a link can arrive either as the app's cold-start URL
 * or while it is already running — so all four combinations are handled:
 *
 *   PKCE     ?code=…                       → exchangeCodeForSession
 *   implicit #access_token=…&refresh_token=…  → setSession
 *
 * The client is configured with detectSessionInUrl: false (there is no
 * window.location on a phone), so none of this happens automatically.
 */
export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<{ code?: string; access_token?: string; refresh_token?: string }>();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establish() {
      // A recovery link may already have been turned into a session by the
      // auth listener before this screen mounted.
      const { data: existing } = await supabase.auth.getSession();
      if (existing.session) return true;

      // Route params cover the warm-start case (app already running).
      let code = params.code;
      let accessToken = params.access_token;
      let refreshToken = params.refresh_token;

      // Cold start: the URL that launched the app carries them instead, and the
      // implicit flow puts them in the fragment, which expo-router does not
      // parse into params.
      if (!code && !accessToken) {
        const initial = await Linking.getInitialURL();
        if (initial) {
          const parsed = Linking.parse(initial);
          code = (parsed.queryParams?.code as string) ?? undefined;
          const fragment = initial.includes('#') ? initial.split('#')[1] : '';
          const frag = new URLSearchParams(fragment);
          accessToken = accessToken ?? frag.get('access_token') ?? undefined;
          refreshToken = refreshToken ?? frag.get('refresh_token') ?? undefined;
        }
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return !error;
      }
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        return !error;
      }
      return false;
    }

    establish().then((ok) => {
      if (cancelled) return;
      if (ok) setReady(true);
      else setLinkError('This reset link is invalid or has expired. Request a new one.');
    });

    return () => {
      cancelled = true;
    };
  }, [params.code, params.access_token, params.refresh_token]);

  async function save() {
    if (password.length < 8) return setError('Use at least 8 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');

    setSaving(true);
    setError(null);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      // The recovery session is a real session, so the auth gate will now let
      // them straight into the app.
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update the password.');
      setSaving(false);
    }
  }

  if (linkError) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <ErrorNote message={linkError} />
        <Button title="Request a new link" onPress={() => router.replace('/auth/forgot')} />
        <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/login')} />
      </ScrollView>
    );
  }

  if (!ready) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Choose a new password</Text>
        <Muted>You&apos;ll be signed in once it&apos;s saved.</Muted>

        {error && <ErrorNote message={error} />}

        <Card>
          <Input
            label="New password"
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
            onSubmitEditing={save}
            returnKeyType="go"
          />
          <Button title="Save password" onPress={save} busy={saving} />
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.md, gap: spacing.md, paddingTop: spacing.xl },
  title: { color: colors.text, fontSize: 26, fontWeight: '700' },
});
