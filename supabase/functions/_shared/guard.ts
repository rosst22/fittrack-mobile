// Shared gate for every AI Edge Function: who are you, are you allowed, and
// have you used up today's allowance.
//
// All three checks run server-side on purpose. The app shows a paywall and a
// remaining-scans counter, but those are cosmetic — a modified client can lie
// about both, so nothing here trusts anything the client says about itself
// except its access token, which is signed.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Tier = 'free' | 'pro';

/**
 * Per-day allowances, by tier.
 *
 * These are sized against what a subscription actually nets after Apple's cut:
 * $5/month at the Small Business Program's 15% is $4.25, or about 14c a day.
 * The spend caps are the real protection — a call allowance alone doesn't bound
 * cost, because one long coach conversation costs many times what a photo scan
 * does. Free gets a cap too: free users generate no revenue at all, so an
 * abusive one is pure loss.
 *
 * Free has NO coach access (limit 0). checkQuota treats 0 as "always blocked",
 * and the message it returns points at the paywall rather than reporting a
 * used-up allowance.
 */
export const LIMITS = {
  free: { photo_meal: 1, text_meal: 2, coach_chat: 0, spendUsd: 0.03 },
  pro: { photo_meal: 15, text_meal: 30, coach_chat: 15, spendUsd: 0.45 },
} as const;

export type Feature = 'photo_meal' | 'text_meal' | 'coach_chat';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * A client bound to the caller's JWT. Every query through it is still subject
 * to RLS, which is what we want for reads — the service-role client is only for
 * the few operations that must bypass it (entitlement writes, user deletion).
 */
export function userClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  );
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );
}

export async function requireUser(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/**
 * The caller's current tier.
 *
 * Treats a missing row as free, and — importantly — treats an `active` row
 * whose expires_at is in the past as free too. RevenueCat webhooks can be
 * delayed or dropped; expiry must be enforced on read, not only on write.
 */
export async function getTier(supabase: SupabaseClient, userId: string): Promise<Tier> {
  const { data } = await supabase
    .from('entitlements')
    .select('tier, status, expires_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!data) return 'free';
  if (data.tier !== 'pro') return 'free';
  if (data.status !== 'active' && data.status !== 'billing_retry') return 'free';
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return 'free';
  return 'pro';
}

export type QuotaResult =
  | { ok: true; used: number; limit: number; tier: Tier }
  | { ok: false; reason: string; used: number; limit: number; tier: Tier };

/**
 * Counts today's calls for one feature and today's total spend.
 *
 * Day boundary is UTC, matching what the web app already does, so a user does
 * not get a second allowance by having the two clients disagree about when
 * "today" started.
 */
export async function checkQuota(
  supabase: SupabaseClient,
  userId: string,
  feature: Feature,
  tier: Tier
): Promise<QuotaResult> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('ai_usage')
    .select('feature, cost_usd')
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString());

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const used = rows.filter((r) => r.feature === feature).length;
  const spent = rows.reduce((n, r) => n + Number(r.cost_usd ?? 0), 0);
  const limits = LIMITS[tier];
  const limit = limits[feature];

  if (used >= limit) {
    // A zero allowance is a locked feature, not an exhausted one — saying
    // "you've used all 0" reads as a bug.
    if (limit === 0) {
      return {
        ok: false,
        used,
        limit,
        tier,
        reason: `${capitalize(labelFor(feature))} are a FitTrack Pro feature.`,
      };
    }
    return {
      ok: false,
      used,
      limit,
      tier,
      reason:
        tier === 'free'
          ? `That's your ${limit === 1 ? 'free scan' : `${limit} free ${labelFor(feature)}`} for today. Pro gets ${LIMITS.pro[feature]} a day, or try again after midnight UTC.`
          : `Daily limit of ${limit} ${labelFor(feature)} reached. Resets at midnight UTC.`,
    };
  }

  // Backstop against a single user running up the Anthropic bill even inside
  // their call allowance — a huge photo costs far more than a small one.
  if (spent >= limits.spendUsd) {
    return {
      ok: false,
      used,
      limit,
      tier,
      reason: `Daily AI spend cap ($${limits.spendUsd.toFixed(2)}) reached. Resets at midnight UTC.`,
    };
  }

  return { ok: true, used, limit, tier };
}

function labelFor(feature: Feature) {
  if (feature === 'photo_meal') return 'photo scans';
  if (feature === 'text_meal') return 'AI meal estimates';
  return 'coach messages';
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Model per feature.
 *
 * Meal estimation is structured extraction from an image or a short phrase —
 * squarely a Haiku task, and Haiku is 3x cheaper per call, which is what makes
 * a generous photo allowance affordable. The coach reasons over the day's
 * numbers and gives advice, so it stays on Sonnet.
 */
export const MODELS = {
  photo_meal: 'claude-haiku-4-5',
  text_meal: 'claude-haiku-4-5',
  coach_chat: 'claude-sonnet-4-6',
} as const;

/** USD per million tokens. Keep in step with the models above. */
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
};

export function modelFor(feature: Feature): string {
  return MODELS[feature];
}

export function costUsd(model: string, inputTokens: number, outputTokens: number) {
  // An unknown model must not price as free — that would silently disable the
  // spend cap. Fall back to the most expensive model we use.
  const price = PRICING[model] ?? { input: 3.0, output: 15.0 };
  return (
    (inputTokens * price.input) / 1_000_000 + (outputTokens * price.output) / 1_000_000
  );
}

export async function recordUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: Feature,
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  await supabase.from('ai_usage').insert({
    user_id: userId,
    feature,
    model,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: costUsd(model, inputTokens, outputTokens),
  });
}
