'use client';

import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';

export type SystemRates = {
  shopeeRate: number;
  lazadaRate: number;
  tiktokRate: number;
  minWithdraw: number;
};

// Matches the values this app shipped with before this became editable —
// used whenever systemConfig/rates doesn't exist yet (fresh project) or a
// specific field is missing, so nothing breaks before an admin ever saves.
export const DEFAULT_RATES: SystemRates = {
  shopeeRate: 0.04,
  lazadaRate: 0.05,
  tiktokRate: 0.03,
  minWithdraw: 30000,
};

// Reference order value used to show a "Hoàn tiền dự kiến" estimate before
// a real price has been scraped for a pasted link (see lib/productPreview.ts
// / workers/product-preview) — shared between /get-cashback-link and
// /link-history so both show the exact same number for the same link.
export const ASSUMED_ORDER_VALUE = 100000;

/** Live-subscribes to the one shared rates doc; degrades to the defaults
 * above if the doc doesn't exist yet or a field is missing. */
export function subscribeSystemRates(callback: (rates: SystemRates) => void): () => void {
  const db = getFirebaseDb();
  return onSnapshot(
    doc(db, 'systemConfig', 'rates'),
    (snap) => callback({ ...DEFAULT_RATES, ...(snap.exists() ? snap.data() : {}) }),
    () => callback(DEFAULT_RATES),
  );
}

export async function saveSystemRates(rates: SystemRates): Promise<void> {
  const db = getFirebaseDb();
  await setDoc(doc(db, 'systemConfig', 'rates'), rates, { merge: true });
}
