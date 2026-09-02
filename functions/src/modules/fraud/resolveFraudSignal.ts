import * as functions from 'firebase-functions';
import { admin, auth, db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { writeAuditLog } from '../../util/audit';

type Resolution = 'LOCK' | 'FREEZE' | 'IGNORE';

const STATUS_BY_RESOLUTION: Record<Resolution, string> = {
  LOCK: 'RESOLVED_LOCKED',
  FREEZE: 'RESOLVED_FROZEN',
  IGNORE: 'RESOLVED_IGNORED',
};

/**
 * The only place that ever changes users.status or disables a Firebase Auth
 * account — and only when an admin explicitly calls it. Nothing in the
 * fraud-detection trigger (onOrderWrite) or anywhere else does this
 * automatically, per feature 5's "no auto-lock, ever" requirement.
 */
export const resolveFraudSignal = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Chỉ admin mới có quyền xử lý cảnh báo gian lận.');
  }

  const signalId = typeof data?.signalId === 'string' ? data.signalId : null;
  const resolution = data?.resolution as Resolution;
  const note = typeof data?.note === 'string' ? data.note : '';
  if (!signalId || !STATUS_BY_RESOLUTION[resolution]) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu signalId hoặc resolution không hợp lệ.');
  }

  const signalRef = db.collection('fraudSignals').doc(signalId);
  const signalSnap = await signalRef.get();
  if (!signalSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Không tìm thấy cảnh báo này.');
  }
  const signal = signalSnap.data()!;

  await signalRef.update({
    status: STATUS_BY_RESOLUTION[resolution],
    resolvedBy: context.auth.uid,
    resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
    resolutionNote: note,
  });

  if (resolution === 'FREEZE') {
    await db.collection('users').doc(signal.userId).update({ status: 'SUSPENDED' });
  } else if (resolution === 'LOCK') {
    await db.collection('users').doc(signal.userId).update({ status: 'LOCKED' });
    await auth.updateUser(signal.userId, { disabled: true });
    await auth.revokeRefreshTokens(signal.userId);
  }

  await writeAuditLog({
    actorUid: context.auth.uid,
    actorEmail: context.auth.token.email ?? null,
    action: `resolveFraudSignal:${resolution}`,
    targetType: 'fraudSignal',
    targetId: signalId,
    metadata: { userId: signal.userId, note },
  });

  return { ok: true };
});
