'use client';

import { collection, doc, getDoc, getDocs, query, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { ADMIN_WALLET_ID } from './orderEntry';

/**
 * One-time maintenance action (see manager/settings/page.tsx) — reconciles
 * walletBalances/{uid}.available (the counter reserveWithdrawal actually
 * checks — see lib/walletBalance.ts) against the true value: same live-sum
 * formula cashback-wallet/page.tsx has always used to DISPLAY "Khả dụng"
 * (sum of RELEASED cashbackLedger amounts for that uid, minus any
 * non-REJECTED withdrawalRequests). Needed because walletBalances is a
 * newer, separately-maintained counter (only touched going forward by
 * creditWalletBalance/reserveWithdrawal) — any RELEASED ledger entry from
 * before that counter existed, or from any other write path that never
 * called creditWalletBalance, never got reflected into it. The customer
 * then sees a healthy "Khả dụng" (still the accurate live-sum) but
 * reserveWithdrawal's real check fails against a stale/missing counter —
 * exactly the "Số dư khả dụng của bạn đã thay đổi" error this closes.
 * ADMIN_WALLET is skipped — its withdrawals are a separate admin-only
 * calculation that never reserves against this counter (see
 * manager/payouts/page.tsx's decideSelected). Safe to run more than once
 * (each run recomputes the true value fresh; a user already in sync is a
 * no-op write).
 */
export async function backfillWalletBalances(): Promise<{ usersScanned: number; usersUpdated: number }> {
  const db = getFirebaseDb();

  const [ledgerSnap, withdrawalsSnap] = await Promise.all([
    getDocs(query(collection(db, 'cashbackLedger'))),
    getDocs(query(collection(db, 'withdrawalRequests'))),
  ]);

  const trueAvailable = new Map<string, number>();
  ledgerSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.status !== 'RELEASED') return;
    const userId = data.userId as string | undefined;
    if (!userId || userId === ADMIN_WALLET_ID) return;
    trueAvailable.set(userId, (trueAvailable.get(userId) ?? 0) + (data.amount ?? 0));
  });
  withdrawalsSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.status === 'REJECTED') return;
    const userId = data.userId as string | undefined;
    if (!userId || userId === ADMIN_WALLET_ID) return;
    trueAvailable.set(userId, (trueAvailable.get(userId) ?? 0) - (data.amount ?? 0));
  });

  const userIds = Array.from(trueAvailable.keys());
  const mismatched: { userId: string; value: number }[] = [];
  for (const userId of userIds) {
    const value = Math.max(0, trueAvailable.get(userId) ?? 0);
    const snap = await getDoc(doc(db, 'walletBalances', userId));
    const current = snap.exists() ? ((snap.data().available as number) ?? 0) : null;
    if (current !== value) mismatched.push({ userId, value });
  }

  for (let i = 0; i < mismatched.length; i += 450) {
    const batch = writeBatch(db);
    mismatched.slice(i, i + 450).forEach(({ userId, value }) => {
      batch.set(doc(db, 'walletBalances', userId), { available: value }, { merge: true });
    });
    await batch.commit();
  }

  return { usersScanned: userIds.length, usersUpdated: mismatched.length };
}
