# Launch

**Version 1.0, build 1, was submitted to App Store review on 2 September 2026
and is `WAITING_FOR_REVIEW`.**

This file used to be a to-do list. It is now mostly a record of how the build
actually got out, because the signing problem cost days and the cause was not
what it appeared to be.

---

## How to ship a build

```bash
export ASC_KEY_ID=B2CR27W8CZ
export ASC_ISSUER_ID=e3f9352e-5282-478c-a98f-e9cf19f88f8b
export ASC_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_B2CR27W8CZ.p8
./scripts/appstore/release.sh
```

That archives, exports, validates and uploads. 15–20 minutes. Then attach the
build to the version and submit — the App Store Connect UI, or the API.

**Right before submitting, re-run `supabase/seed-demo-account.sql`.** Its
timestamps are absolute, so the "today" data ages out and the reviewer opens
the app to an empty Today tab.

### The `.p8` cannot be replaced

`~/.appstoreconnect/private_keys/AuthKey_B2CR27W8CZ.p8` is downloadable exactly
once, ever. Apple will not reissue it. **Back it up.** Losing it means
re-enabling API access and generating a new key.

---

## The signing wall, and what it actually was

Distribution signing failed for days. Both real causes were invisible from the
error messages:

**1. The account had no App Store Connect API access at all.** Not a lost key —
the API had never been enabled on the account. `Users and Access → Integrations`
showed a "Request Access" button rather than a key list. Every
`xcodebuild -exportArchive -allowProvisioningUpdates` failed with **"No
Accounts"** because there genuinely was no credential for the CLI to find.

**2. `release.sh` exported with `teamID = 63CJB3ZZYF`.** That is the
parenthesised value in the signing certificate's Common Name:

```
CN = Apple Development: ross.toma@icloud.com (63CJB3ZZYF), OU = FMQ2H9F8WV
                                              ^personal          ^enrolled team
```

It looks like a team id and is not one — it is the **personal team**. The
enrolled team is the certificate's **OU**, `FMQ2H9F8WV`. Exporting under the
personal team is what produced *Team "Ross Toma (Personal Team)" is not
enrolled* in Xcode's Organizer.

### What was never the problem

- **The archives.** They always carried `Team = FMQ2H9F8WV` and
  `TeamIdentifier = FMQ2H9F8WV`. Rebuilding them changed nothing.
- **The portal's "Distribution Managed" certificate.** Apple holds its private
  key, which looked like the blocker. It is not: with an API key present,
  Xcode **cloud-signs** server-side. After a successful upload the keychain
  still contains no distribution certificate and there are zero provisioning
  profiles on disk. Do not go hunting for a local cert — its absence is normal.

---

## Gotchas that will bite the next release

**Build numbers.** `expo prebuild` writes a literal `<string>1</string>` for
`CFBundleVersion` rather than `$(CURRENT_PROJECT_VERSION)`, so passing
`CURRENT_PROJECT_VERSION` to `xcodebuild` is silently ignored — build 1 uploaded
despite the script computing `202609012354`. Apple accepts that once and rejects
every later upload that does not increment. `release.sh` now sets it with
PlistBuddy on each run; because `ios/` is gitignored and regenerated, this has
to live in the script, not in the generated plist.

**The demo account is the whole review.** Every screen is auth-gated. If
`App Review Information` has no username and password, the reviewer sees a login
wall and rejects under 2.1. This was blank right up until submission.

**Testing account deletion destroys the demo account.** Reviewers do test
5.1.1(v). The review notes now tell them sign-up is open and immediate so they
can make a fresh account — which only works because the signup redirect bug was
fixed (`184b1f8`).

**`rsync --delete` and the legal pages.** `~/rosstoma.me/deploy.sh` deletes what
is not in the repo. `/fittrack/privacy` and `/fittrack/terms` — the URLs the
listing points at — lived only on the VPS for a while. They are committed to the
`rosstoma.me` repo now; keep them there.

---

## Deliberately not done

**In-app purchase.** `EXPO_PUBLIC_REVENUECAT_IOS_KEY` is blank, so
`showProUpsell()` is false and every Pro entry point is hidden. 1.0 ships as a
free app that sells nothing, which is the simplest thing to get through review.
The terms say so explicitly.

To turn it on later: create the subscription product in App Store Connect,
create the RevenueCat project and `pro` entitlement, set the key, **deploy
`revenuecat-webhook` (it is not deployed) with `--no-verify-jwt` and a
`REVENUECAT_WEBHOOK_SECRET`**, and rebuild. Note that guideline 3.1.1 forbids
linking to an external purchase mechanism from inside the app — the Stripe
"subscribe on the web" button was removed for exactly this reason and must not
come back.

**HealthKit.** Not started. Adds guideline 5.1.3 obligations.

**USDA food search and WHOOP sync.** Still web-only; both need OAuth secrets
that cannot live on a phone.
