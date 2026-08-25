// In-app purchases via RevenueCat.
//
// Apple requires StoreKit for anything that unlocks features inside the app
// (guideline 3.1.1). Under 3.1.3(b) a multiplatform service may ALSO honour a
// subscription bought on the web — which is what the Stripe path does — but the
// same thing must remain purchasable in-app, so this cannot simply be dropped.
//
// Nothing here grants access. It starts a purchase and then waits for the
// server to agree: RevenueCat validates the receipt with Apple on its own
// servers and calls our webhook, which is the only writer of `entitlements`.
// `getEntitlement()` in api.ts is the source of truth.
//
// EXPO GO: react-native-purchases is a native module and is not bundled into
// Expo Go, so importing it at module scope crashes the app on launch. It is
// therefore required lazily and every entry point degrades to a no-op when it
// is missing. That keeps the whole app testable in Expo Go, with the purchase
// flow simply unavailable until a dev build.
import { Platform } from 'react-native';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

/** The entitlement identifier configured in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT = 'pro';

/** Re-exported minimally so screens do not import the native module either. */
export type Package = {
  identifier: string;
  product: { title: string; description: string; priceString: string };
};

type PurchasesModule = {
  setLogLevel: (level: unknown) => void;
  configure: (opts: { apiKey: string; appUserID: string }) => void;
  logIn: (id: string) => Promise<unknown>;
  logOut: () => Promise<unknown>;
  getOfferings: () => Promise<{ current?: { availablePackages: Package[] } }>;
  purchasePackage: (pkg: Package) => Promise<unknown>;
  restorePurchases: () => Promise<{ entitlements: { active: Record<string, unknown> } }>;
  LOG_LEVEL: { DEBUG: unknown; ERROR: unknown };
};

let cached: PurchasesModule | null = null;
let resolved = false;

/** null when the native module is absent (Expo Go, web, Android build). */
function nativeModule(): PurchasesModule | null {
  if (resolved) return cached;
  resolved = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-purchases');
    const Purchases = mod.default ?? mod;
    cached = Purchases?.configure ? { ...Purchases, LOG_LEVEL: mod.LOG_LEVEL } : null;
  } catch {
    cached = null;
  }
  return cached;
}

let configured = false;

/**
 * Must run after sign-in, with the Supabase user id: it makes RevenueCat's
 * appUserID equal to our user id, which is what lets the webhook map a purchase
 * onto the right row.
 */
export function configurePurchases(userId: string) {
  if (!IOS_API_KEY || Platform.OS !== 'ios') return;
  const Purchases = nativeModule();
  if (!Purchases) return;

  if (configured) {
    Purchases.logIn(userId).catch(() => {});
    return;
  }
  try {
    Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.ERROR);
    Purchases.configure({ apiKey: IOS_API_KEY, appUserID: userId });
    configured = true;
  } catch {
    // Leave configured false; the paywall will show the unavailable state.
  }
}

/** True only when a real purchase can actually be started. */
export function isPurchasesAvailable() {
  return Boolean(IOS_API_KEY) && Platform.OS === 'ios' && nativeModule() !== null;
}

/** Distinguishes "no dev build" from "not set up yet", for an honest message. */
export function purchasesUnavailableReason(): string | null {
  if (Platform.OS !== 'ios') return 'In-app purchases are iOS only.';
  if (nativeModule() === null) {
    return 'In-app purchase needs a development build — it is not part of Expo Go.';
  }
  if (!IOS_API_KEY) {
    return 'In-app purchase is not configured yet (no RevenueCat key in this build).';
  }
  return null;
}

export async function getOfferings(): Promise<Package[]> {
  const Purchases = nativeModule();
  if (!Purchases || !isPurchasesAvailable()) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export type PurchaseOutcome = 'purchased' | 'cancelled';

/**
 * Runs Apple's purchase sheet. 'purchased' means StoreKit completed — it does
 * NOT mean our server has granted Pro yet. Callers must re-read the
 * entitlement rather than assuming.
 */
export async function purchase(pkg: Package): Promise<PurchaseOutcome> {
  const Purchases = nativeModule();
  if (!Purchases) throw new Error('In-app purchase is not available in this build.');
  try {
    await Purchases.purchasePackage(pkg);
    return 'purchased';
  } catch (e) {
    const err = e as { userCancelled?: boolean; message?: string };
    if (err.userCancelled) return 'cancelled';
    throw new Error(err.message ?? 'The purchase could not be completed.');
  }
}

/**
 * Apple requires a visible "Restore Purchases" control on any app selling a
 * subscription — without one, review rejects the build.
 */
export async function restore(): Promise<boolean> {
  const Purchases = nativeModule();
  if (!Purchases || !isPurchasesAvailable()) return false;
  const info = await Purchases.restorePurchases();
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

export async function logOutPurchases() {
  if (!configured) return;
  const Purchases = nativeModule();
  if (!Purchases) return;
  try {
    await Purchases.logOut();
  } catch {
    // Logging out of an anonymous customer throws; harmless.
  }
}
