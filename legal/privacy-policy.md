# FitTrack Privacy Policy

**Last updated: 25 August 2026**

FitTrack ("the app") is operated by Ross Toma ("we", "us"). This policy explains
what the app collects, why, and what you can do about it.

Contact: **support@rosstoma.me**

---

## 1. What we collect

### Information you give us

| Data | Why |
|---|---|
| Email address and password | To create and sign you in to your account |
| Meals, ingredients, weights and nutrition | The core function of the app |
| Workouts, exercises, sets, reps and weights | The core function of the app |
| Height, weight, age and sex (optional) | To estimate your basal metabolic rate |
| Goals, water intake, habits and supplements | Daily tracking features |
| Meal photos (optional) | To estimate nutrition from an image |

Your password is never stored by us in a readable form. Authentication is
handled by Supabase, which stores a cryptographic hash.

### Information collected automatically

- **AI usage records** — which AI feature you used, when, the model, token
  counts and cost. Used to enforce daily limits and prevent abuse. This does
  **not** include the content of your messages or photos.
- **Subscription status** — whether you have an active subscription, the
  product purchased, and when it expires.

### What we deliberately do **not** collect

- No advertising identifiers, and no advertising
- No analytics or behavioural tracking SDKs
- No location data. Photos are re-encoded on your device before upload, which
  removes embedded EXIF metadata including GPS coordinates
- No contacts, calendar, microphone or browsing history

---

## 2. How your data is used

Your data is used to operate the features you are using, and for nothing else.
Specifically, we do **not** sell your data, share it with data brokers, or use
it for advertising or marketing.

### AI features

When you use a photo scan, an AI meal estimate, or the coach, the relevant
content is sent to **Anthropic** (Claude) to generate a response:

- **Photo scan** — the photo and any note you add
- **AI meal estimate** — your text description
- **Coach** — your message plus a summary of the day's logged totals

Anthropic processes this to return a result. Under Anthropic's commercial terms,
this data is **not used to train their models**. See
<https://www.anthropic.com/legal/commercial-terms>.

Photos are resized on your device before they are sent, and are not retained by
us beyond the meal record you choose to save.

---

## 3. Health data

FitTrack records information about your diet and exercise. We treat this as
sensitive and handle it accordingly:

- It is stored in a database where **row-level security** restricts every row to
  the account that created it. Other users cannot read your data.
- If you connect Apple Health, that data is used **only** to display and record
  your fitness information inside the app. In line with Apple's requirements, we
  do **not** use Apple Health data for advertising, marketing, or data mining,
  we do **not** disclose it to third parties, and we do **not** store it in
  iCloud.
- **FitTrack is not a medical device.** Nothing in it is medical advice. AI
  estimates are approximate and can be wrong. Do not use it to diagnose or treat
  anything, and speak to a qualified professional about any medical concern.

---

## 4. Who your data is shared with

We use these processors, and no others:

| Processor | Purpose | Location |
|---|---|---|
| **Supabase** | Database, authentication, file storage, server functions | United States |
| **Anthropic** | AI photo, meal and coach responses | United States |
| **RevenueCat** | Subscription and receipt validation | United States |
| **Apple** | Payment processing for subscriptions | United States |
| **Vercel** | Hosting for the FitTrack web app | United States |

We may disclose data if legally required to do so — for example under a valid
court order.

---

## 5. Where data is stored and for how long

Data is stored on servers in the United States. If you use the app from outside
the US, your data is transferred there.

We keep your data for as long as your account exists. When you delete your
account it is erased immediately (see below). We retain one record of the
deletion itself, containing a one-way hash of your email address and the date —
enough to confirm a deletion happened, and not enough to identify you.

---

## 6. Deleting your account

You can delete your account at any time from inside the app:

**More → Account → Delete account**

This immediately and permanently erases your profile, goals, meals, ingredients,
workouts, exercises, sets, water logs, habits, supplements, food library, AI
usage records, connected-service tokens, and uploaded photos. It cannot be
undone and there is no backup.

Deleting your account does **not** cancel an active subscription. Apple controls
billing — cancel in **Settings → Apple ID → Subscriptions**.

---

## 7. Your rights

Depending on where you live, you may have the right to access, correct, export,
delete, or restrict processing of your personal data, and to object to it. Most
of your data is directly visible and editable in the app; deletion is
self-service. For anything else, email **support@rosstoma.me** and we will
respond within 30 days.

If you are in the EEA or UK, our legal basis for processing is performance of a
contract (operating the app you signed up for). If you are in California, note
that we do not sell or share personal information as those terms are defined by
the CCPA.

---

## 8. Children

FitTrack is not directed at children under 13, and we do not knowingly collect
data from them. If you believe a child has created an account, email us and we
will delete it.

---

## 9. Security

- All traffic uses TLS.
- Row-level security in the database scopes every row to its owner.
- API keys that can bypass those controls, or that cost money, are held only on
  the server and are never included in the app.
- Uploaded images are validated by content, not by their claimed file type, and
  are size- and dimension-limited.

No system is perfectly secure. If you find a vulnerability, please report it to
**support@rosstoma.me** rather than disclosing it publicly.

---

## 10. Changes

If this policy changes materially, we will update the date at the top and notify
you in the app before the change takes effect.
