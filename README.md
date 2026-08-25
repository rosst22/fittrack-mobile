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

## AI features and the paywall

The AI features run on **Supabase Edge Functions** (`supabase/`), not on the web
app — that keeps `~/meal-tracker` untouched and keeps every secret server-side.
See `supabase/README.md` for deployment.

| Feature | Free / day | Pro / day |
|---|---|---|
| Photo scan | 3 | 50 |
| AI meal estimate (text) | 5 | 100 |
| Coach messages | 10 | 200 |

Everything else — logging, workouts, trends, goals, the weekly review — is free
and unlimited.

**Purchases go through Apple's In-App Purchase**, because guideline 3.1.1
requires it for anything unlocking in-app features; Stripe would be a rejection.
RevenueCat handles receipt validation and calls our webhook, which is the only
thing that can write `entitlements`. The app never grants itself access, and
every AI call re-checks tier and quota server-side.

### Upload security

Photos are re-encoded on the device before upload, which caps their size and —
importantly for a health app — strips EXIF including GPS coordinates. Server
side, `supabase/functions/_shared/image.ts` ignores the client's declared MIME
type and sniffs the real one from magic bytes, caps dimensions to stop
decompression bombs, rejects SVG outright, and builds storage paths from the
user id plus a UUID so a crafted filename cannot escape the user's prefix.
15 tests cover those cases: `deno test supabase/functions/_shared/`.

## Not ported yet

- **USDA food search** — needs `USDA_API_KEY`, still web-only
- **WHOOP sync and sleep** — needs the OAuth client secret, still web-only

## Roadmap

1. ~~Auth + data layer~~ done
2. ~~Core screens~~ done
3. ~~AI coach, photo scanner, paywall, account deletion, legal docs~~ done
4. HealthKit read/write (needs a dev build; not available in Expo Go)
5. Push notifications
6. App Store Connect setup — subscription product, screenshots, privacy
   nutrition labels, demo account for review
7. Submit
