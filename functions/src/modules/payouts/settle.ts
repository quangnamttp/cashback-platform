import { admin, db } from '../../lib/admin';
import { PAYOUT_AUTO_THRESHOLD_VND } from '../../lib/constants';

/**
 * Spark plan has no Cloud Scheduler (any job needs a billing account, which
 * Spark can't attach). Instead of a cron job flipping FROZEN -> eligible
 * ledger entries at exactly 15 days, this runs inline whenever someone
 * touches a page that cares about the result (listPayoutQueue for admin,
 * getMyWallet for the user) — "settle on next read" rather than "settle on
 * schedule". At ~100 users, someone opens one of those pages within a day
 * or two of any entry becoming due, so the practical delay is small; it's
 * an explicit trade-off, not exact-to-the-second automation.
 */
export async function settleDueLedgerEntries(uid?: string): Promise<{ settledCount: number }> {
  let query: FirebaseFirestore.Query = db.collection('cashbackLedger')
    .where('status', '==', 'FROZEN')
    .where('eligibleAt', '<=', admin.firestore.Timestamp.now());
  if (uid) {
    query = query.where('userId', '==', uid);
  }

  const snap = await query.get();
  if (snap.empty) {
    return { settledCount: 0 };
  }

  let settledCount = 0;
  for (const doc of snap.docs) {
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(doc.ref);
      const fresh = freshSnap.data();
      if (!fresh || fresh.status !== 'FROZEN') return;

      if (fresh.amount < PAYOUT_AUTO_THRESHOLD_VND) {
        tx.update(doc.ref, {
          status: 'PAID',
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          autoSettled: true,
        });
        tx.update(db.collection('walletBalances').doc(fresh.userId), {
          balanceAvailable: admin.firestore.FieldValue.increment(fresh.amount),
          balanceFrozen: admin.firestore.FieldValue.increment(-fresh.amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        tx.update(doc.ref, { status: 'PENDING_ADMIN_APPROVAL' });
      }
    });
    settledCount += 1;
  }

  return { settledCount };
}
