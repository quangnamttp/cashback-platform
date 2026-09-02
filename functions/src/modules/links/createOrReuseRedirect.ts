import * as functions from 'firebase-functions';
import { admin, db } from '../../lib/admin';
import { REDIRECT_CACHE_MAX_LIFETIME_DAYS, REDIRECT_CACHE_TTL_HOURS, REGION } from '../../lib/constants';
import { generateShortCode, sha256Hex } from '../../util/ids';
import { buildAffiliateUrl, detectPlatform, normalizeProductUrl } from '../../util/normalizeUrl';

const TTL_MS = REDIRECT_CACHE_TTL_HOURS * 60 * 60 * 1000;
const MAX_LIFETIME_MS = REDIRECT_CACHE_MAX_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

function goUrl(code: string) {
  return `/go/${code}`;
}

/**
 * Core of "chống phạt oan click nhiều lần": the cache key (userKey) is
 * derived only from the user + normalized product URL, never from how many
 * times they've looked at it. So re-pasting the same link — however many
 * times, however far apart within the TTL — always resolves back to the
 * same tracking code instead of minting a new one, which is what keeps the
 * marketplace's click/order history clean for that code. Pasting a
 * different product naturally produces a different userKey, so a genuinely
 * new product still gets a fresh code with no special-casing needed.
 */
export const createOrReuseRedirect = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Cần đăng nhập để tạo link hoàn tiền.');
  }
  const uid = context.auth.uid;
  const productUrl = typeof data?.productUrl === 'string' ? data.productUrl.trim() : '';
  if (!productUrl) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu link sản phẩm.');
  }

  const platform = detectPlatform(productUrl);
  if (!platform) {
    return { status: 'unsupported' as const };
  }

  const normalized = normalizeProductUrl(productUrl);
  const userKey = `${uid}_${sha256Hex(normalized)}`;
  const now = Date.now();

  const existingSnap = await db.collection('redirectCache')
    .where('userKey', '==', userKey)
    .where('status', '==', 'ACTIVE')
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const existingDoc = existingSnap.docs[0];
    const existing = existingDoc.data();
    const createdAtMs: number = existing.createdAt?.toMillis?.() ?? now;
    const expiresAtMs: number = existing.expiresAt?.toMillis?.() ?? 0;
    const stillFresh = now < expiresAtMs && now - createdAtMs < MAX_LIFETIME_MS;

    if (stillFresh) {
      const newExpiry = Math.min(now + TTL_MS, createdAtMs + MAX_LIFETIME_MS);
      await existingDoc.ref.update({
        lastHitAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(newExpiry),
        hitCount: admin.firestore.FieldValue.increment(1),
      });
      return {
        status: 'supported' as const,
        code: existingDoc.id,
        redirectUrl: goUrl(existingDoc.id),
        platform,
        cacheHit: true,
      };
    }

    await existingDoc.ref.update({ status: 'SUPERSEDED' });
  }

  const code = generateShortCode();
  const destinationUrl = buildAffiliateUrl(platform, normalized, code);

  await db.collection('redirectCache').doc(code).set({
    userId: uid,
    userKey,
    platform,
    normalizedProductUrl: normalized,
    originalUrl: productUrl,
    destinationUrl,
    status: 'ACTIVE',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastHitAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(now + TTL_MS),
    hitCount: 0,
  });

  return { status: 'supported' as const, code, redirectUrl: goUrl(code), platform, cacheHit: false };
});
