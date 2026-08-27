// Auth state for the whole app, held in React context.
//
// The web app asks the server "who is this?" on every request (getUser() in a
// server component). A mobile app has no request cycle to hang that off, so the
// session is held in memory here and kept in sync with Supabase's own store via
// onAuthStateChange. That listener fires on sign-in, sign-out, and every token
// refresh, so this context is always current without polling.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

type AuthValue = {
  session: Session | null;
  /** True until the persisted session has been read from storage. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  /** Creates the account. Email confirmation is off, so this signs in too. */
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // Restore whatever was persisted from the last launch.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      loading,
      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        // Let the caller show it; onAuthStateChange handles the success path.
        if (error) throw error;
      },
      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // The project has email confirmation disabled, so signUp normally
        // returns a live session and onAuthStateChange takes over. If
        // confirmation is ever turned on, there is no session and the caller
        // needs to say "check your email" rather than silently doing nothing.
        if (!data.session) {
          throw new Error(
            'Account created. Check your email to confirm it, then sign in.'
          );
        }
      },

      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
