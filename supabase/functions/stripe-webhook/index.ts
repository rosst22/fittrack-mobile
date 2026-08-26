// POST /functions/v1/stripe-webhook
//
// Grants and revokes the `stripe` entitlement source. Together with
// revenuecat-webhook these are the only writers of `entitlements`; the app
// cannot grant itself Pro.
//
// Deploy with --no-verify-jwt: Stripe cannot present a Supabase user JWT. The
// Stripe signature below is what authenticates the caller instead, so that
// check must never be skipped. An unverified webhook endpoint that grants paid
// access is a free-subscription generator for anyone who finds the URL.
//
// Configure at Stripe → Developers → Webhooks:
//   URL: https://<ref>.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed, customer.subscription.updated,
//           customer.subscription.deleted, invoice.payment_failed
import Stripe from 'npm:stripe@19.2.0';

import { json, serviceClient } from '../_shared/guard.ts';

const SOURCE = 'stripe';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secretKey || !webhookSecret) {
    console.error('Stripe env not configured — refusing all webhooks');
    return json({ error: 'Not configured' }, 500);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return json({ error: 'Missing signature' }, 400);

  const stripe = new Stripe(secretKey, { apiVersion: '2025-10-29.clover' });

  // The RAW body is required — parsing it first would change the bytes the
  // signature was computed over and every verification would fail.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, webhookSecret);
  } catch (e) {
    console.error('Stripe signature verification failed', (e as Error).message);
    return json({ error: 'Invalid signature' }, 400);
  }

  const admin = serviceClient();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // The Payment Link carries ?client_reference_id=<supabase user id>.
        // Without it we cannot know who paid, and must not guess.
        const userId = session.client_reference_id;
        if (!isUuid(userId)) {
          console.error('checkout.session.completed without a usable client_reference_id');
          // 200 so Stripe stops retrying — retrying cannot fix a missing id.
          return json({ ok: true, ignored: 'no client_reference_id' });
        }
        if (session.mode !== 'subscription' || !session.subscription) {
          return json({ ok: true, ignored: 'not a subscription' });
        }

        const subscription = await stripe.subscriptions.retrieve(
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id
        );

        await upsert(admin, userId, subscription, session.customer);
        return json({ ok: true });
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        // Later events carry no client_reference_id, so the row is found by the
        // subscription id recorded at checkout.
        const { data: existing } = await admin
          .from('entitlements')
          .select('user_id')
          .eq('stripe_subscription_id', subscription.id)
          .maybeSingle();

        if (!existing) {
          console.error('No entitlement row for subscription', subscription.id);
          return json({ ok: true, ignored: 'unknown subscription' });
        }

        await upsert(admin, existing.user_id, subscription, subscription.customer);
        return json({ ok: true });
      }

      default:
        // Acknowledge everything else; a non-2xx makes Stripe retry forever.
        return json({ ok: true, ignored: event.type });
    }
  } catch (e) {
    console.error('stripe-webhook failed', e);
    // 5xx so Stripe retries — a dropped grant means someone paid and did not
    // get access.
    return json({ error: 'Webhook processing failed' }, 500);
  }
});

/**
 * Maps a Stripe subscription onto our row.
 *
 * 'active' and 'trialing' grant access. 'past_due' maps to billing_retry, which
 * getTier still honours, because Stripe retries a failed card for days and
 * cutting a paying customer off on the first failure is both wrong and a
 * support ticket. Everything else revokes.
 */
async function upsert(
  admin: ReturnType<typeof serviceClient>,
  userId: string,
  subscription: Stripe.Subscription,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null
) {
  const granting = subscription.status === 'active' || subscription.status === 'trialing';
  const retrying = subscription.status === 'past_due';

  const periodEnd = subscription.items.data[0]?.current_period_end;

  const { error } = await admin.from('entitlements').upsert(
    {
      user_id: userId,
      source: SOURCE,
      tier: granting || retrying ? 'pro' : 'free',
      status: granting ? 'active' : retrying ? 'billing_retry' : 'expired',
      product_id: subscription.items.data[0]?.price?.id ?? null,
      store: SOURCE,
      expires_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      stripe_customer_id: typeof customer === 'string' ? customer : (customer?.id ?? null),
      stripe_subscription_id: subscription.id,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,source' }
  );

  if (error) throw new Error(error.message);
}

function isUuid(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  );
}
