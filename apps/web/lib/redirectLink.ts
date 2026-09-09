'use client';

import { collection, doc, getDoc, getDocs, increment, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { getFirebaseAuth, getFirebaseDb } from './firebase';
import { generateShortCode } from './ids';
import { isShortlink } from './productPreview';

// URL of workers/accesstrade-sync (see that Worker's own README/comments) —
// undefined/empty just means real ACCESSTRADE link creation is skipped and
// every product falls back to the existing internal-tag-only link below,
// exactly like before this Worker existed. Same "skip the tier if unset"
// pattern as NEXT_PUBLIC_SCRAPER_WORKER_URL in lib/productPreview.ts.
const ACCESSTRADE_WORKER_URL = process.env.NEXT_PUBLIC_ACCESSTRADE_WORKER_URL;

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
 * Cheap structural check for "does this URL's path even look like it names
 * a real product" — every real product/shop/SKU id on Shopee, TikTok Shop
 * and Lazada is a long run of digits (confirmed live: a real Shopee item
 * id like 24826385591, a real vanity link's 26989828302, Lazada's
 * i{10ish digits}-s{10ish digits}...). A marketing/promo text slug with no
 * id at all (e.g. "shopee.vn/-DEAL-Máy-Massage-...", pasted by a customer
 * who copied the wrong thing) never has one. This can't tell a real-but-
 * unscrapable product link from a fake one (that needs the marketplace's
 * own affiliate API, which we don't have) — it only catches links that
 * don't even have the SHAPE of a product link, which detectPlatform's
 * pure domain check lets straight through today.
 */
export function hasProductIdSignature(rawUrl: string): boolean {
  try {
    return /\d{6,}/.test(new URL(rawUrl).pathname);
  } catch {
    return false;
  }
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

/**
 * Machine-readable reason a real ACCESSTRADE link could NOT be created —
 * surfaced to the UI (in neutral, non-technical wording — see
 * get-cashback-link/page.tsx's own label map) so "not real" is never
 * silent. `not_in_campaign` is the ONLY value that means "this product
 * genuinely has no commission" (the Worker only returns it when
 * ACCESSTRADE's own documented response says so — see that Worker's
 * handleCreateLink); every other value is a technical failure and must
 * never be read as "no commission" — see createOrReuseRedirect below,
 * which still lets the customer buy via the plain original link either
 * way, just with different wording.
 */
export type AffiliateLinkFailureReason =
  | 'worker_not_configured'
  | 'not_authenticated'
  | 'worker_unreachable'
  | 'platform_maintenance'
  | 'not_configured'
  | 'not_in_campaign'
  | 'technical_error'
  | 'unsupported_platform'
  | 'bad_request'
  | 'unauthenticated';

type AffiliateLinkAttempt = { affLink: string } | { reason: AffiliateLinkFailureReason };

/**
 * Asks workers/accesstrade-sync for a real ACCESSTRADE affiliate link —
 * never calls ACCESSTRADE directly (the API key never reaches the
 * browser). Returns a `reason` (never fabricated — always one the Worker
 * or this call site itself actually observed) on ANY failure (worker not
 * configured, platform's campaign not yet approved, network error, the
 * Worker's own DRY_RUN-adjacent "not eligible" answer) so the caller can
 * tell the user exactly why, instead of silently falling back to a link
 * ACCESSTRADE never actually tracks.
 */
async function tryCreateRealAffiliateLink(platform: Platform, productUrl: string, subId: string): Promise<AffiliateLinkAttempt> {
  if (!ACCESSTRADE_WORKER_URL) return { reason: 'worker_not_configured' };
  try {
    const idToken = await getFirebaseAuth().currentUser?.getIdToken();
    if (!idToken) return { reason: 'not_authenticated' };
    const res = await fetch(`${ACCESSTRADE_WORKER_URL}/create-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, platform, productUrl, subId }),
    });
    if (!res.ok) return { reason: 'worker_unreachable' };
    const json: { supported: boolean; affLink?: string; reason?: AffiliateLinkFailureReason } = await res.json();
    if (json.supported && json.affLink) return { affLink: json.affLink };
    return { reason: json.reason ?? 'worker_unreachable' };
  } catch {
    return { reason: 'worker_unreachable' };
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
  | { status: 'invalid_link' }
  // No real ACCESSTRADE link was created — for EITHER reason (genuinely no
  // commission, or a technical failure; `reason` tells them apart, see
  // AffiliateLinkFailureReason's own comment). Never persisted to
  // redirectCache (sections 2/8: no cache for either case) — fallbackUrl
  // is simply the customer's own original, untouched link, safe to open
  // directly with no tracking/attribution claim attached to it at all.
  | { status: 'no_tracking'; platform: Platform; reason: AffiliateLinkFailureReason; fallbackUrl: string }
  // Reaching this status is now itself the proof of a real ACCESSTRADE
  // link (see createOrReuseRedirect below — this variant is only ever
  // returned once tryCreateRealAffiliateLink has actually returned an
  // affLink), so callers no longer need to separately check an
  // isRealAffiliateLink flag.
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
    // A title with no image is the marketplace's generic site-wide
    // fallback (e.g. Shopee serving "Shopee Việt Nam | Mua và Bán…" for a
    // non-existent/invalid product id) — worse than whatever /link-history
    // already has (its own local slug guess), never worth overwriting with.
    if (preview.title && preview.image) update.title = preview.title;
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
  // Skip the shape check on a still-unresolved shortlink (resolveShortlink
  // failed upstream in handleCheck, so the caller fell back to the raw
  // s.shopee.vn/vt.tiktok.com code) — a shortlink's whole point is an
  // opaque code with no product id visible in it, so the signature check
  // doesn't apply and would always wrongly reject it.
  if (!isShortlink(productUrl) && !hasProductIdSignature(productUrl)) {
    return { status: 'invalid_link' };
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
      // Every doc that reaches this point is a real affiliate link — CASE
      // A/B (no commission / technical error) no longer ever create one
      // (see the no-cache path below), so a fresh cache hit is always the
      // real-link case now.
      if (existing.isRealAffiliateLink) {
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

      // A doc left over from before this fix, cached as "not real" — retry
      // once (the Worker's state may have changed since); a success
      // upgrades it in place, a repeat failure retires it (SUPERSEDED) so
      // it stops being hit on every future paste and this behaves exactly
      // like a brand-new CASE A/B result below — no lingering fake cache.
      const retry = await tryCreateRealAffiliateLink(platform, normalized, existingDoc.id);
      if ('affLink' in retry) {
        const newExpiry = Math.min(now + REDIRECT_CACHE_TTL_MS, createdAtMs + REDIRECT_CACHE_MAX_LIFETIME_MS);
        await updateDoc(existingDoc.ref, {
          destinationUrl: retry.affLink,
          isRealAffiliateLink: true,
          lastHitAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(newExpiry),
          hitCount: increment(1),
        });
        return {
          status: 'supported',
          code: existingDoc.id,
          redirectUrl: goUrl(existingDoc.id),
          destinationUrl: retry.affLink,
          platform,
          cacheHit: true,
        };
      }
      await updateDoc(existingDoc.ref, { status: 'SUPERSEDED' });
      return { status: 'no_tracking', platform, reason: retry.reason, fallbackUrl: productUrl };
    }

    await updateDoc(existingDoc.ref, { status: 'SUPERSEDED' });
  }

  const code = generateShortCode();
  const attempt = await tryCreateRealAffiliateLink(platform, normalized, code);

  if (!('affLink' in attempt)) {
    // CASE A (not_in_campaign, confirmed by ACCESSTRADE's own documented
    // response) or CASE B (any other/technical reason) — never persisted
    // to redirectCache either way (sections 2/8: no fake cache for a link
    // that isn't real), customer still buys via their own original link,
    // just distinguished by wording in the UI.
    return { status: 'no_tracking', platform, reason: attempt.reason, fallbackUrl: productUrl };
  }

  await setDoc(doc(db, 'redirectCache', code), {
    userId: uid,
    userKey,
    platform,
    normalizedProductUrl: normalized,
    originalUrl: productUrl,
    destinationUrl: attempt.affLink,
    isRealAffiliateLink: true,
    status: 'ACTIVE',
    createdAt: serverTimestamp(),
    lastHitAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + REDIRECT_CACHE_TTL_MS),
    hitCount: 0,
  });

  return {
    status: 'supported',
    code,
    redirectUrl: goUrl(code),
    destinationUrl: attempt.affLink,
    platform,
    cacheHit: false,
  };
}
