// POST /functions/v1/coach-chat
//
// Body: { messages: [{ role: 'user'|'assistant', content: string }] }
// Returns: { reply, usage: { used, limit, tier } }
//
// The coach sees today's meals, workouts and goals so it can answer "how am I
// doing" without the user restating it. That context is fetched server-side
// through the caller's own JWT, so RLS decides what it can see — the client
// cannot inject someone else's data into the prompt by sending it along.
import Anthropic from 'npm:@anthropic-ai/sdk@0.109.1';

import {
  checkQuota,
  CORS,
  modelFor,
  getTier,
  json,
  recordUsage,
  requireUser,
  userClient,
} from '../_shared/guard.ts';

const SYSTEM_PROMPT = `You are the FitTrack coach — a concise, practical nutrition and training assistant inside the user's own tracking app.

You are given the user's logged data for today. Use it. Be specific and numerate: reference their actual calories, protein, workouts and goals rather than giving generic advice.

Rules:
- Be brief. Two or three short paragraphs at most, or a short list.
- If they are short on a goal, say by how much and suggest something concrete they could eat or do.
- Never invent data you were not given. If something was not logged, say so.
- You are not a doctor. For anything medical — symptoms, medication, injury, disordered eating — say plainly that it needs a professional, and do not offer a diagnosis or a treatment plan.`;

// Capped at 8: the whole history is re-sent on every turn, so a long thread
// makes one "message" cost many times a short one. 20 turns of 4000 chars was
// ~20k input tokens per call — an order of magnitude above the typical case.
const MAX_MESSAGES = 8;
const MAX_CHARS_PER_MESSAGE = 4000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = userClient(req);
  const user = await requireUser(supabase);
  if (!user) return json({ error: 'Not signed in' }, 401);

  let body: { messages?: unknown; timeZone?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const messages = sanitizeMessages(body.messages);
  if (messages.length === 0) return json({ error: 'Say something to the coach.' }, 400);

  // The caller's zone decides which rows count as "today". The client resolves
  // it from the device (src/lib/day.ts), so a user in California asking "how am
  // I doing today?" gets their day, not Toronto's. Validated rather than
  // trusted: an unknown zone makes Intl throw, and a RangeError here would 500
  // the whole request.
  const timeZone = validTimeZone(body.timeZone);

  const tier = await getTier(supabase, user.id);
  let quota;
  try {
    quota = await checkQuota(supabase, user.id, 'coach_chat', tier);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (!quota.ok) {
    return json(
      { error: quota.reason, usage: { used: quota.used, limit: quota.limit, tier }, upgrade: tier === 'free' },
      429
    );
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'AI is not configured.' }, 500);

  try {
    const context = await buildContext(supabase, timeZone);
    const anthropic = new Anthropic({ apiKey });

    const model = modelFor('coach_chat', tier);
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1000,
      system: `${SYSTEM_PROMPT}\n\nToday's logged data:\n${context}`,
      messages,
    });

    await recordUsage(
      supabase,
      user.id,
      'coach_chat',
      model,
      message.usage.input_tokens,
      message.usage.output_tokens
    );

    const reply = message.content
      .filter((c): c is Anthropic.TextBlock => c.type === 'text')
      .map((c) => c.text)
      .join('\n')
      .trim();

    return json({
      reply: reply || 'Sorry, I did not have a reply for that.',
      usage: { used: quota.used + 1, limit: quota.limit, tier },
    });
  } catch (e) {
    console.error('coach-chat failed', e);
    return json({ error: 'The coach is unavailable right now. Please try again.' }, 502);
  }
});

/**
 * Only user/assistant turns with string content survive, capped in both count
 * and length. Without this a client could send 500 messages and turn one
 * "chat" into an enormous bill that still counts as a single quota unit.
 */
function sanitizeMessages(input: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (m): m is { role: string; content: string } =>
        !!m &&
        typeof m === 'object' &&
        typeof (m as { content?: unknown }).content === 'string' &&
        ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'assistant')
    )
    .slice(-MAX_MESSAGES)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content.slice(0, MAX_CHARS_PER_MESSAGE),
    }))
    .filter((m) => m.content.trim().length > 0);
}

/**
 * A caller-supplied IANA zone, or the default when it is missing or bogus.
 *
 * Intl throws a RangeError on an unknown zone, so this has to be a try/catch —
 * and it has to happen before any query, or a client sending "Mars/Olympus"
 * takes the whole request down with a 500.
 */
function validTimeZone(input: unknown): string {
  if (typeof input === 'string' && input.includes('/')) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: input }).format(new Date());
      return input;
    } catch {
      // Not a zone this runtime knows; fall through.
    }
  }
  return DEFAULT_TZ;
}

const DEFAULT_TZ = 'America/Toronto';

/** Today's totals, as plain text for the system prompt. */
async function buildContext(
  supabase: ReturnType<typeof userClient>,
  timeZone: string
): Promise<string> {
  // Day boundary in the caller's zone, matching src/lib/day.ts on the client.
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const start = new Date(`${parts}T00:00:00`);
  const startIso = new Date(start.getTime() - tzOffsetMs(start, timeZone)).toISOString();

  const [meals, workouts, goals] = await Promise.all([
    supabase
      .from('meals')
      .select('name, eaten_at, meal_ingredients (name, weight_g, calories, protein_g, carbs_g, fat_g)')
      .gte('eaten_at', startIso),
    supabase.from('workouts').select('name, workout_exercises (name, calories)').gte('performed_at', startIso),
    supabase.from('goals').select('*').maybeSingle(),
  ]);

  const mealRows = (meals.data ?? []) as {
    name: string;
    meal_ingredients: { calories: number; protein_g: number; carbs_g: number; fat_g: number }[];
  }[];

  let cal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const m of mealRows) {
    for (const i of m.meal_ingredients ?? []) {
      cal += Number(i.calories) || 0;
      protein += Number(i.protein_g) || 0;
      carbs += Number(i.carbs_g) || 0;
      fat += Number(i.fat_g) || 0;
    }
  }

  const workoutRows = (workouts.data ?? []) as {
    name: string;
    workout_exercises: { calories: number }[];
  }[];
  const burned = workoutRows.reduce(
    (n, w) => n + (w.workout_exercises ?? []).reduce((m, e) => m + (Number(e.calories) || 0), 0),
    0
  );

  const g = goals.data as Record<string, number | null> | null;

  return [
    `Meals logged: ${mealRows.length}${mealRows.length ? ` (${mealRows.map((m) => m.name).join(', ')})` : ''}`,
    `Calories eaten: ${Math.round(cal)}`,
    `Protein: ${Math.round(protein)}g, Carbs: ${Math.round(carbs)}g, Fat: ${Math.round(fat)}g`,
    `Workouts: ${workoutRows.length}${workoutRows.length ? ` (${workoutRows.map((w) => w.name).join(', ')})` : ''}`,
    `Calories burned: ${Math.round(burned)}`,
    g
      ? `Goals — calories: ${g.calorie_target ?? 'none'}, protein: ${g.protein_target_g ?? 'none'}g, water: ${g.water_target_oz ?? 'none'}oz, workouts/week: ${g.workouts_per_week ?? 'none'}`
      : 'Goals: none set',
  ].join('\n');
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  return asUtc - date.getTime();
}
