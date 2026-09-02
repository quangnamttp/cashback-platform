import * as functions from 'firebase-functions';
import { admin, db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { writeAuditLog } from '../../util/audit';

type Decision = 'APPROVE' | 'REJECT';

/**
 * Only ledger entries in PENDING_ADMIN_APPROVAL reach here, and that state
 * is only reached via settleDueLedgerEntries once eligibleAt <= now. So
 * "now >= eligibleAt AND role admin" is enforced by the state machine
 * itself rather than a time check duplicated here.
 */
export const adminApprovePayout = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Chỉ admin mới có quyền duyệt hoàn tiền.');
  }

  const ledgerId = typeof data?.ledgerId === 'string' ? data.ledgerId : null;
  const decision = data?.decision as Decision;
  if (!ledgerId || (decision !== 'APPROVE' && decision !== 'REJECT')) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu ledgerId hoặc decision không hợp lệ.');
  }

  await db.runTransaction(async (tx) => {
    const ledgerRef = db.collection('cashbackLedger').doc(ledgerId);
    const snap = await tx.get(ledgerRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Không tìm thấy khoản hoàn tiền này.');
    }
    const ledger = snap.data()!;
    if (ledger.status !== 'PENDING_ADMIN_APPROVAL') {
      throw new functions.https.HttpsError('failed-precondition', 'Khoản này không ở trạng thái chờ duyệt.');
    }

    const walletRef = db.collection('walletBalances').doc(ledger.userId);
    if (decision === 'APPROVE') {
      tx.update(ledgerRef, {
        status: 'PAID',
        approvedBy: context.auth!.uid,
        paidAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(walletRef, {
        balanceAvailable: admin.firestore.FieldValue.increment(ledger.amount),
        balanceFrozen: admin.firestore.FieldValue.increment(-ledger.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      tx.update(ledgerRef, { status: 'REJECTED', approvedBy: context.auth!.uid });
      tx.update(walletRef, {
        balanceFrozen: admin.firestore.FieldValue.increment(-ledger.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  await writeAuditLog({
    actorUid: context.auth.uid,
    actorEmail: context.auth.token.email ?? null,
    action: `adminApprovePayout:${decision}`,
    targetType: 'cashbackLedger',
    targetId: ledgerId,
  });

  return { ok: true };
});
