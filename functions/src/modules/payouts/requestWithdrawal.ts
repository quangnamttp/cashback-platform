import * as functions from 'firebase-functions';
import { admin, db } from '../../lib/admin';
import { PAYOUT_AUTO_THRESHOLD_VND, REGION } from '../../lib/constants';

/**
 * Second, independent gate from the 15-day freeze: this only ever debits
 * balanceAvailable, which can't contain anything still inside its 15-day
 * hold. The <100k/>=100k threshold here is checked against the *withdrawal
 * amount*, not the size of the underlying ledger entries that funded it —
 * so withdrawing 150k pooled from several already-settled <100k cashback
 * entries still requires admin approval.
 *
 * "AUTO_APPROVED" only means the amount cleared the automatic threshold
 * check — Spark can't call a real bank/e-wallet API (non-Google outbound),
 * so an admin still transfers the money by hand and marks it PAID.
 */
export const requestWithdrawal = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Cần đăng nhập để rút tiền.');
  }
  const uid = context.auth.uid;
  const amount = Number(data?.amount);
  const method = typeof data?.method === 'string' ? data.method : '';
  const bankAccountId = typeof data?.bankAccountId === 'string' ? data.bankAccountId : null;
  if (!amount || amount <= 0 || !method) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu số tiền hoặc phương thức rút tiền hợp lệ.');
  }

  const userSnap = await db.collection('users').doc(uid).get();
  if (userSnap.data()?.status !== 'ACTIVE') {
    throw new functions.https.HttpsError('failed-precondition', 'Tài khoản đang bị hạn chế, không thể tạo yêu cầu rút tiền.');
  }

  const status = amount < PAYOUT_AUTO_THRESHOLD_VND ? 'AUTO_APPROVED' : 'PENDING_ADMIN';
  const walletRef = db.collection('walletBalances').doc(uid);

  const requestId = await db.runTransaction(async (tx) => {
    const walletSnap = await tx.get(walletRef);
    const balance = walletSnap.data()?.balanceAvailable ?? 0;
    if (balance < amount) {
      throw new functions.https.HttpsError('failed-precondition', 'Số dư khả dụng không đủ.');
    }
    tx.update(walletRef, {
      balanceAvailable: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    const ref = db.collection('withdrawalRequests').doc();
    tx.set(ref, {
      userId: uid,
      amount,
      method,
      bankAccountId,
      status,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return ref.id;
  });

  return { ok: true, requestId, status };
});
