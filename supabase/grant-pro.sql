-- Give someone Pro for free.
--
-- Paste into the Supabase SQL Editor, change the email and the duration, run.
--
-- This writes the `promotional` entitlement source, which sits alongside
-- `app_store` and `stripe`. Because effective tier is "pro if ANY source is
-- active", a promotional grant works even if that person later subscribes and
-- cancels — the sources never overwrite each other.
--
-- Safe to re-run: it upserts on (user_id, source), so running it again just
-- extends the expiry rather than creating a duplicate.

-- ── Grant Pro for 1 year ─────────────────────────────────────────────────────
insert into entitlements (user_id, source, tier, status, product_id, store, expires_at, updated_at)
select
  id,
  'promotional',
  'pro',
  'active',
  'friends_and_family',
  'promotional',
  now() + interval '1 year',   -- change the duration here
  now()
from auth.users
where email = 'friend@example.com'  -- change this
on conflict (user_id, source) do update
  set tier       = excluded.tier,
      status     = excluded.status,
      expires_at = excluded.expires_at,
      updated_at = now();

-- ── Grant Pro forever ────────────────────────────────────────────────────────
-- Same as above with a null expiry. getTier() treats a null expires_at as
-- "never expires", so use this sparingly.
--
-- insert into entitlements (user_id, source, tier, status, product_id, store, expires_at, updated_at)
-- select id, 'promotional', 'pro', 'active', 'lifetime', 'promotional', null, now()
-- from auth.users where email = 'friend@example.com'
-- on conflict (user_id, source) do update
--   set tier = excluded.tier, status = excluded.status,
--       expires_at = excluded.expires_at, updated_at = now();

-- ── Revoke a promotional grant ───────────────────────────────────────────────
-- Deletes only the promotional row, so a real paid subscription is untouched.
--
-- delete from entitlements
-- where source = 'promotional'
--   and user_id = (select id from auth.users where email = 'friend@example.com');

-- ── Who currently has Pro, and from where ────────────────────────────────────
select u.email, e.source, e.tier, e.status, e.expires_at
from entitlements e
join auth.users u on u.id = e.user_id
where e.tier = 'pro'
order by e.source, u.email;
