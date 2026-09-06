'use client';

import { collection, doc, getDocs, query, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';

/**
 * One-time maintenance action (see manager/settings/page.tsx) — every order
 * ever created before customerVisible existed (every MANUAL order to date,
 * since ACCESSTRADE has never written a real order yet — DRY_RUN) has been
 * fully visible to its customer this whole time, so this only ever writes
 * `customerVisible: true` — a fact about the past, not new data. Needed
 * because the customer-facing queries (app/orders/page.tsx, app/cashback/
 * page.tsx) now filter `where('customerVisible','==',true)`: Firestore
 * validates a `list` query against its own filters, not live data, so any
 * order missing the field entirely (i.e. everything created before this
 * ran) would silently stop appearing in a customer's own order history
 * until this backfill runs once. Firestore's own read rule already treats
 * an absent field as visible (see firestore.rules), so nothing was ever
 * insecure in the meantime — this only restores what the customer's LIST
 * VIEW can show. Safe to run more than once (a no-op the second time).
 */
export async function backfillOrdersCustomerVisible(): Promise<{ scanned: number; updated: number }> {
  const db = getFirebaseDb();
  const snap = await getDocs(query(collection(db, 'orders')));
  const missing = snap.docs.filter((d) => !('customerVisible' in d.data()));

  for (let i = 0; i < missing.length; i += 450) {
    const batch = writeBatch(db);
    missing.slice(i, i + 450).forEach((d) => batch.update(doc(db, 'orders', d.id), { customerVisible: true }));
    await batch.commit();
  }

  return { scanned: snap.docs.length, updated: missing.length };
}
