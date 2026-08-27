# App Store listing — ready to paste

Everything App Store Connect asks for, written out. None of it can be entered
until Apple Developer enrolment is approved.

---

## ⚠️ Read this before you commit to the name

**"FitTrack" is an existing company** — fittrack.com sells smart body-composition
scales and has a fitness app. Two separate problems:

1. **Apple requires unique app names.** If theirs is on the App Store, yours is
   rejected outright and you pick a new one at the worst possible moment.
2. **Trademark.** Shipping a fitness app under an established fitness brand's
   name invites a takedown, and Apple removes apps on a rights-holder complaint
   without much argument.

**Check first:** search the App Store for "FitTrack" on your phone, right now,
before anything else. It takes ten seconds and it determines whether the rest of
this document needs rewriting.

If it's taken, the app name is the only thing that has to change — your bundle ID
(`me.rosstoma.fittrack`) is internal, never shown to users, and is fine either
way. Alternatives that are short, unclaimed-sounding, and say what it does:

- **Plateful** · **MacroSnap** · **Nutrilog** · **Forkcast** · **Lift & Plate**

The display name lives in one line of `app.json` (`expo.name`) and takes a
rebuild. Nothing else is affected.

---

## App Name
*30 characters max. Shown under the icon.*

```
FitTrack: Meal & Lift Log
```
*(25 chars — swap "FitTrack" if the name is taken)*

## Subtitle
*30 characters max. Appears under the name in search results.*

```
Snap a meal, log your lifts
```
*(27 chars)*

## Promotional Text
*170 characters. Updatable any time WITHOUT a review — use it for announcements.*

```
Point your camera at any meal and get the macros in seconds. Per-set strength logging, 14-day trends, and a coach that actually reads your data.
```
*(146 chars)*

## Keywords
*100 characters, comma-separated, no spaces after commas. Do NOT repeat words
already in your name or subtitle — Apple indexes those separately and repeats
waste space.*

```
calorie,macro,nutrition,food,diet,gym,workout,strength,protein,tracker,fitness,weight,ai,scanner
```
*(95 chars)*

## Category

- **Primary:** Health & Fitness
- **Secondary:** Food & Drink

## Description
*4000 characters max. Only the first ~3 lines show before "more" — front-load.*

```
Track what you eat and what you lift, without the tedium.

Point your camera at a plate of food or a nutrition label, and FitTrack fills in
the ingredients and macros for you. No searching a database for "grilled chicken
breast" and guessing the portion.

MEALS
• Scan a photo and get per-ingredient weights, calories, protein, carbs and fat
• Or describe a meal in words and skip the camera entirely
• Every ingredient you log saves to a personal library, so the second time is one tap
• Re-log any past meal in a single tap
• Fiber, sodium, potassium and cholesterol tracked alongside the big four

WORKOUTS
• Per-set logging — 135x10, 155x8, 175x5 is recorded exactly as it happened,
  not flattened into one average
• Tap any lift for all-time bests, estimated 1RM, and session-volume charts
• Calorie burn calculated from your bodyweight and the exercise type
• Autocomplete from your own history, with last session's numbers to beat

SEE THE PATTERN
• 14-day charts: calories in versus out, all three macros, training volume, sleep
• Weekly review with a Monday-to-Sunday goal grid and a hit-rate percentage
• Daily net calories against your estimated maintenance

EVERY DAY
• Water, habits and supplements, checked off in one place
• Calorie, macro and water targets you set yourself
• BMR and maintenance estimated from your height, weight, age and sex

WHAT'S FREE
Everything above. Logging, workouts, trends, goals and the weekly review are
free and unlimited, forever.

FITTRACK PRO
The AI features cost real money to run, so they carry daily limits:
• Free: 3 photo scans, 3 text estimates, 1 coach message per day
• Pro: 15 photo scans, 30 text estimates, 15 coach messages per day

YOUR DATA
FitTrack does not track you. There is no advertising SDK and no analytics SDK.
Your data is yours, scoped to your account at the database level, and you can
delete your account and everything in it from inside the app at any time.
Meal photos are resized on your phone before upload, which removes the location
data iPhones embed in photos by default.

FitTrack is a tracking tool, not a medical device. Calorie and macro figures are
estimates and can be wrong. Talk to a qualified professional before making
significant changes to your diet or training.
```

## Support URL
```
https://rosstoma.me/fittrack/privacy
```
*Replace with a real support page if you build one. Apple accepts a page with a
working contact method — the privacy policy lists support@rosstoma.me, which
satisfies it as long as that address delivers.*

## Marketing URL *(optional)*
```
https://fittrack.rosstoma.me
```

## Privacy Policy URL *(required)*
```
https://rosstoma.me/fittrack/privacy
```

## Age Rating
**4+** — no objectionable content. Answer "None" to every content question, and
"No" to unrestricted web access.

## Version
```
1.0.0
```

## Copyright
```
2026 Ross Toma
```

---

## Subscription product (only after the Paid Apps Agreement)

App Store Connect → your app → **Subscriptions** → create a group, then:

| Field | Value |
|---|---|
| Reference Name | FitTrack Pro Monthly *(internal only)* |
| Product ID | `me.rosstoma.fittrack.pro.monthly` |
| Duration | 1 Month |
| Price | $4.99 USD |
| Display Name | FitTrack Pro |
| Description | Higher daily limits on photo scanning, AI meal estimates and the coach. |

**A subscription needs its own screenshot** showing the paywall, plus a review
note. Reviewers test the purchase, so it must be genuinely buyable in sandbox
before you submit.

---

## Review Notes — paste verbatim

```
FitTrack is a personal meal and workout tracker.

All tracking features are free and unlimited. The subscription raises daily
limits on two AI features — photo-based nutrition scanning and a coaching chat —
which cost per call to operate.

DEMO ACCOUNT
Email: <fill in>
Password: <fill in>
This account has meals and workouts already logged, so the dashboard, trends and
weekly review render with real data rather than empty states.

TESTING THE PHOTO SCANNER
Meals tab -> + button -> "Scan a photo with AI" -> choose any photo of food.
The free tier allows 3 scans per day.

ACCOUNT DELETION
More -> Account -> Delete account. Immediate and permanent.

Privacy policy: https://rosstoma.me/fittrack/privacy
Terms of use: https://rosstoma.me/fittrack/terms
```

---

## Order of operations once enrolment clears

1. **Accept the Paid Apps Agreement** and submit bank + tax details — start this
   first, it verifies in the background while you do everything else
2. Create the app record (bundle ID `me.rosstoma.fittrack`)
3. Paste this listing
4. Upload the five screenshots from `~/Desktop/fittrack-appstore/`
5. Complete App Privacy — answers are in `APP-STORE-PRIVACY.md`
6. Create the subscription *(needs the agreement verified)*
7. Wire RevenueCat, put the key in `.env`, rebuild, test a sandbox purchase
8. Upload a build via EAS or Xcode
9. Paste the review notes with real demo credentials
10. Submit
