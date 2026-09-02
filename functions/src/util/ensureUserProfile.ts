import { admin, auth, db } from '../lib/admin';
import { BOOTSTRAP_ADMIN_EMAIL } from '../lib/constants';
import { generateShortCode } from './ids';

/**
 * Idempotent: creates `users/{uid}` + `walletBalances/{uid}` with defaults
 * if they don't exist yet, and makes sure the custom claim matches. Used by
 * `onUserCreate` for the normal path, and again at the top of
 * `registerSession` as a self-heal for accounts created before this trigger
 * existed (or before it was deployed) — those never got the trigger and
 * would otherwise be stuck with no profile and no role claim forever.
 */
export async function ensureUserProfile(
  uid: string,
  email: string | null,
  displayName?: string | null,
  photoURL?: string | null,
): Promise<void> {
  const userRef = db.collection('users').doc(uid);
  const snap = await userRef.get();
  if (snap.exists) return;

  const isBootstrapAdmin = !!BOOTSTRAP_ADMIN_EMAIL && email === BOOTSTRAP_ADMIN_EMAIL;
  const role = isBootstrapAdmin ? 'admin' : 'user';

  const userRecord = await auth.getUser(uid);
  if (userRecord.customClaims?.role !== role) {
    await auth.setCustomUserClaims(uid, { role });
  }

  const batch = db.batch();
  batch.set(userRef, {
    email: email ?? null,
    fullName: displayName ?? (email ? email.split('@')[0] : ''),
    role,
    status: 'ACTIVE',
    referredBy: null,
    referralCode: generateShortCode(6),
    phone: null,
    birthday: null,
    avatarUrl: photoURL ?? null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('walletBalances').doc(uid), {
    balanceAvailable: 0,
    balanceFrozen: 0,
    totalCashbackLifetime: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
}
