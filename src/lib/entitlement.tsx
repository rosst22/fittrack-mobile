// Entitlement + AI usage, held in one context so the paywall, the scanner and
// the coach all agree about what the user is allowed today.
//
// This mirrors server state; it never decides anything. Every AI call is
// re-checked server-side, so a stale or tampered value here changes what the UI
// offers, not what the backend permits.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  FREE_LIMITS,
  PRO_LIMITS,
  getEntitlement,
  getUsageToday,
  type EntitlementSource,
  type Tier,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { configurePurchases, logOutPurchases } from '@/lib/purchases';

type Feature = keyof typeof FREE_LIMITS;

type EntitlementValue = {
  tier: Tier;
  /** Which purchase source is currently paying, for the account screen. */
  source: EntitlementSource | null;
  loading: boolean;
  /** Calls already made today, by feature. */
  usage: Record<string, number>;
  limitFor: (feature: Feature) => number;
  remainingFor: (feature: Feature) => number;
  /** Re-reads from the server and returns the fresh tier. */
  refresh: () => Promise<Tier>;
};

const Ctx = createContext<EntitlementValue | null>(null);

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [tier, setTier] = useState<Tier>('free');
  const [source, setSource] = useState<EntitlementSource | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<Tier> => {
    if (!session) {
      setTier('free');
      setSource(null);
      setUsage({});
      setLoading(false);
      return 'free';
    }
    try {
      const [ent, used] = await Promise.all([getEntitlement(), getUsageToday()]);
      setTier(ent.tier);
      setSource(ent.source);
      setUsage(used);
      return ent.tier;
    } catch {
      // A failed read must not silently upgrade or downgrade anyone; keep what
      // we had and let the server reject if it disagrees.
      return tier;
    } finally {
      setLoading(false);
    }
  }, [session, tier]);

  useEffect(() => {
    if (session?.user.id) configurePurchases(session.user.id);
    else logOutPurchases();
    refresh();
    // refresh is intentionally omitted: it depends on `tier`, and including it
    // would re-run this on every tier change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  const value = useMemo<EntitlementValue>(() => {
    const limits = tier === 'pro' ? PRO_LIMITS : FREE_LIMITS;
    return {
      tier,
      source,
      loading,
      usage,
      limitFor: (f) => limits[f],
      remainingFor: (f) => Math.max(limits[f] - (usage[f] ?? 0), 0),
      refresh,
    };
  }, [tier, source, loading, usage, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useEntitlement() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEntitlement must be used inside <EntitlementProvider>');
  return ctx;
}
