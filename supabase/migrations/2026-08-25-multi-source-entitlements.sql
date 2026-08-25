-- Adds Stripe (web) as a second purchase source alongside Apple IAP.
-- Run after 2026-08-24-entitlements-and-quotas.sql. Idempotent.
--
-- WHY THIS RESTRUCTURE
--
-- The original entitlements table had user_id as the primary key: one row per
-- user. That silently breaks with two sources. If someone subscribes on the web
-- via Stripe and has an old expired App Store subscription, the RevenueCat
-- EXPIRATION webhook would overwrite the single row with tier='free' and revoke
-- access they are actively paying for.
--
-- So entitlement is now recorded per (user_id, source), and the effective tier
-- is "pro if ANY source is currently active". Each webhook only ever touches
-- its own row and cannot revoke the other's.

-- 1. Widen the store/source vocabulary and re-key the table.
alter table entitlements
  add column if not exists source text not null default 'app_store';

-- Backfill source from the old `store` column where it was set.
update entitlements
set source = coalesce(nullif(store, ''), 'app_store')
where source = 'app_store' and store is not null;

alter table entitlements
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists cancel_at_period_end boolean not null default false;

-- Swap the primary key from (user_id) to (user_id, source).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'entitlements_pkey'
      and conrelid = 'entitlements'::regclass
      and array_length(conkey, 1) = 1
  ) then
    alter table entitlements drop constraint entitlements_pkey;
    alter table entitlements add primary key (user_id, source);
  end if;
end $$;

create index if not exists entitlements_stripe_customer_idx
  on entitlements(stripe_customer_id);
create index if not exists entitlements_stripe_sub_idx
  on entitlements(stripe_subscription_id);

-- 2. Effective tier across every source.
--
-- Also enforces expiry on READ: an 'active' row whose expires_at has passed is
-- not pro. Webhooks get delayed and dropped, and access must not outlive the
-- period just because a notification went missing.
create or replace view effective_entitlement
with (security_invoker = true) as
  select
    user_id,
    case
      when bool_or(
        tier = 'pro'
        and status in ('active', 'billing_retry')
        and (expires_at is null or expires_at > now())
      ) then 'pro'
      else 'free'
    end as tier,
    max(expires_at) filter (
      where tier = 'pro' and status in ('active', 'billing_retry')
    ) as expires_at,
    -- Which source is currently paying, for the account screen.
    (array_agg(source order by expires_at desc nulls last) filter (
      where tier = 'pro'
        and status in ('active', 'billing_retry')
        and (expires_at is null or expires_at > now())
    ))[1] as active_source
  from entitlements
  group by user_id;

-- 3. The select-only policy still applies. Re-assert it, because the table was
--    re-keyed above and this is the security boundary for the whole paywall:
--    there is deliberately NO insert/update/delete policy, so only the service
--    role (i.e. the webhooks) can grant Pro. Do not add one.
drop policy if exists "read own entitlement" on entitlements;
create policy "read own entitlement"
  on entitlements for select
  using (auth.uid() = user_id);
