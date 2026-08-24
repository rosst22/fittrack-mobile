# FitTrack iOS

Native iOS client for [FitTrack](https://fittrack.rosstoma.me), built with Expo
(React Native). Talks to the same Supabase project as the web app, so both
clients read and write the same rows.

**One-line résumé description:** Native iOS meal, workout, and health tracker in
React Native/Expo, sharing a Supabase Postgres backend with an existing Next.js
web app.

## Why a separate app rather than a wrapper

The web app is Next.js with server-side rendering, server actions, and API
routes. None of that can run on a phone, so there is no static bundle to drop
into a WebView. A wrapper pointing at the live site would also be rejected from
the App Store under guideline 4.2, and could never reach HealthKit. This is a
real client instead: it queries Supabase directly and reuses the web app's
domain logic verbatim.

## Running it

```bash
npm install
cp .env.example .env      # fill in the two Supabase values
npx expo start            # then scan the QR code with your iPhone camera
```

Env vars are inlined at bundle time — after editing `.env`, restart the dev
server. A reload is not enough.

You do **not** need Xcode for day-to-day work. It is needed only to produce a
binary, and even that can be done in the cloud with EAS Build.

## Architecture

```
src/
  app/            expo-router routes; folder structure is the URL structure
    (tabs)/       Today · Meals · Workouts · Trends · More
    meal/         new + [id] edit
    workout/      new + [id] edit
    exercise/     [name] — per-lift history and PRs
  components/     ui.tsx design system, forms, charts
  lib/
    supabase.ts   client; session in AsyncStorage, not cookies
    auth.tsx      session context + route guard
    queries.ts    every read/write in one place
    types.ts      row types mirrored from supabase/schema.sql
    day.ts        timezone-safe day bucketing  ← copied from the web app
    strength.ts   volume, 1RM, set formatting  ← copied
    weekReview.ts weekly goal evaluation       ← copied
    exercises.ts  MET calorie burn             ← copied
    micros.ts     micronutrient totals         ← copied
    profile.ts    Mifflin-St Jeor BMR          ← copied
```

### Shared code

Six files under `src/lib/` are byte-identical copies from `~/meal-tracker`.
They are pure TypeScript with no framework imports, which is why they port
unchanged. Their vitest suites came along too — **74 tests pass here**.

This is duplication, and it will drift. Extracting a shared `@fittrack/core`
package is the right fix, but it means restructuring the live web app, so it is
deliberately deferred rather than done halfway. Until then: a change to any of
these six files must be made in both repos.

## Security

- The Supabase **anon key ships in the app bundle**, by design. It is already
  public in the web bundle. It is an identifier, not a credential — every table
  has RLS enabled with policies scoped to `auth.uid()`, so without a valid
  session it returns nothing.
- The service role key, Anthropic key, WHOOP secret, and USDA key are **never**
  in this app. They stay on Vercel.
- `.env` is gitignored.

## Not ported yet

These need server-side secrets the phone must not hold, so they still live on
the web app:

- **AI coach / photo meal analysis** — needs `ANTHROPIC_API_KEY`
- **USDA food search** — needs `USDA_API_KEY`
- **WHOOP sync and sleep** — needs the OAuth client secret

Reaching them from mobile means teaching the existing Next.js API routes to
accept an `Authorization: Bearer <supabase access token>` header alongside the
cookie they use today. That is a small additive change to `~/meal-tracker`, not
done here because that repo was to be left alone.

## Roadmap

1. ~~Auth + data layer~~ done
2. ~~Core screens~~ done
3. Bearer-token auth on the web API routes → AI coach, USDA search, WHOOP
4. HealthKit read/write (needs a dev build; not available in Expo Go)
5. Push notifications
6. App Store compliance — account deletion, privacy policy, demo account for
   review, privacy nutrition labels
7. Submit
