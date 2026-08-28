# Launch checklist

What is done, and what is left before FitTrack.AI can go on the App Store. Ordered
by what blocks what.

---

## Done

- [x] Native app — 20 screens, all tracking features
- [x] Email/password auth, session persisted across launches
- [x] AI photo scanner, text estimates, coach — on Edge Functions
- [x] Paywall with per-tier daily quotas, enforced server-side
- [x] Upload hardening + 15 security tests
- [x] In-app account deletion (guideline 5.1.1(v))
- [x] Privacy policy and terms, in-app and in `legal/`
- [x] Permission strings for camera and photo library
- [x] `ITSAppUsesNonExemptEncryption: false` (skips the export-compliance prompt)

---

## Yours — nothing proceeds without these

### 1. Apple Developer Program — $99/yr

Enrol at <https://developer.apple.com/programs/>. Takes 24–48h.

Individual enrolment publishes **your legal name** as the seller. An
organisation listing needs a D-U-N-S number and a registered company.

### 2. Paid Apps Agreement

App Store Connect → Business. Accept the agreement and add **bank details and
tax forms**. Subscriptions cannot go live until this is complete, and it is
routinely the thing that delays launches by weeks.

### 3. Host the privacy policy at a public URL

App Store Connect requires a reachable URL, and so does HealthKit
(guideline 5.1.3). `legal/privacy-policy.md` is ready to publish — you already
have `rosstoma.me`, so something like `rosstoma.me/fittrack/privacy` works.

### 4. Run the migration

Paste `supabase/migrations/2026-08-24-entitlements-and-quotas.sql` into the
Supabase SQL Editor.

### 5. Set secrets and deploy the functions

See `supabase/README.md`. You need `ANTHROPIC_API_KEY` and a
`REVENUECAT_WEBHOOK_SECRET`.

### 6. RevenueCat

1. Create a project, add the iOS app with bundle id `me.rosstoma.fittrack`
2. In App Store Connect, create an **auto-renewable subscription** product
3. In RevenueCat, create entitlement `pro` and attach the product to the
   **default offering**
4. Copy the Apple API key into `.env` as `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
5. Point the webhook at the deployed function with the shared secret

---

## Then — build and submit

### Decide on pricing

Nothing here assumes a price. Worth knowing: Apple takes **30%**, dropping to
15% after a subscriber's first year, or 15% from day one if you earn under
$1M/yr via the Small Business Program (worth applying for).

Sanity-check the unit economics before setting a number. A Pro user doing 50
photo scans a day is a real Anthropic cost — the $3/day spend cap in
`guard.ts` is what stops that being unbounded, and it is deliberately lower
than 50 scans would actually cost. Model the price against the cap, not against
the call count.

### Build

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios --profile production
```

EAS builds in the cloud, so the missing local CocoaPods and iOS simulator
runtime do not matter.

### App Store Connect listing

- [ ] Screenshots — 6.7" and 6.5" required
- [ ] Description, keywords, support URL, privacy policy URL
- [ ] **Privacy nutrition labels.** Declare: email (account), health & fitness
      data (app functionality), purchases (app functionality). Do **not**
      declare tracking — the app has none.
- [ ] **Demo account for review.** Every screen is auth-gated, so review will
      fail without working credentials in the notes. Create a throwaway account
      with a few meals and workouts already logged.
- [ ] Age rating

### Review notes — write these

Reviewers reject what they cannot understand. Say plainly:

> FitTrack.AI is a personal meal and workout tracker. Tracking is free. The
> subscription raises daily limits on AI features (photo nutrition scanning and
> a coach), which cost per call to run. Demo account: <email> / <password>.
> Account deletion is at More → Account → Delete account.

---

## Known gaps

| Gap | Why it matters |
|---|---|
| Not run on a device yet | Bundling is not running. Test on your iPhone before building. |
| IAP untestable in Expo Go | Needs a dev build plus a sandbox tester account. |
| No password reset in-app | The web app has one; mobile does not. Reviewers do not require it, but users will want it. |
| USDA search and WHOOP still web-only | Both need server secrets; not ported. |
| Six lib files duplicated from the web app | Will drift. See README. |
| HealthKit not built | You asked for it. It needs a dev build and adds guideline 5.1.3 obligations. Not started. |
