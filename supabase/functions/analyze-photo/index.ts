// POST /functions/v1/analyze-photo
//
// Body: { image?: base64, description?: string }
// Returns: { meal_name, ingredients[], usage: { used, limit, tier } }
//
// Order of operations matters and is deliberate:
//   auth → entitlement → quota → image validation → model call → record usage
// Every cheap rejection happens before anything expensive, and nothing reaches
// Anthropic until the caller has been proven to be a signed-in user with
// allowance remaining.
import Anthropic from 'npm:@anthropic-ai/sdk@0.109.1';

import {
  checkQuota,
  CORS,
  getTier,
  json,
  recordUsage,
  modelFor,
  requireUser,
  userClient,
} from '../_shared/guard.ts';
import { isImageError, validateBase64Image } from '../_shared/image.ts';

const SYSTEM_PROMPT = `You are a nutrition assistant inside a meal-tracking app. The user describes a meal in words, sends a photo, or both. A photo is either (a) a plate/bowl of food, (b) a packaged product, or (c) a nutrition-facts label.

Your job: identify what was eaten and estimate nutrition as accurately as possible.

Rules:
- Break the meal into individual ingredients (e.g. "grilled chicken breast", "white rice", "olive oil").
- "grams" is your best estimate of the weight of that ingredient AS EATEN.
- calories/protein_g/carbs_g/fat_g/fiber_g/sugar_g/sodium_mg/potassium_mg/cholesterol_mg are the TOTALS for that ingredient's grams (NOT per 100g).
- For a nutrition label: use the label's numbers. If the user says how much they ate, scale to that; otherwise assume one serving.
- If the user gives portion info (e.g. "I ate half", "about 2 cups"), respect it.
- When both a photo and a description are given, the description overrides the photo wherever they disagree — the user knows what they ate.
- With a description and no photo, estimate typical portions for the foods named. Assume standard restaurant/home serving sizes unless told otherwise.
- Prefer realistic, slightly conservative estimates. Never invent foods that are not visible or described.
- If the image contains no food, no packaged product and no nutrition label, return an empty ingredients array and set meal_name to "No food found".
- meal_name: a short human name for the meal (e.g. "Chicken & rice bowl").`;

const INGREDIENT_FIELDS = [
  'name',
  'grams',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sugar_g',
  'sodium_mg',
  'potassium_mg',
  'cholesterol_mg',
] as const;

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    meal_name: { type: 'string' as const },
    ingredients: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: Object.fromEntries(
          INGREDIENT_FIELDS.map((f) => [f, { type: f === 'name' ? 'string' : 'number' }])
        ),
        required: [...INGREDIENT_FIELDS],
        additionalProperties: false,
      },
    },
  },
  required: ['meal_name', 'ingredients'],
  additionalProperties: false,
};

/** Cap the free-text field so it cannot be used to run up a token bill. */
const MAX_DESCRIPTION_CHARS = 2000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = userClient(req);
  const user = await requireUser(supabase);
  if (!user) return json({ error: 'Not signed in' }, 401);

  let body: { image?: unknown; description?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  const description =
    typeof body.description === 'string' ? body.description.trim().slice(0, MAX_DESCRIPTION_CHARS) : '';
  const hasImage = typeof body.image === 'string' && body.image.length > 0;

  if (!hasImage && !description) {
    return json({ error: 'Describe the meal or attach a photo (or both).' }, 400);
  }

  // A photo costs far more than text, so the two draw on separate allowances.
  const feature = hasImage ? 'photo_meal' : 'text_meal';

  const tier = await getTier(supabase, user.id);
  let quota;
  try {
    quota = await checkQuota(supabase, user.id, feature, tier);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  if (!quota.ok) {
    return json(
      { error: quota.reason, usage: { used: quota.used, limit: quota.limit, tier }, upgrade: tier === 'free' },
      429
    );
  }

  // Validate only after the caller has earned the right to spend our money.
  let image = null;
  if (hasImage) {
    const result = validateBase64Image(body.image);
    if (isImageError(result)) return json({ error: result.error }, 400);
    image = result;
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'AI is not configured.' }, 500);

  try {
    const anthropic = new Anthropic({ apiKey });

    const content: Anthropic.ContentBlockParam[] = [];
    if (image) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          // The SNIFFED type, not whatever the client claimed.
          media_type: image.mediaType,
          data: encodeBase64(image.bytes),
        },
      });
    }
    content.push({
      type: 'text',
      text: description
        ? `The user says: ${description}`
        : 'Analyze this photo and estimate the nutrition.',
    });

    const model = modelFor(feature, tier);
    const message = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: 'record_meal',
          description: 'Record the identified meal and its per-ingredient nutrition.',
          input_schema: OUTPUT_SCHEMA,
        },
      ],
      tool_choice: { type: 'tool', name: 'record_meal' },
      messages: [{ role: 'user', content }],
    });

    await recordUsage(
      supabase,
      user.id,
      feature,
      model,
      message.usage.input_tokens,
      message.usage.output_tokens
    );

    const toolUse = message.content.find((c) => c.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      return json({ error: 'The model did not return a usable result. Try again.' }, 502);
    }

    return json({
      ...(toolUse.input as Record<string, unknown>),
      usage: { used: quota.used + 1, limit: quota.limit, tier },
    });
  } catch (e) {
    // Never surface a provider error verbatim — it can carry key fragments,
    // account identifiers and internal URLs.
    console.error('analyze-photo failed', e);
    return json({ error: 'Could not analyze that right now. Please try again.' }, 502);
  }
});

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000; // avoid blowing the argument limit on big images
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
