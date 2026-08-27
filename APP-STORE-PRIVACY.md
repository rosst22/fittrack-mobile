# App Store Privacy Nutrition Labels — exact answers

Enter these in **App Store Connect → your app → App Privacy**.

Derived from an audit of what the code actually does, not from guesses. Getting
these wrong is a rejection, and getting them wrong in the *other* direction —
over-declaring — puts scary labels on your listing that aren't true.

**The single most important answer: you are NOT tracking.** Choose
**"No, we do not collect data used to track you"** when asked about tracking.
Apple defines tracking as linking user data with third-party data for
advertising, or sharing it with data brokers. FitTrack does neither, has no
advertising SDK, and no analytics SDK. Answering yes would force an
App Tracking Transparency prompt you don't need and shouldn't show.

---

## The four data types to declare

For each: **Linked to the user? YES** (everything is tied to an account).
**Used for tracking? NO** (all four).

### 1. Contact Info → Email Address

- **Purpose:** App Functionality
- **Why:** Supabase email/password authentication. It is the account identifier.

### 2. Health & Fitness → Fitness

- **Purpose:** App Functionality
- **Why:** Workouts, exercises, sets, reps, weights, calories burned, bodyweight,
  height, age, sex, and BMR.
- Declare under **Fitness**, not Health — you are not reading HealthKit or
  medical records.

### 3. User Content → Other User Content

- **Purpose:** App Functionality
- **Why:** Meals, ingredients, macros, meal photos, water intake, habits,
  supplements, goals, and coach messages.
- Meal photos belong here. They are stored in Supabase Storage, scoped to the
  user, and **stripped of EXIF/GPS on the device before upload**.

### 4. Purchases → Purchase History

- **Purpose:** App Functionality
- **Why:** Subscription status, product purchased, and expiry, so the app knows
  whether to unlock Pro.
- Only needed once the subscription ships. If you submit v1 without it, omit
  this type.

---

## Do NOT declare these

Each of these would be inaccurate, and several would look alarming on the
listing page:

| Not collected | Why not |
|---|---|
| **Precise or Coarse Location** | Never requested. Photo EXIF (which carries GPS) is stripped on-device before upload. |
| **Identifiers** (User ID / Device ID) | The Supabase user id is an internal account key, not an advertising or device identifier. |
| **Usage Data** | No analytics SDK of any kind. |
| **Diagnostics** | No crash-reporting SDK. |
| **Contacts, Browsing History, Search History, Sensitive Info, Financial Info** | Never touched. Apple handles payment; card details never reach the app. |

---

## The two questions people get wrong

**"Is the data used for third-party advertising?"** → **No** for every type.

**"Do you collect data from this app to track users across apps or websites owned
by other companies?"** → **No.**

---

## Third parties, if asked

Apple's form doesn't require listing processors, but your privacy policy does and
they should agree:

| Processor | What it receives | Why |
|---|---|---|
| **Supabase** | All account data | Database, auth, storage, server functions |
| **Anthropic** | Photo + text sent to the scanner or coach | Generates the nutrition estimate or reply. Not used to train their models under their commercial terms. |
| **RevenueCat** | Subscription receipt data | Validates purchases |
| **Apple** | Payment details | Processes the subscription. Never reaches the app. |

---

## App Review notes — paste this into the Review Notes field

> FitTrack is a personal meal and workout tracker.
>
> All tracking features are free. The subscription raises daily limits on two AI
> features — photo-based nutrition scanning and a coaching chat — which cost per
> call to operate.
>
> **Demo account:** <email> / <password>
> This account has meals and workouts already logged so the dashboard, trends and
> weekly review render with real data.
>
> **Account deletion** is at More → Account → Delete account.
>
> **Photo scanning:** tap Meals → + → "Scan a photo with AI" and select any photo
> of food. The camera also works on a physical device.
>
> Privacy policy: https://rosstoma.me/fittrack/privacy
> Terms of use: https://rosstoma.me/fittrack/terms

---

## Before you submit

- [ ] Create the demo account, log 3–4 meals and 2 workouts on it, and put the
      real credentials in the note above
- [ ] Confirm https://rosstoma.me/fittrack/privacy loads
- [ ] Confirm **support@rosstoma.me actually delivers mail** — App Review checks
      support contacts, and the privacy policy publishes that address
- [ ] Age rating: 4+ works; there is no objectionable content. Declare no
      unrestricted web access.
