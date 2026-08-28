// POST /functions/v1/revenuecat-webhook
//
// The ONLY writer of the entitlements table. RevenueCat calls this after it has
// validated the receipt with Apple, which is why the app never tells our server
// "I bought Pro" — that claim would be trivially forgeable on a jailbroken
// device.
//
// Configure in RevenueCat → Project → Integrations → Webhooks:
//   URL:    https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
//   Header: Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
//
// Deploy with --no-verify-jwt, because RevenueCat cannot present a Supabase
// user JWT. The shared secret below is what authenticates the caller instead,
// so that check must never be relaxed.
import { json, serviceClient } from '../_shared/guard.ts';

/** Events that mean "this user currently has access". */
const GRANTING = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
]);

/** Events that mean "access is gone now". */
const REVOKING = new Set(['EXPIRATION', 'REFUND', 'SUBSCRIPTION_PAUSED']);

/**
 * CANCELLATION is deliberately in neither set. It means auto-renew was turned
 * off, not that access ended — the user keeps Pro until expires_at, and an
 * EXPIRATION event arrives then. Treating it as revoking would cut people off
 * the moment they cancel, which is both wrong and a refund request.
 */

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const expected = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  if (!expected) {
    console.error('REVENUECAT_WEBHOOK_SECRET is not set — refusing all webhooks');
    return json({ error: 'Not configured' }, 500);
  }

  const provided = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!timingSafeEqual(provided, expected)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let payload: {
    event?: {
      type?: string;
      app_user_id?: string;
      product_id?: string;
      store?: string;
      expiration_at_ms?: number;
      entitlement_ids?: string[];
    };
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid body' }, 400);
  }

  const event = payload.event;
  const type = event?.type;
  // The app configures RevenueCat's appUserID to be the Supabase user id, so
  // this maps straight onto our users. See lib/purchases.ts.
  const userId = event?.app_user_id;

  if (!type || !userId) return json({ error: 'Missing event type or app_user_id' }, 400);

  // A malformed or spoofed id must not create rows against a random uuid.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: 'app_user_id is not a user id' }, 400);
  }

  // Events we do not act on (TEST, TRANSFER, …) are acknowledged, not errored —
  // returning non-2xx makes RevenueCat retry them forever.
  if (!GRANTING.has(type) && !REVOKING.has(type)) {
    return json({ ok: true, ignored: type });
  }

  const granting = GRANTING.has(type);
  const admin = serviceClient();

  const { error } = await admin.from('entitlements').upsert(
    {
      user_id: userId,
      // entitlements is keyed by (user_id, source) so that a Stripe row and an
      // App Store row can coexist. This webhook owns exactly one of them, and
      // the value must be a constant: deriving it from event.store would let a
      // single subscription land on two different rows and leave a stale 'pro'
      // behind that nothing ever expires.
      source: 'app_store',
      tier: granting ? 'pro' : 'free',
      status: granting ? 'active' : 'expired',
      product_id: event?.product_id ?? null,
      store: event?.store?.toLowerCase() ?? null,
      expires_at: event?.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
      revenuecat_customer_id: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,source' }
  );

  if (error) {
    // 5xx so RevenueCat retries — a dropped grant means someone paid and did
    // not get access.
    console.error('entitlement upsert failed', error.message);
    return json({ error: 'Could not record entitlement' }, 500);
  }

  return json({ ok: true });
});

/** Constant-time compare, so a wrong secret cannot be found byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
