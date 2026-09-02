import * as functions from 'firebase-functions';
import { auth, db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { writeAuditLog } from '../../util/audit';

export const setUserRole = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Chỉ admin mới có quyền đổi vai trò người dùng.');
  }

  const targetUid = typeof data?.targetUid === 'string' ? data.targetUid : null;
  const role = data?.role;
  if (!targetUid || (role !== 'admin' && role !== 'user')) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu targetUid hoặc role không hợp lệ.');
  }

  await auth.setCustomUserClaims(targetUid, { role });
  await db.collection('users').doc(targetUid).update({ role });
  await writeAuditLog({
    actorUid: context.auth.uid,
    actorEmail: context.auth.token.email ?? null,
    action: 'setUserRole',
    targetType: 'user',
    targetId: targetUid,
    metadata: { role },
  });

  return { ok: true };
});
