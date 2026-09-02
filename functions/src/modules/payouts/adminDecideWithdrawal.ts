import * as functions from 'firebase-functions';
import { admin, db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { writeAuditLog } from '../../util/audit';

type Decision = 'APPROVE' | 'REJECT' | 'MARK_PAID';

export const adminDecideWithdrawal = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Chỉ admin mới có quyền duyệt rút tiền.');
  }

  const requestId = typeof data?.requestId === 'string' ? data.requestId : null;
  const decision = data?.decision as Decision;
  if (!requestId || !['APPROVE', 'REJECT', 'MARK_PAID'].includes(decision)) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu requestId hoặc decision không hợp lệ.');
  }

  await db.runTransaction(async (tx) => {
    const reqRef = db.collection('withdrawalRequests').doc(requestId);
    const snap = await tx.get(reqRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Không tìm thấy yêu cầu rút tiền.');
    }
    const wd = snap.data()!;

    if (decision === 'REJECT') {
      if (wd.status === 'REJECTED' || wd.status === 'PAID') {
        throw new functions.https.HttpsError('failed-precondition', 'Yêu cầu đã được xử lý trước đó.');
      }
      tx.update(reqRef, {
        status: 'REJECTED',
        decidedBy: context.auth!.uid,
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      tx.update(db.collection('walletBalances').doc(wd.userId), {
        balanceAvailable: admin.firestore.FieldValue.increment(wd.amount),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (decision === 'APPROVE') {
      if (wd.status !== 'PENDING_ADMIN') {
        throw new functions.https.HttpsError('failed-precondition', 'Yêu cầu này không ở trạng thái chờ duyệt.');
      }
      tx.update(reqRef, {
        status: 'APPROVED',
        decidedBy: context.auth!.uid,
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      if (wd.status !== 'APPROVED' && wd.status !== 'AUTO_APPROVED') {
        throw new functions.https.HttpsError('failed-precondition', 'Yêu cầu cần được duyệt trước khi đánh dấu đã chuyển tiền.');
      }
      tx.update(reqRef, {
        status: 'PAID',
        decidedBy: context.auth!.uid,
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  await writeAuditLog({
    actorUid: context.auth.uid,
    actorEmail: context.auth.token.email ?? null,
    action: `adminDecideWithdrawal:${decision}`,
    targetType: 'withdrawalRequest',
    targetId: requestId,
  });

  return { ok: true };
});
