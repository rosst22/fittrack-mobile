# Backend — migrations and Edge Functions

Everything here runs on Supabase. `~/meal-tracker` is not involved and is not
modified.

## 1. Run the migration

Paste `migrations/2026-08-24-entitlements-and-quotas.sql` into the **Supabase SQL
Editor** and run it. It is idempotent, so re-running is safe.

It creates `entitlements`, indexes `ai_usage` for the quota count, adds the
`ai_usage_today` view, adds `account_deletions`, and puts a size/type limit on
the `meal-photos` storage bucket.

## 2. Set the function secrets

```bash
supabase login                       # you do this, not an agent
supabase link --project-ref kzzjdbdzpqqznslkhiky

supabase secrets set ANTHROPIC_API_KEY=...
supabase secrets set REVENUECAT_WEBHOOK_SECRET=...   # any long random string
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_... # shown when you create the endpoint
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
automatically — do not set them by hand.

Generate the webhook secret with:

```bash
openssl rand -hex 32
```

## 3. Deploy

```bash
supabase functions deploy analyze-photo
supabase functions deploy coach-chat
supabase functions deploy delete-account

# The webhook is called by RevenueCat, which cannot present a Supabase user JWT.
# It authenticates with the shared secret instead — see the file header.
supabase functions deploy revenuecat-webhook --no-verify-jwt

# Same reasoning: Stripe authenticates with its own signature, not a JWT.
supabase functions deploy stripe-webhook --no-verify-jwt
```

## 4. Stripe (web subscriptions)

FitTrack is a multiplatform service, so guideline 3.1.3(b) allows honouring a
subscription bought on the web — as long as the same thing stays buyable via
IAP, which is why both paths exist.

1. Stripe → Product catalogue → create a recurring price
2. Payment links → create a link for it
3. Put the link in `.env` as `EXPO_PUBLIC_STRIPE_PAYMENT_LINK`. The app appends
   `?client_reference_id=<supabase user id>`, which is the **only** way the
   webhook can tell whose account to upgrade — a checkout without it is logged
   and ignored.
4. Developers → Webhooks → add endpoint
   `https://kzzjdbdzpqqznslkhiky.supabase.co/functions/v1/stripe-webhook`
   Events: `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `invoice.payment_failed`

## 5. Point RevenueCat at the webhook

RevenueCat → Project → Integrations → Webhooks:

- **URL** `https://kzzjdbdzpqqznslkhiky.supabase.co/functions/v1/revenuecat-webhook`
- **Authorization header** `Bearer <REVENUECAT_WEBHOOK_SECRET>`

## The functions

| Function | Auth | What it does |
|---|---|---|
| `analyze-photo` | User JWT | Photo/text → nutrition. Enforces tier, daily quota, spend cap, and image validation. |
| `coach-chat` | User JWT | Coach reply with today's totals as context. |
| `delete-account` | User JWT | Erases the caller's account. Service role. |
| `revenuecat-webhook` | Shared secret | Writes the `app_store` entitlement row. |
| `stripe-webhook` | Stripe signature | Writes the `stripe` entitlement row. |

## Why the paywall is enforced here and not in the app

`entitlements` has a **select-only** RLS policy and no write policy at all, so a
modified client cannot grant itself Pro. Every AI call re-reads the tier and
re-counts the day's usage server-side. The counters shown in the app are
cosmetic; a 429 from these functions is the real answer.

Expiry is enforced on **read** as well as on write, because a webhook can be
delayed or dropped and an `active` row with a past `expires_at` must not keep
working.

## Checks

```bash
cd supabase/functions
deno check analyze-photo/index.ts coach-chat/index.ts \
           delete-account/index.ts revenuecat-webhook/index.ts
deno test _shared/image.test.ts      # 15 upload-security tests
```
