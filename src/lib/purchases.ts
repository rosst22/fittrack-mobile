// In-app purchases via RevenueCat.
//
// Apple requires StoreKit for anything that unlocks features inside the app
// (App Store Review guideline 3.1.1) — Stripe or a web checkout is a rejection.
// RevenueCat sits on top of StoreKit and, importantly, validates the receipt
// with Apple on its own servers and then calls our webhook. That is why nothing
// in this file grants access: it starts a purchase and then waits for the
// server to agree. `getEntitlement()` in api.ts is the source of truth.
import Purchases, { LOG_LEVEL, type PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';

const IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;

/** The entitlement identifier configured in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT = 'pro';

let configured = false;

/**
 * Must run after sign-in, with the Supabase user id: it makes RevenueCat's
 * appUserID equal to our user id, which is what lets the webhook map a purchase
 * onto the right row. Configuring anonymously and calling logIn later works too
 * but leaves an orphan anonymous customer behind on first launch.
 */
export function configurePurchases(userId: string) {
  if (!IOS_API_KEY || Platform.OS !== 'ios') return;
  if (configured) {
    Purchases.logIn(userId).catch(() => {});
    return;
  }
  Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
  Purchases.configure({ apiKey: IOS_API_KEY, appUserID: userId });
  configured = true;
}

export function isPurchasesAvailable() {
  return Boolean(IOS_API_KEY) && Platform.OS === 'ios';
}

/** The packages in the "default" offering, or [] if IAP is not configured. */
export async function getOfferings(): Promise<PurchasesPackage[]> {
  if (!isPurchasesAvailable()) return [];
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export type PurchaseOutcome = 'purchased' | 'cancelled';

/**
 * Runs Apple's purchase sheet. Returning 'purchased' means StoreKit completed —
 * it does NOT mean our server has granted Pro yet. The webhook usually lands
 * within a second or two; callers should re-read the entitlement rather than
 * assuming.
 */
export async function purchase(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
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
  if (!isPurchasesAvailable()) return false;
  const info = await Purchases.restorePurchases();
  return info.entitlements.active[PRO_ENTITLEMENT] !== undefined;
}

export async function logOutPurchases() {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Logging out of an anonymous customer throws; harmless.
  }
}
