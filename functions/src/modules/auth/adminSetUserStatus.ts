import * as functions from 'firebase-functions';
import { auth, db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { writeAuditLog } from '../../util/audit';

type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
const VALID_STATUSES: UserStatus[] = ['ACTIVE', 'SUSPENDED', 'LOCKED'];

/**
 * Direct admin action from the users list (independent of a fraud signal —
 * resolveFraudSignal covers the "resolve this specific alert" path, this
 * covers "just lock/unlock this account"). LOCKED disables Firebase Auth
 * sign-in outright; SUSPENDED only flags the account (still able to log in,
 * blocked from withdrawing — see requestWithdrawal); ACTIVE re-enables both.
 */
export const adminSetUserStatus = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Chỉ admin mới có quyền thao tác trạng thái tài khoản.');
  }

  const targetUid = typeof data?.targetUid === 'string' ? data.targetUid : null;
  const status = data?.status as UserStatus;
  if (!targetUid || !VALID_STATUSES.includes(status)) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu targetUid hoặc status không hợp lệ.');
  }

  await db.collection('users').doc(targetUid).update({ status });

  if (status === 'LOCKED') {
    await auth.updateUser(targetUid, { disabled: true });
    await auth.revokeRefreshTokens(targetUid);
  } else {
    await auth.updateUser(targetUid, { disabled: false });
  }

  await writeAuditLog({
    actorUid: context.auth.uid,
    actorEmail: context.auth.token.email ?? null,
    action: `adminSetUserStatus:${status}`,
    targetType: 'user',
    targetId: targetUid,
  });

  return { ok: true };
});
