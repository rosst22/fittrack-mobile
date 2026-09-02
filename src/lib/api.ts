// Calls into the Supabase Edge Functions.
//
// Everything here is a request to a server that re-checks entitlement and quota
// itself. The `usage` figures that come back are for display only — the app
// never decides whether a call is allowed, it just reports what the server
// said. Treat a 429 as authoritative even if the local counter disagrees.
import { APP_TZ } from '@/lib/day';
import { supabase } from '@/lib/supabase';

export type Tier = 'free' | 'pro';

export type Usage = { used: number; limit: number; tier: Tier };

/** Thrown when the server refuses on quota grounds; `upgrade` drives the paywall. */
export class QuotaError extends Error {
  usage?: Usage;
  upgrade: boolean;
  constructor(message: string, usage: Usage | undefined, upgrade: boolean) {
    super(message);
    this.name = 'QuotaError';
    this.usage = usage;
    this.upgrade = upgrade;
  }
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });

  if (error) {
    // supabase-js surfaces non-2xx as FunctionsHttpError with the body on
    // `context`; dig the real message out so the user sees "3 free scans used"
    // rather than "Edge Function returned a non-2xx status code".
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = (await ctx.json()) as {
          error?: string;
          usage?: Usage;
          upgrade?: boolean;
        };
        if (ctx.status === 429) {
          throw new QuotaError(
            payload.error ?? 'Daily limit reached.',
            payload.usage,
            payload.upgrade ?? false
          );
        }
        if (payload.error) throw new Error(payload.error);
      } catch (e) {
        if (e instanceof QuotaError) throw e;
        if (e instanceof Error && e.message && !e.message.includes('non-2xx')) throw e;
      }
    }
    throw new Error(error.message ?? 'Request failed.');
  }

  return data as T;
}

export type AnalyzedIngredient = {
  name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  sodium_mg: number;
  potassium_mg: number;
  cholesterol_mg: number;
};

export type AnalyzedMeal = {
  meal_name: string;
  ingredients: AnalyzedIngredient[];
  usage: Usage;
};

/** Estimate a meal from a photo, a description, or both. */
export function analyzeMeal(input: { image?: string; description?: string }) {
  return invoke<AnalyzedMeal>('analyze-photo', input);
}

export type CoachReply = { reply: string; usage: Usage };

export function coachChat(messages: { role: 'user' | 'assistant'; content: string }[]) {
  // The coach's "today" has to be the user's today. The Edge Function is
  // stateless and has no idea where the phone is, so the zone travels with the
  // request; the server validates it and falls back on its own if it is bogus.
  return invoke<CoachReply>('coach-chat', { messages, timeZone: APP_TZ });
}

/** Irreversible. The caller must have confirmed with the user first. */
export function deleteAccount() {
  return invoke<{ ok: true }>('delete-account', { confirm: 'DELETE' });
}

export type EntitlementSource = 'app_store' | 'stripe' | 'promotional';

/**
 * Current entitlement, from the `effective_entitlement` view.
 *
 * The view — not the raw table — because a user can hold entitlements from more
 * than one source (Apple IAP and a web Stripe subscription). It resolves those
 * to "pro if any source is currently active" and enforces expiry on read.
 */
export async function getEntitlement(): Promise<{
  tier: Tier;
  expiresAt: string | null;
  source: EntitlementSource | null;
}> {
  const { data, error } = await supabase
    .from('effective_entitlement')
    .select('tier, expires_at, active_source')
    .maybeSingle();

  if (error || !data) return { tier: 'free', expiresAt: null, source: null };

  const row = data as {
    tier: string;
    expires_at: string | null;
    active_source: EntitlementSource | null;
  };

  return {
    tier: row.tier === 'pro' ? 'pro' : 'free',
    expiresAt: row.expires_at,
    source: row.active_source,
  };
}

// stripeCheckoutUrl() used to live here, building a Stripe Payment Link for the
// paywall's "subscribe on the web" button. Both are gone: guideline 3.1.1
// forbids linking to an external purchase mechanism from inside the app. The
// stripe-webhook Edge Function stays — honouring a subscription someone bought
// on the website is allowed under 3.1.3(b); it is only the in-app LINK to buy
// one that is not.

/** Today's call counts per feature, for the "2 of 3 left" labels. */
export async function getUsageToday(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('ai_usage_today').select('feature, calls');
  if (error || !data) return {};
  return Object.fromEntries(
    (data as { feature: string; calls: number }[]).map((r) => [r.feature, r.calls])
  );
}

/**
 * Allowances, mirrored from supabase/functions/_shared/guard.ts.
 * Display only — the server re-checks every call and its 429 is authoritative.
 * If these drift from the server's, the UI lies but nothing becomes exploitable.
 */
export const FREE_LIMITS = { photo_meal: 3, text_meal: 3, coach_chat: 1 } as const;
export const PRO_LIMITS = { photo_meal: 15, text_meal: 30, coach_chat: 15 } as const;
