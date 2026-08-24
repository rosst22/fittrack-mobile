# AGENTS.md — FitTrack iOS

## Expo has changed

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
writing any code. Two things that bite:

- **SDK 56+ forbids importing from `@react-navigation/*` in app code.** Import
  `Stack`, `Tabs`, `ThemeProvider`, `DarkTheme` etc. from `expo-router` instead.
- Routes live in `src/app/`, not `app/`.

## Ground rules

- **Never touch `~/meal-tracker`.** It is the live web app in daily use. If a
  change there is genuinely required, propose it and stop.
- **No secrets in this bundle.** Only `EXPO_PUBLIC_SUPABASE_URL` and
  `EXPO_PUBLIC_SUPABASE_ANON_KEY` belong in `.env`. Anything that can bypass RLS
  or spend money stays on Vercel. Ross handles all credentials himself — never
  paste or enter them.
- **Never add `.eq('user_id', …)` to a query.** RLS does that server-side.
  Doing it in the client implies the client is what enforces it, which is wrong
  and would be dangerous if someone later removed a policy.

## Timezone rule — this bug has shipped three times

Never bucket a day with `new Date(iso).toLocaleDateString()`, and never format a
time without a `timeZone`. Use the helpers in `src/lib/day.ts`
(`todayStr`, `dayKey`, `dayRange`, `timeLabel`, `dateTimeLabel`, `prettyDate`).
**Grep for `toLocale` before shipping any timestamp UI.**

`src/app/(tabs)/more.tsx` renders a visible warning if Hermes turns out to
ignore `Intl`'s `timeZone` option. Do not delete it.

## Shared files — edit in both repos

These six are byte-identical copies from `~/meal-tracker/src/lib/`:

    day.ts   strength.ts   weekReview.ts   exercises.ts   micros.ts   profile.ts

A change to any of them must be mirrored in the web app, or the two clients will
disagree about the same data. Their tests came along; keep them passing.

## Schema

Row types in `src/lib/types.ts` are hand-mirrored from
`~/meal-tracker/supabase/schema.sql`. If the schema changes, update them.

Two shapes that are easy to get wrong:

- `meal_ingredients.micronutrients` is keyed by **display label** with
  `{ amount, unit }` values — `{"Fiber": {"amount": 3, "unit": "g"}}` — not flat
  `fiber_g` numbers. Read it through `addMicros()` in `micros.ts`.
- `food_library` macros are **per 100 g**. `meal_ingredients` macros are totals
  for the logged weight. Scale when moving between them.

Schema changes do not auto-apply. Write the SQL and hand it to Ross to paste
into the Supabase SQL Editor.

## Checks before saying something works

```bash
npx tsc --noEmit                 # types
npx vitest run                   # 74 domain tests
npx expo export --platform ios   # catches runtime import errors
```

Bundling is not the same as running. The app is auth-gated, so an agent cannot
visually verify screens without Ross logged in — say so plainly rather than
implying a screen was seen.
