// Calls into the Supabase Edge Functions.
//
// Everything here is a request to a server that re-checks entitlement and quota
// itself. The `usage` figures that come back are for display only — the app
// never decides whether a call is allowed, it just reports what the server
// said. Treat a 429 as authoritative even if the local counter disagrees.
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
  return invoke<CoachReply>('coach-chat', { messages });
}

/** Irreversible. The caller must have confirmed with the user first. */
export function deleteAccount() {
  return invoke<{ ok: true }>('delete-account', { confirm: 'DELETE' });
}

/** Current entitlement, read straight from the table (RLS-scoped to the user). */
export async function getEntitlement(): Promise<{ tier: Tier; expiresAt: string | null }> {
  const { data, error } = await supabase
    .from('entitlements')
    .select('tier, status, expires_at')
    .maybeSingle();

  if (error || !data) return { tier: 'free', expiresAt: null };

  const row = data as { tier: string; status: string; expires_at: string | null };
  const active =
    row.tier === 'pro' &&
    (row.status === 'active' || row.status === 'billing_retry') &&
    (!row.expires_at || new Date(row.expires_at).getTime() > Date.now());

  return { tier: active ? 'pro' : 'free', expiresAt: row.expires_at };
}

/** Today's call counts per feature, for the "2 of 3 left" labels. */
export async function getUsageToday(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('ai_usage_today').select('feature, calls');
  if (error || !data) return {};
  return Object.fromEntries(
    (data as { feature: string; calls: number }[]).map((r) => [r.feature, r.calls])
  );
}

/** Free-tier allowances, mirrored from supabase/functions/_shared/guard.ts. */
export const FREE_LIMITS = { photo_meal: 3, text_meal: 5, coach_chat: 10 } as const;
export const PRO_LIMITS = { photo_meal: 50, text_meal: 100, coach_chat: 200 } as const;
