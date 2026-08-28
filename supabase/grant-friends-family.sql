-- Friends & family: permanent free Pro.
--
-- Paste into the Supabase SQL Editor, edit the email list, run. Idempotent —
-- re-running just refreshes the rows, so keep adding to the list over time
-- rather than maintaining separate scripts.
--
-- WHY NOT A STRIPE COUPON
--
-- A 100%-off coupon only applies to Stripe checkouts, so it does nothing for
-- anyone on the iPhone app. It also creates a real $0 subscription, which can
-- be cancelled or lapse and silently revoke access.
--
-- This writes the `promotional` source instead, which sits alongside
-- `app_store` and `stripe`. Effective tier is "pro if ANY source is active", so
-- a promotional grant keeps working even if that person subscribes and later
-- cancels — the sources never overwrite each other. A null expires_at means it
-- never expires.
--
-- SCOPE: this covers every app reading THIS Supabase project — currently the
-- FitTrack web app and the iOS client. A future product on its own database
-- needs its own grant; entitlements here are per user, not per product.

-- ── 1. Who gets it ───────────────────────────────────────────────────────────
-- Add emails here. They must match the address the person signed up with.
with recipients(email) as (
  values
    ('ross.toma@gmail.com')
    -- , ('friend@example.com')
    -- , ('family@example.com')
)

-- ── 2. Grant ─────────────────────────────────────────────────────────────────
insert into entitlements (
  user_id, source, tier, status, product_id, store, expires_at, updated_at
)
select u.id, 'promotional', 'pro', 'active', 'friends_and_family', 'promotional',
       null,          -- null = never expires
       now()
from recipients r
join auth.users u on lower(u.email) = lower(r.email)
on conflict (user_id, source) do update
  set tier       = excluded.tier,
      status     = excluded.status,
      expires_at = excluded.expires_at,
      updated_at = now();

-- ── 3. Who did NOT get it, and why ───────────────────────────────────────────
-- Run this straight after. An email listed above that has not signed up yet
-- matches no row, so the insert silently skips it — this is the only way to
-- notice. Grant again once they have an account.
with recipients(email) as (
  values
    ('ross.toma@gmail.com')
    -- , ('friend@example.com')
)
select r.email as not_granted_no_account
from recipients r
left join auth.users u on lower(u.email) = lower(r.email)
where u.id is null;

-- ── 4. Confirm ───────────────────────────────────────────────────────────────
select u.email, e.source, e.tier, e.status,
       coalesce(e.expires_at::text, 'never') as expires
from entitlements e
join auth.users u on u.id = e.user_id
where e.tier = 'pro'
order by e.source, u.email;

-- ── Revoke one person ────────────────────────────────────────────────────────
-- Deletes only the promotional row, so a real paid subscription is untouched.
--
-- delete from entitlements
-- where source = 'promotional'
--   and user_id = (select id from auth.users where lower(email) = lower('friend@example.com'));
