'use client';

import { doc, increment, runTransaction, setDoc } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';

/**
 * A SECOND, narrower balance figure alongside the wallet UI's own live-
 * summed "available" (cashback-wallet/page.tsx: released ledger minus
 * reserved withdrawals) — that computation never changes and stays the
 * number customers/admins actually see. This module exists only because
 * firestore.rules cannot itself sum a collection to cap a withdrawal
 * request's amount, so there was previously NO server-side enforcement of
 * "amount <= real balance" at all — a client disabling a button is not a
 * security boundary. walletBalances/{uid}.available is a maintained
 * running counter a security rule CAN read with a single get(), kept in
 * sync at exactly three points: reserved (decremented) the moment a
 * customer's own withdrawal request is created, credited (incremented)
 * when a FROZEN ledger entry is RELEASED, and refunded (incremented) when
 * a withdrawal request is REJECTED — the same three events the live-sum
 * formula already accounts for. See firestore.rules' walletBalances match
 * block: only the owner can ever DECREASE this field (and never below 0),
 * only isAdmin()/isPaymentBot() can ever increase it — so a customer can
 * reserve their own withdrawal but can never inflate their own ceiling.
 */

/**
 * Atomically checks amount <= current available and reserves it by
 * decrementing, or fails without writing anything. Must run in a
 * transaction (not a plain increment(-amount)) because it has to READ and
 * VALIDATE before deciding whether to write at all — an unconditional
 * decrement could go negative. Firestore serializes two concurrent calls
 * for the same uid against this same document, so two withdrawal requests
 * submitted near-simultaneously can never both reserve more than what was
 * really available (the loser's transaction retries against the winner's
 * already-decremented value and correctly fails).
 *
 * Returns false if there's no walletBalances doc yet (nothing has ever
 * been released to this user — they cannot legitimately withdraw anything)
 * or if amount exceeds the current available value.
 */
export async function reserveWithdrawal(uid: string, amount: number): Promise<boolean> {
  if (amount <= 0) return false;
  const db = getFirebaseDb();
  const ref = doc(db, 'walletBalances', uid);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return false;
    const available = (snap.data().available as number) ?? 0;
    if (amount > available) return false;
    tx.update(ref, { available: available - amount });
    return true;
  });
}

/**
 * Credits (increments) the counter — used both when a FROZEN ledger entry
 * is RELEASED (new money becomes withdrawable) and when a PENDING/APPROVED
 * withdrawal request is REJECTED (its earlier reservation is given back).
 * A plain atomic increment() is safe with no transaction needed: unlike
 * reserveWithdrawal there's nothing to validate first, and increment() on a
 * missing doc/field via {merge:true} creates it — self-bootstrapping a
 * user's very first credit instead of needing a separate init step.
 */
export async function creditWalletBalance(uid: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  const db = getFirebaseDb();
  await setDoc(doc(db, 'walletBalances', uid), { available: increment(amount) }, { merge: true });
}
