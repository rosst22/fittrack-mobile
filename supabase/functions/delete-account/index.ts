// POST /functions/v1/delete-account
//
// Permanently deletes the caller's account and all their data. Required by App
// Store Review guideline 5.1.1(v): any app that lets you create an account must
// let you delete it from inside the app.
//
// Deleting a row in auth.users cascades to every table that references it, so
// most data goes automatically. Storage objects do NOT cascade — they live
// outside Postgres — so they are removed explicitly first.
//
// The caller is identified from their JWT, never from a body parameter. There
// is no "user_id" input on purpose: an endpoint running as the service role
// that accepts a target id is an account-deletion weapon one bug away from
// being pointed at anyone.
import { CORS, json, requireUser, serviceClient, userClient } from '../_shared/guard.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const asUser = userClient(req);
  const user = await requireUser(asUser);
  if (!user) return json({ error: 'Not signed in' }, 401);

  // Require the client to spell out what it is doing. This is a deliberate
  // speed bump against a mis-wired button, not a security control — the real
  // confirmation is the two-step prompt in the app.
  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }
  if (body.confirm !== 'DELETE') {
    return json({ error: 'Deletion not confirmed.' }, 400);
  }

  const admin = serviceClient();
  const userId = user.id;

  try {
    // 1. Storage objects. Listed and removed under the user's own prefix only.
    const { data: files } = await admin.storage.from('meal-photos').list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      await admin.storage
        .from('meal-photos')
        .remove(files.map((f) => `${userId}/${f.name}`));
    }

    // 2. Tombstone, written BEFORE the delete so a failure mid-way is still
    //    traceable. Hashed, so it cannot be used to reconstruct who this was.
    const emailHash = await sha256Hex((user.email ?? '').toLowerCase());
    await admin.from('account_deletions').insert({ email_sha256: emailHash });

    // 3. The user row. Everything referencing auth.users(id) with
    //    "on delete cascade" goes with it: profiles, goals, meals (and their
    //    ingredients), workouts (exercises, sets), water, habits, supplements,
    //    whoop_connections, ai_usage, food_library, entitlements.
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return json({ ok: true });
  } catch (e) {
    console.error('delete-account failed', e);
    return json({ error: 'Could not delete the account. Please contact support.' }, 500);
  }
});

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
