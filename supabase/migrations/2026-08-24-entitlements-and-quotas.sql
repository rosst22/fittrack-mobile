-- FitTrack iOS: subscription entitlements, AI quotas, and account deletion.
-- Run this in the Supabase SQL Editor. It is idempotent.

-- ---------------------------------------------------------------- entitlements
--
-- Who is allowed to use the paid AI features. Written ONLY by the RevenueCat
-- webhook running as the service role — never by the app.
--
-- The RLS policy below is the security boundary for the whole paywall: the
-- client may read its own entitlement but has no insert/update/delete policy at
-- all, so a tampered app cannot grant itself `pro`. Do not add a write policy
-- here "for convenience".
create table if not exists entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free',          -- 'free' | 'pro'
  status text not null default 'inactive',    -- 'active' | 'expired' | 'billing_retry' | 'inactive'
  product_id text,
  store text,                                 -- 'app_store' | 'play_store' | 'promotional'
  expires_at timestamptz,
  revenuecat_customer_id text,
  updated_at timestamptz not null default now()
);

alter table entitlements enable row level security;

drop policy if exists "read own entitlement" on entitlements;
create policy "read own entitlement"
  on entitlements for select
  using (auth.uid() = user_id);

create index if not exists entitlements_rc_customer_idx
  on entitlements(revenuecat_customer_id);

-- ---------------------------------------------------------------- ai_usage
--
-- Already exists. Add the index the per-day quota count needs; without it every
-- AI call does a sequential scan of the user's whole usage history.
create index if not exists ai_usage_user_feature_created_idx
  on ai_usage(user_id, feature, created_at desc);

-- ---------------------------------------------------------------- quota view
--
-- Lets the app show "2 of 3 scans left today" without granting it the ability
-- to decide anything. The Edge Function re-counts server-side before every
-- call; this is display only.
--
-- security_invoker makes the view run as the caller, so ai_usage's RLS still
-- applies and a user only ever sees their own counts.
create or replace view ai_usage_today
with (security_invoker = true) as
  select
    user_id,
    feature,
    count(*)::int as calls,
    coalesce(sum(cost_usd), 0)::numeric as cost_usd
  from ai_usage
  where created_at >= date_trunc('day', now() at time zone 'utc')
  group by user_id, feature;

-- ---------------------------------------------------------------- deletion audit
--
-- App Store guideline 5.1.1(v) requires in-app account deletion. Keep a
-- tombstone so a support question ("did my delete actually run?") is
-- answerable. Deliberately holds NO personal data beyond a hashed email —
-- keeping the plaintext address of someone who asked to be deleted defeats the
-- point.
create table if not exists account_deletions (
  id uuid primary key default gen_random_uuid(),
  email_sha256 text not null,
  deleted_at timestamptz not null default now()
);

alter table account_deletions enable row level security;
-- No policies: service role only. Nobody reads this from a client.

-- ---------------------------------------------------------------- storage
--
-- Cap uploads and restrict types at the bucket level, so a client that skips
-- the Edge Function still cannot push a 2GB file or an SVG into storage.
-- 8 MiB is comfortably above a full-resolution iPhone JPEG.
update storage.buckets
set
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
where id = 'meal-photos';
