import * as functions from 'firebase-functions';
import { admin, db } from '../../lib/admin';
import { REDIRECT_CACHE_MAX_LIFETIME_DAYS, REDIRECT_CACHE_TTL_HOURS, REGION, WEB_BASE_URL } from '../../lib/constants';

const TTL_MS = REDIRECT_CACHE_TTL_HOURS * 60 * 60 * 1000;
const MAX_LIFETIME_MS = REDIRECT_CACHE_MAX_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
const FALLBACK_PATH = '/get-cashback-link?expired=1';

/**
 * Public redirect endpoint served at /go/<code> via the Hosting rewrite in
 * firebase.json. It only reads/writes Firestore and issues a 302 — it never
 * calls out to Shopee/TikTok/Lazada itself (the user's own browser does
 * that), so this stays within the Spark plan's outbound-network limits.
 */
export const goRedirect = functions.region(REGION).https.onRequest(async (req, res) => {
  const parts = req.path.split('/').filter(Boolean);
  const code = parts[parts.length - 1];

  if (!code) {
    res.redirect(302, `${WEB_BASE_URL}${FALLBACK_PATH}`);
    return;
  }

  const ref = db.collection('redirectCache').doc(code);
  const snap = await ref.get();
  const data = snap.data();
  const now = Date.now();
  const expiresAtMs: number = data?.expiresAt?.toMillis?.() ?? 0;

  if (!snap.exists || data?.status !== 'ACTIVE' || now > expiresAtMs) {
    res.redirect(302, `${WEB_BASE_URL}${FALLBACK_PATH}`);
    return;
  }

  const createdAtMs: number = data.createdAt?.toMillis?.() ?? now;
  const newExpiry = Math.min(now + TTL_MS, createdAtMs + MAX_LIFETIME_MS);

  await ref.update({
    lastHitAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(newExpiry),
    hitCount: admin.firestore.FieldValue.increment(1),
  });
  await ref.collection('hits').add({
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    ip: req.headers['x-forwarded-for'] ?? req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  });

  res.redirect(302, data.destinationUrl);
});
