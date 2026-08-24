// Supabase client for React Native.
//
// Differences from the web app's client (meal-tracker/src/lib/supabase/*):
//  - The web app stores the session in cookies via @supabase/ssr, because the
//    server needs to read it. There is no server here, so the session lives in
//    on-device storage instead.
//  - detectSessionInUrl must be off: that option exists to parse an OAuth
//    callback out of window.location, which does not exist in RN.
//
// The anon key being bundled into the app is expected and safe — it is already
// public in the web bundle. It grants nothing on its own; Row Level Security in
// Postgres is what actually scopes every row to its owner.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill it in, then restart the dev server ' +
      '(env vars are inlined at bundle time, so a reload is not enough).'
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Supabase refreshes the access token on a timer. That timer cannot fire while
// the app is backgrounded, so we stop it on background and restart it on
// foreground — otherwise the first query after a long background can race a
// stale token.
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
