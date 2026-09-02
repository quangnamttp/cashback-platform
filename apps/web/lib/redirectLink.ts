'use client';

import { collection, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { getFirebaseDb } from './firebase';
import { generateShortCode } from './ids';

export type Platform = 'SHOPEE' | 'TIKTOK_SHOP' | 'LAZADA';

export const MARKETPLACE_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'SHOPEE', label: 'Shopee' },
  { value: 'TIKTOK_SHOP', label: 'TikTok Shop' },
  { value: 'LAZADA', label: 'Lazada' },
];

const PLATFORM_PATTERNS: { platform: Platform; pattern: RegExp }[] = [
  { platform: 'SHOPEE', pattern: /shopee\.(vn|com)/i },
  { platform: 'TIKTOK_SHOP', pattern: /(tiktok\.com\/.*shop|vt\.tiktok\.com|shop\.tiktok\.com)/i },
  { platform: 'LAZADA', pattern: /lazada\.(vn|com)/i },
];

export function detectPlatform(rawUrl: string): Platform | null {
  const found = PLATFORM_PATTERNS.find((p) => p.pattern.test(rawUrl));
  return found ? found.platform : null;
}

/**
 * A voucher with no `marketplaces` tag (or an empty array) is treated as
 * universal — applies everywhere — which is also the correct behaviour for
 * every voucher created before this field existed. `platform === null`
 * (no product link pasted yet, or an unsupported link) means there's
 * nothing to match against, so nothing is dimmed.
 */
export function voucherMatchesMarketplace(marketplaces: string[] | undefined, platform: Platform | null): boolean {
  if (!platform) return true;
  if (!marketplaces || marketplaces.length === 0) return true;
  return marketplaces.includes(platform);
}

const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'spm', 'ref', 'sp_atk', 'xptdk'];

/** Strips tracking params so repeated views of the same product resolve to the same cache key. */
export function normalizeProductUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    TRACKING_PARAMS.forEach((p) => url.searchParams.delete(p));
    url.hash = '';
    url.searchParams.sort();
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return rawUrl.trim();
  }
}

const AFFILIATE_TAG_PARAM: Record<Platform, string> = {
  SHOPEE: 'af_sub_id',
  TIKTOK_SHOP: 'sub_id',
  LAZADA: 'aff_sub',
};

/**
 * Deliberately NOT a real Shopee/TikTok Shop/Lazada affiliate link — that
 * was investigated and ruled out (2026-09, confirmed against a real Shopee
 * affiliate short link the site owner generated from their own approved
 * account): resolving `s.shopee.vn/<code>` shows every real Shopee
 * affiliate link carries a `credential_token` and `gads_t_sig` — opaque,
 * per-link tokens cryptographically signed by Shopee's own backend via a
 * mobile-measurement-partner integration at link-creation time. There is
 * no formula to reproduce those for an arbitrary pasted product URL; doing
 * it for real requires calling Shopee's authenticated affiliate API with a
 * secret key, which cannot be done safely from a static site with no
 * server (the key would ship in the public JS bundle). The same applies to
 * TikTok Shop's and Lazada's own affiliate/creator link systems.
 *
 * So this only tags the ORIGINAL product URL with our own tracking code as
 * a sub-id-shaped param (`af_sub_id`/`sub_id`/`aff_sub` — the real param
 * *names* each platform's affiliate links use, chosen so the destination
 * URL still looks like a normal deep link) purely for OUR OWN internal
 * click/order reconciliation (matching a /go?code= hit to a redirectCache
 * row) — it does not make the marketplace attribute commission to this
 * site. That's why every order and its real commission amount is entered
 * by hand in /manager/orders: there is no automated affiliate payout
 * signal to trust on a Spark-plan, backend-free deployment. Confirmed with
 * the site owner as the intended, permanent design — not a stopgap.
 */
function buildAffiliateUrl(platform: Platform, normalizedUrl: string, trackingCode: string): string {
  try {
    const url = new URL(normalizedUrl);
    url.searchParams.set(AFFILIATE_TAG_PARAM[platform], trackingCode);
    url.searchParams.set('utm_source', 'hoantiendv');
    url.searchParams.set('utm_medium', 'cashback');
    return url.toString();
  } catch {
    return normalizedUrl;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const REDIRECT_CACHE_TTL_MS = 168 * 60 * 60 * 1000; // sliding 7 days
const REDIRECT_CACHE_MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // hard cap 30 days

export function goUrl(code: string) {
  return `/go?code=${code}`;
}

export type CreateRedirectResult =
  | { status: 'unsupported' }
  | { status: 'supported'; code: string; redirectUrl: string; destinationUrl: string; platform: Platform; cacheHit: boolean };

/**
 * Best-effort — called once fetchProductPreview (lib/productPreview.ts)
 * resolves, which happens AFTER createOrReuseRedirect already created the
 * doc (the scrape is async and must never block generating the tracking
 * link itself). Lets /link-history render a real thumbnail/title/price
 * for past links instead of only the moment they were first pasted.
 */
export async function savePreviewToRedirect(
  code: string,
  preview: { title?: string; image?: string; price?: number },
): Promise<void> {
  try {
    const db = getFirebaseDb();
    const update: Record<string, unknown> = {};
    if (preview.title) update.title = preview.title;
    if (preview.image) update.image = preview.image;
    if (preview.price) update.price = preview.price;
    if (Object.keys(update).length === 0) return;
    await updateDoc(doc(db, 'redirectCache', code), update);
  } catch {
    // best-effort only
  }
}

/**
 * Best-effort hit tracking (sliding TTL refresh + hitCount), extracted so it
 * can run from TWO places: /go/page.tsx (an externally-shared link opened
 * with no live app state) AND a same-session "Mua ngay" click that now
 * navigates straight to destinationUrl instead of bouncing through /go (see
 * buildAffiliateUrl's flow below) — both need the exact same accounting.
 * Never awaited by a navigation click; a failed write here must never block
 * or delay the user actually reaching the marketplace.
 */
export async function recordRedirectHit(code: string): Promise<void> {
  try {
    const db = getFirebaseDb();
    const ref = doc(db, 'redirectCache', code);
    const snap = await getDoc(ref);
    const data = snap.data();
    if (!data) return;
    const now = Date.now();
    const createdAtMs: number = data.createdAt?.toMillis?.() ?? now;
    const newExpiry = Math.min(now + REDIRECT_CACHE_TTL_MS, createdAtMs + REDIRECT_CACHE_MAX_LIFETIME_MS);
    await updateDoc(ref, {
      lastHitAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(newExpiry),
      hitCount: increment(1),
    });
  } catch {
    // best-effort only — never surfaced to the user
  }
}

/**
 * Runs entirely in the browser now (was a Cloud Function). Same cache key
 * (uid + hash of the normalized product URL) as before, so re-pasting the
 * same link — however many times, however far apart within the TTL —
 * always resolves back to the same tracking code instead of minting a new
 * one, which is what keeps the marketplace's click/order history clean for
 * that code. A genuinely different product naturally gets a different key.
 */
export async function createOrReuseRedirect(uid: string, productUrl: string): Promise<CreateRedirectResult> {
  const platform = detectPlatform(productUrl);
  if (!platform) {
    return { status: 'unsupported' };
  }

  const normalized = normalizeProductUrl(productUrl);
  const userKey = `${uid}_${await sha256Hex(normalized)}`;
  const db = getFirebaseDb();
  const now = Date.now();

  // orderBy('createdAt','desc') is deliberate, not cosmetic: two identical
  // submissions racing (e.g. the same product pasted in two tabs within
  // the same instant, before either write commits) can transiently leave
  // more than one ACTIVE doc for this userKey. Without a tiebreaker,
  // limit(1) picks whichever the query engine returns first — not
  // guaranteed stable — so a later visit could flip between two different
  // codes for what's supposed to be one tracked product, splitting the
  // click history the marketplace sees under two different sub_ids
  // instead of one. Always taking the newest makes that deterministic.
  const existingSnap = await getDocs(
    query(
      collection(db, 'redirectCache'),
      where('userKey', '==', userKey),
      where('status', '==', 'ACTIVE'),
      orderBy('createdAt', 'desc'),
      limit(1),
    ),
  );

  if (!existingSnap.empty) {
    const existingDoc = existingSnap.docs[0];
    const existing = existingDoc.data();
    const createdAtMs: number = existing.createdAt?.toMillis?.() ?? now;
    const expiresAtMs: number = existing.expiresAt?.toMillis?.() ?? 0;
    const stillFresh = now < expiresAtMs && now - createdAtMs < REDIRECT_CACHE_MAX_LIFETIME_MS;

    if (stillFresh) {
      const newExpiry = Math.min(now + REDIRECT_CACHE_TTL_MS, createdAtMs + REDIRECT_CACHE_MAX_LIFETIME_MS);
      await updateDoc(existingDoc.ref, {
        lastHitAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(newExpiry),
        hitCount: increment(1),
      });
      return {
        status: 'supported',
        code: existingDoc.id,
        redirectUrl: goUrl(existingDoc.id),
        destinationUrl: existing.destinationUrl,
        platform,
        cacheHit: true,
      };
    }

    await updateDoc(existingDoc.ref, { status: 'SUPERSEDED' });
  }

  const code = generateShortCode();
  const destinationUrl = buildAffiliateUrl(platform, normalized, code);

  await setDoc(doc(db, 'redirectCache', code), {
    userId: uid,
    userKey,
    platform,
    normalizedProductUrl: normalized,
    originalUrl: productUrl,
    destinationUrl,
    status: 'ACTIVE',
    createdAt: serverTimestamp(),
    lastHitAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + REDIRECT_CACHE_TTL_MS),
    hitCount: 0,
  });

  return { status: 'supported', code, redirectUrl: goUrl(code), destinationUrl, platform, cacheHit: false };
}
