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

// The TikTok Shop alternative also covers its two mobile share-shortlink
// forms (vm.tiktok.com/t/..., vi-vn.tiktok.com/t/...) — the SAME forms
// isShortlink (lib/productPreview.ts) already treats as needing a resolve
// step, so a raw, still-unresolved one of these must still be detectable
// as TikTok Shop here too (see get-cashback-link/page.tsx's resolve_error
// handling, which needs a platform for the raw shortlink when resolving it
// fails).
const PLATFORM_PATTERNS: { platform: Platform; pattern: RegExp }[] = [
  { platform: 'SHOPEE', pattern: /shopee\.(vn|com)/i },
  { platform: 'TIKTOK_SHOP', pattern: /(tiktok\.com\/.*shop|vt\.tiktok\.com|shop\.tiktok\.com|(vi-vn\.|vm\.)?tiktok\.com\/t\/)/i },
  { platform: 'LAZADA', pattern: /lazada\.(vn|com)/i },
];

export function detectPlatform(rawUrl: string): Platform | null {
  const found = PLATFORM_PATTERNS.find((p) => p.pattern.test(rawUrl));
  return found ? found.platform : null;
}

/**
 * Real customers regularly paste/type a link with no http(s):// scheme
 * (confirmed live 2026-09-09: a real customer's TikTok short-link paste was
 * literally "vt.tiktok.com/..." with no scheme). Every scheme-anchored
 * check downstream silently mishandles that: isShortlink's `^https?:\/\/`
 * patterns simply don't match (so a real shortlink stops being recognized
 * as one, skipping the resolve step entirely), and `new URL()` inside
 * hasProductIdSignature/normalizeProductUrl/extractTikTokProductId throws
 * on a schemeless string — the combination silently produced 'invalid_link'
 * for a perfectly valid product URL. Called once, right where the raw
 * textbox value is first read, so every downstream check always sees an
 * absolute URL.
 */
export function ensureUrlScheme(rawInput: string): string {
  const trimmed = rawInput.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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

/**
 * Strips tracking params so repeated views of the same product resolve to
 * the same cache key. TikTok Shop is a special case: resolving a
 * vt.tiktok.com shortlink (see resolveShortlink in lib/productPreview.ts)
 * lands on a URL like shop.tiktok.com/vn/pdp/<id>?chain_key=...&checksum=
 * ...&encode_params=...&sec_user_id=...&trackParams=...&u_code=...
 * (verified live 2026-09-09) — a dozen-plus params that identify the SHARE
 * EVENT, not the product, several containing large opaque encoded blobs.
 * The product id is already fully present in the path, so for TikTok Shop
 * the whole query string is dropped rather than trying to enumerate an
 * ever-changing list of TikTok-internal param names — sending that raw
 * share-tracking URL to ACCESSTRADE's product_url field risks their own
 * product-id-from-URL parser (see extractTikTokProductId below — the exact
 * same id is also sent explicitly as product_id so ACCESSTRADE never has
 * to depend on that parser at all) failing to recognize it.
 */
export function normalizeProductUrl(rawUrl: string, platform?: Platform | null): string {
  try {
    const url = new URL(rawUrl);
    if (platform === 'TIKTOK_SHOP') {
      return `${url.origin}${url.pathname}`;
    }
    TRACKING_PARAMS.forEach((p) => url.searchParams.delete(p));
    url.hash = '';
    url.searchParams.sort();
    return `${url.origin}${url.pathname}${url.search}`;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * TikTok Shop's product id is the last path segment of its canonical
 * product URL (.../pdp/<digits>, confirmed live 2026-09-09) — extracted so
 * it can be sent as the API's own explicit `product_id` field alongside
 * product_url, instead of relying solely on ACCESSTRADE deriving it from
 * the URL (their docs say they do, but don't guarantee it handles every
 * path shape — see normalizeProductUrl's comment above). Returns undefined
 * rather than guessing when the last segment isn't a plain digit run.
 */
export function extractTikTokProductId(productUrl: string): string | undefined {
  try {
    const segments = new URL(productUrl).pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1];
    return last && /^\d{6,}$/.test(last) ? last : undefined;
  } catch {
    return undefined;
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
  | 'unauthenticated'
  // A share/shortlink (vt.tiktok.com, s.shopee.vn, c.la.lazada.vn) that
  // could not be resolved to its real product URL (the resolver Worker is
  // unreachable/not configured, or the marketplace's own redirect chain
  // failed). Deliberately distinct from not_in_campaign: we never even
  // attempted ACCESSTRADE link creation in this case, so there is zero
  // evidence about commission either way — must never be worded as "no
  // commission" (see get-cashback-link/page.tsx, which already routes any
  // reason other than not_in_campaign to the neutral "technical" copy).
  | 'resolve_error';

type AffiliateLinkAttempt =
  | { affLink: string; commission?: { amount: number; currency: string }; commissionRate?: number }
  | { reason: AffiliateLinkFailureReason };

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
async function tryCreateRealAffiliateLink(
  platform: Platform,
  productUrl: string,
  subId: string,
  productId?: string,
): Promise<AffiliateLinkAttempt> {
  if (!ACCESSTRADE_WORKER_URL) return { reason: 'worker_not_configured' };
  try {
    const idToken = await getFirebaseAuth().currentUser?.getIdToken();
    if (!idToken) return { reason: 'not_authenticated' };
    const res = await fetch(`${ACCESSTRADE_WORKER_URL}/create-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, platform, productUrl, subId, ...(productId ? { productId } : {}) }),
    });
    if (!res.ok) return { reason: 'worker_unreachable' };
    const json: {
      supported: boolean;
      affLink?: string;
      reason?: AffiliateLinkFailureReason;
      commission?: { amount: number; currency: string } | null;
      commissionRate?: number | null;
    } = await res.json();
    if (json.supported && json.affLink) {
      return {
        affLink: json.affLink,
        ...(json.commission ? { commission: json.commission } : {}),
        ...(json.commissionRate ? { commissionRate: json.commissionRate } : {}),
      };
    }
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
  // isRealAffiliateLink flag. estimatedCommission is ONLY ever the real
  // figure ACCESSTRADE's own create-link response returned (TikTok Shop's
  // v2 API alone documents this field, confirmed live 2026-09-09) —
  // undefined for every other case, including Shopee/Lazada, which never
  // received one from ACCESSTRADE to begin with (v1 endpoint doesn't
  // document it). This is the platform's RAW, undivided commission — never
  // rendered bare anywhere; get-cashback-link/page.tsx runs it through
  // computeCommissionSplit (lib/orderEntry.ts, the exact same function the
  // real ledger write uses) before showing a customer-facing "Dự kiến
  // hoàn" estimate, so what the customer sees is always their split
  // amount, never the marketplace's own cut. Purely a display value either
  // way — the real ledger amount always comes from the order's own
  // confirmed commission at settlement time, never from this estimate.
  | {
      status: 'supported';
      code: string;
      redirectUrl: string;
      destinationUrl: string;
      platform: Platform;
      cacheHit: boolean;
      estimatedCommission?: { amount: number; currency: string };
      // Shopee/Lazada's counterpart to estimatedCommission — a RATE
      // (fraction, e.g. 0.018) instead of an amount, since neither
      // platform's create-link response ever includes a product price to
      // turn a rate into one (see workers/accesstrade-sync's
      // fetchCampaignCommissionRate for exactly where this real rate is
      // parsed from and its reliability tier — a campaign-wide default,
      // not a per-product exact rate). get-cashback-link/page.tsx combines
      // it with the product's own independently-scraped real price
      // (lib/productPreview.ts) once that resolves, the same way it
      // already combines TikTok's estimatedCommission with
      // computeCommissionSplit — never a guessed placeholder price.
      estimatedCommissionRate?: number;
    };

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

  const normalized = normalizeProductUrl(productUrl, platform);
  const productId = platform === 'TIKTOK_SHOP' ? extractTikTokProductId(productUrl) : undefined;
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
          ...(existing.estimatedCommission ? { estimatedCommission: existing.estimatedCommission } : {}),
          ...(existing.estimatedCommissionRate ? { estimatedCommissionRate: existing.estimatedCommissionRate } : {}),
        };
      }

      // A doc left over from before this fix, cached as "not real" — retry
      // once (the Worker's state may have changed since); a success
      // upgrades it in place, a repeat failure retires it (SUPERSEDED) so
      // it stops being hit on every future paste and this behaves exactly
      // like a brand-new CASE A/B result below — no lingering fake cache.
      const retry = await tryCreateRealAffiliateLink(platform, normalized, existingDoc.id, productId);
      if ('affLink' in retry) {
        const newExpiry = Math.min(now + REDIRECT_CACHE_TTL_MS, createdAtMs + REDIRECT_CACHE_MAX_LIFETIME_MS);
        await updateDoc(existingDoc.ref, {
          destinationUrl: retry.affLink,
          isRealAffiliateLink: true,
          lastHitAt: serverTimestamp(),
          expiresAt: Timestamp.fromMillis(newExpiry),
          hitCount: increment(1),
          ...(retry.commission ? { estimatedCommission: retry.commission } : {}),
          ...(retry.commissionRate ? { estimatedCommissionRate: retry.commissionRate } : {}),
        });
        return {
          status: 'supported',
          code: existingDoc.id,
          redirectUrl: goUrl(existingDoc.id),
          destinationUrl: retry.affLink,
          platform,
          cacheHit: true,
          ...(retry.commission ? { estimatedCommission: retry.commission } : {}),
          ...(retry.commissionRate ? { estimatedCommissionRate: retry.commissionRate } : {}),
        };
      }
      await updateDoc(existingDoc.ref, { status: 'SUPERSEDED' });
      return { status: 'no_tracking', platform, reason: retry.reason, fallbackUrl: productUrl };
    }

    await updateDoc(existingDoc.ref, { status: 'SUPERSEDED' });
  }

  const code = generateShortCode();
  const attempt = await tryCreateRealAffiliateLink(platform, normalized, code, productId);

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
    ...(attempt.commission ? { estimatedCommission: attempt.commission } : {}),
    ...(attempt.commissionRate ? { estimatedCommissionRate: attempt.commissionRate } : {}),
  });

  return {
    status: 'supported',
    code,
    redirectUrl: goUrl(code),
    destinationUrl: attempt.affLink,
    platform,
    cacheHit: false,
    ...(attempt.commission ? { estimatedCommission: attempt.commission } : {}),
    ...(attempt.commissionRate ? { estimatedCommissionRate: attempt.commissionRate } : {}),
  };
}
