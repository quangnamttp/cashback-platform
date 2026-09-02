import * as functions from 'firebase-functions';
import { db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { writeAuditLog } from '../../util/audit';

/**
 * Soft revoke: only invalidates this one session doc, so the client's
 * onSnapshot watcher signs itself out. Deliberately does NOT touch Firebase
 * Auth tokens — that's reserved for an actual account lock
 * (resolveFraudSignal's LOCK branch), which is a different, harsher action.
 */
export const forceLogoutSession = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth || context.auth.token.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Chỉ admin mới có quyền thao tác phiên đăng nhập.');
  }
  const sessionDocId = typeof data?.sessionDocId === 'string' ? data.sessionDocId : null;
  if (!sessionDocId) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu sessionDocId.');
  }

  await db.collection('sessions').doc(sessionDocId).update({
    status: 'REVOKED',
    sessionToken: null,
  });

  await writeAuditLog({
    actorUid: context.auth.uid,
    actorEmail: context.auth.token.email ?? null,
    action: 'forceLogoutSession',
    targetType: 'session',
    targetId: sessionDocId,
  });

  return { ok: true };
});
