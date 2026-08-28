import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { EntitlementProvider } from '@/lib/entitlement';

// Redirects between the signed-in and signed-out halves of the app whenever the
// session changes. Doing this in an effect (rather than conditionally rendering
// one tree or the other) keeps expo-router's navigation state coherent.
function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;
    // /auth/* is reachable signed-out (password recovery), and /auth/reset
    // must also stay reachable while the temporary recovery session is active.
    const onAuthScreen = segments[0] === 'login' || segments[0] === 'auth';
    if (!session && !onAuthScreen) router.replace('/login');
    else if (session && segments[0] === 'login') router.replace('/');
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="auth/signup" options={{ title: 'Create account' }} />
      <Stack.Screen name="auth/forgot" options={{ title: 'Reset password' }} />
      <Stack.Screen name="auth/reset" options={{ title: 'New password' }} />
      <Stack.Screen name="meal/new" options={{ title: 'Log meal', presentation: 'modal' }} />
      <Stack.Screen name="meal/[id]" options={{ title: 'Edit meal' }} />
      <Stack.Screen name="workout/new" options={{ title: 'Log workout', presentation: 'modal' }} />
      <Stack.Screen name="workout/[id]" options={{ title: 'Edit workout' }} />
      <Stack.Screen name="goals" options={{ title: 'Goals' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
      <Stack.Screen name="daily" options={{ title: 'Daily' }} />
      <Stack.Screen name="week" options={{ title: 'Weekly review' }} />
      <Stack.Screen name="account" options={{ title: 'Account' }} />
      <Stack.Screen name="coach" options={{ title: 'AI coach' }} />
      <Stack.Screen
        name="paywall"
        options={{ title: 'FitTrack.AI Pro', presentation: 'modal' }}
      />
      <Stack.Screen name="legal" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <EntitlementProvider>
            <StatusBar style="light" />
            <AuthGate />
          </EntitlementProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
