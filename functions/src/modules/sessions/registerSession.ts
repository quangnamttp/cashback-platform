import * as functions from 'firebase-functions';
import { admin, db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { detectDeviceType } from '../../util/deviceType';
import { randomToken } from '../../util/ids';
import { ensureUserProfile } from '../../util/ensureUserProfile';

/**
 * Session doc id is deterministic: `${uid}_mobile` or `${uid}_desktop`. That
 * alone enforces "max 1 mobile + 1 desktop per account" — a new login of the
 * same device type simply overwrites the one doc for that type, which is
 * what invalidates the previous session there. Logging into a *different*
 * type, or logging into a different account on the same physical device,
 * never touches this doc, so neither case gets kicked.
 */
export const registerSession = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Cần đăng nhập trước khi đăng ký phiên.');
  }
  const uid = context.auth.uid;
  const deviceId = typeof data?.deviceId === 'string' ? data.deviceId : null;
  if (!deviceId) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu deviceId.');
  }
  const referralCode = typeof data?.referralCode === 'string' ? data.referralCode.trim() : '';

  // Self-heal: accounts created before onUserCreate existed (or before it
  // was deployed) never got a users/ doc or role claim — this fixes that
  // on their very next login instead of leaving them stuck forever.
  await ensureUserProfile(uid, context.auth.token.email ?? null, context.auth.token.name, context.auth.token.picture);

  const userAgent = context.rawRequest?.headers?.['user-agent'] as string | undefined;
  const deviceType = detectDeviceType(userAgent);
  const sessionRef = db.collection('sessions').doc(`${uid}_${deviceType}`);
  const sessionToken = randomToken();
  const now = admin.firestore.FieldValue.serverTimestamp();

  const revokedPrevious = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    const prevData = snap.exists ? snap.data() : null;
    const wasRevoked = !!prevData && prevData.status === 'ACTIVE' && prevData.deviceId !== deviceId;
    const sameDevice = !!prevData && prevData.deviceId === deviceId;

    tx.set(sessionRef, {
      userId: uid,
      deviceId,
      deviceType,
      sessionToken,
      userAgent: userAgent ?? null,
      status: 'ACTIVE',
      createdAt: sameDevice ? prevData!.createdAt : now,
      lastSeenAt: now,
    });

    return wasRevoked;
  });

  if (referralCode) {
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (userSnap.exists && !userSnap.data()?.referredBy) {
      await userRef.update({ referredBy: referralCode });
    }
  }

  return { sessionToken, deviceType, revokedPrevious };
});
