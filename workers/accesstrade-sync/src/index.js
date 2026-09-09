// ACCESSTRADE integration — two independent jobs in one Worker:
//
//   1. HTTP endpoint `POST /create-link` — the browser (get-cashback-link
//      page) calls this instead of building an affiliate URL itself, so
//      the real ACCESSTRADE API Access Key never reaches client code (see
//      apps/web/lib/redirectLink.ts's call site). Stateless: never touches
//      Firestore, just proxies to the real ACCESSTRADE link-creation
//      endpoints and returns the result (or a clear "not supported yet"
//      answer — never a fabricated link).
//
//   2. Scheduled Cron Trigger (see wrangler.toml) — polls ACCESSTRADE's
//      order-list/order-products endpoints, maps a conversion back to a
//      user via the same redirectCache the web app already uses, and
//      (only once DRY_RUN is turned off — see that var's own comment)
//      creates a PENDING order or claws back a FROZEN/RELEASED one exactly
//      the same way an admin's own manual actions already do. It NEVER
//      creates FROZEN ledger entries itself, and NEVER releases anything —
//      those still require the existing admin-driven approval steps
//      (web /manager/orders + /manager/payouts, or the Telegram buttons
//      workers/telegram-bot already handles unchanged).
//
// Firestore write access: a SEPARATE, narrowly-scoped Firebase Auth
// identity from workers/telegram-bot's isPaymentBot() — see firestore.rules'
// isConversionBot(). Signs in via Identity Toolkit REST and calls the
// Firestore REST API with the resulting ID token, same pattern as
// workers/telegram-bot (no Admin SDK, no Firebase client SDK — this Worker
// has neither available to it).
//
// ============================================================
// EXPLICITLY UNVERIFIED — confirmed real (per ACCESSTRADE's own docs) up to
// a point, then genuinely unknown until tested against a real conversion.
// Every place below relying on one of these is commented individually too.
// ============================================================
//   - Whether `sub1` sent at link-creation time comes back as literally
//     `sub_id1` inside order-products' `data._extra.parameters` — the docs
//     show that field existing in an EXAMPLE, never states it's guaranteed
//     to equal what was sent as sub1. This is the single most important
//     thing to verify with a real conversion before trusting this at all.
//   - since/until format for /v1/order-list: CONFIRMED wrong as Unix
//     seconds — production calls returned HTTP 500 for every merchant.
//     Fixed 2026-09-08 to send ISO 8601 (e.g. 2021-01-01T00:00:00Z) per
//     ACCESSTRADE's own docs, via `.toISOString()`.
//   - Which order-list/order-products field is "the" product name — none
//     of the fields ACCESSTRADE's docs list for either endpoint is an
//     obviously-named product title, so productName below is a generic
//     placeholder including at_product_link for admin reference, not a
//     real scraped title.
// ============================================================

const ACCESSTRADE_BASE = 'https://api.accesstrade.vn';

// /create-link is called from the browser (apps/web/lib/redirectLink.ts),
// cross-origin from whatever origin the static site is served at — the
// real security boundary is the Firebase ID token verified inside
// handleCreateLink, not origin, so '*' costs nothing here. Without this,
// the browser's own CORS preflight (OPTIONS) silently blocks the actual
// POST from ever being sent — confirmed live: wrangler tail showed
// "OPTIONS .../create-link - Ok" with no POST ever following it.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// /v1/order-products is documented at 10 requests/minute, same as
// /v1/order-list — but unlike order-list (called once per platform per
// cron tick), order-products is called once per NEW order found in a
// single tick, which could burst well past that limit if several orders
// land in the same 5-minute window. This delay (>6s) caps the sustained
// rate at <10/min even if every order-list result this tick is brand new.
// Pure wall-clock wait (fetch/timer, not CPU-bound work), so it doesn't
// count against Workers' CPU-time budget on any plan.
const ORDER_PRODUCTS_THROTTLE_MS = 6500;
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function accesstradeApi(env, method, path, { query, body } = {}) {
  const url = new URL(`${ACCESSTRADE_BASE}${path}`);
  if (query) Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v); });
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Token ${env.ACCESSTRADE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`accesstradeApi ${method} ${path}: non-JSON response`, res.status, text.slice(0, 500));
    return { ok: false, status: res.status, json: null };
  }
  if (!res.ok) {
    console.error(`accesstradeApi ${method} ${path} failed:`, res.status, JSON.stringify(json).slice(0, 1000));
  }
  return { ok: res.ok, status: res.status, json };
}

// --- Firestore REST (mirrors workers/telegram-bot/src/index.js's helpers) ---

async function firestoreSignIn(env) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: env.BOT_EMAIL, password: env.BOT_PASSWORD, returnSecureToken: true }),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`firebase sign-in failed: ${json.error?.message || res.status}`);
  return json.idToken;
}

function firestoreDocUrl(env, collectionName, docId) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;
}

async function firestoreGet(env, idToken, collectionName, docId) {
  const res = await fetch(firestoreDocUrl(env, collectionName, docId), { headers: { Authorization: `Bearer ${idToken}` } });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(`firestore get ${collectionName}/${docId} failed: ${json.error?.message || res.status}`);
  return json;
}

function fv(fields, name) {
  const f = fields?.[name];
  if (!f) return undefined;
  if ('stringValue' in f) return f.stringValue;
  if ('integerValue' in f) return Number(f.integerValue);
  if ('doubleValue' in f) return f.doubleValue;
  if ('booleanValue' in f) return f.booleanValue;
  return undefined;
}

async function firestoreCreate(env, idToken, collectionName, docId, fields) {
  const res = await fetch(`${firestoreDocUrl(env, collectionName, docId)}?currentDocument.exists=false`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (res.status === 409 || res.status === 400) return { created: false };
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`firestore create ${collectionName}/${docId} failed: ${json.error?.message || res.status}`);
  return { created: true };
}

async function firestorePatch(env, idToken, collectionName, docId, fields) {
  const mask = Object.keys(fields).map((p) => `updateMask.fieldPaths=${encodeURIComponent(p)}`).join('&');
  const res = await fetch(`${firestoreDocUrl(env, collectionName, docId)}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`firestore patch ${collectionName}/${docId} failed: ${json.error?.message || res.status}`);
  return json;
}

async function firestoreRunQuery(env, idToken, structuredQuery) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery }),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`firestore runQuery failed: ${json.error?.message || res.status}`);
  return (Array.isArray(json) ? json : []).filter((row) => row.document);
}

// --- redirectCache lookup (mirrors apps/web/lib/affiliateProvider.ts's resolveUserIdFromSubId) ---

async function resolveUserIdFromSubId(env, idToken, subId) {
  if (!subId) return null;
  const doc = await firestoreGet(env, idToken, 'redirectCache', subId);
  if (!doc) return null;
  return fv(doc.fields, 'userId') ?? null;
}

// --- 1. Link creation endpoint (POST /create-link) ---

// Verifies the caller is a real signed-in Firebase user without needing
// the Admin SDK — accounts:lookup returns the account for a valid idToken
// and errors for an invalid/expired one, which is what we actually need
// here (this endpoint doesn't need to know WHICH user, just that it's a
// real logged-in one, to keep random internet traffic from draining the
// ACCESSTRADE API quota).
async function verifyFirebaseIdToken(env, idToken) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${env.FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.users?.[0]?.localId ?? null;
}

const PLATFORM_CONFIG = {
  SHOPEE: (env) => ({ campaignId: env.ACCESSTRADE_CAMPAIGN_SHOPEE }),
  LAZADA: (env) => ({ campaignId: env.ACCESSTRADE_CAMPAIGN_LAZADA }),
};

// Separate from "is campaign_id/merchant filled in" on purpose — Lazada's
// real values are stored below (ready for the day its campaign is
// approved) while staying fully inert: this is the ONE switch that turns
// it on later, without needing campaign_id/merchant to ever be blanked
// out or the code touched again. ACCESSTRADE_ENABLED_PLATFORMS is a plain
// comma-separated var (see wrangler.toml), not a secret.
function isPlatformEnabled(env, platform) {
  const list = (env.ACCESSTRADE_ENABLED_PLATFORMS || '').split(',').map((p) => p.trim());
  return list.includes(platform);
}

// Every field the docs list for each create-link endpoint, all optional
// except productUrl/subId — today's web caller (lib/redirectLink.ts) only
// ever sends subId (sub1), but the endpoint itself is ready to carry
// sub2-4/productId/UTM the moment there's real data for them (e.g. sub2
// for a referral code), without needing another round of changes here.
function buildTrackingFields(body) {
  const fields = {};
  if (body.subId) fields.sub1 = body.subId;
  if (body.sub2) fields.sub2 = body.sub2;
  if (body.sub3) fields.sub3 = body.sub3;
  if (body.sub4) fields.sub4 = body.sub4;
  // Own marketing attribution only (rides alongside, never instead of, the
  // real ACCESSTRADE sub-id tracking above) — same values the old
  // internal-tag-only link used, kept for consistency.
  fields.utm_source = body.utmSource || 'hoantiendv';
  fields.utm_medium = body.utmMedium || 'cashback';
  if (body.utmCampaign) fields.utm_campaign = body.utmCampaign;
  if (body.utmContent) fields.utm_content = body.utmContent;
  return fields;
}

// Shopee/Lazada commission at link-creation time — INVESTIGATED
// 2026-09-09, no working source found:
//   - /v1/product_link/create's own response never includes one
//     (confirmed against ACCESSTRADE's own docs, and against 2 real
//     successful responses this session — only aff_link/short_link).
//   - /v1/commission_policies?camp_id=X (documented, looked like exactly
//     the right endpoint — a campaign-wide `default` policy needing no
//     product/category lookup) returns a REAL, live 404 Not Found from
//     ACCESSTRADE's actual server for both the Shopee and Lazada
//     campaign_id on this account (confirmed via wrangler tail against 2
//     fresh real requests) — documented but not actually live/deployed on
//     their side, or requires something undocumented. Re-check this if
//     ACCESSTRADE's docs are ever updated; the request shape that 404'd
//     was GET /v1/commission_policies?camp_id=<campaign_id>.
//   - /v1/product_detail requires a transaction_id that only exists AFTER
//     a real click — unusable before a customer has even bought anything.
//   - /v1/datafeeds cannot be searched by product URL, and only returns a
//     text category slug (not ACCESSTRADE's numeric category_id even if
//     it could be searched) — no way to map an arbitrary pasted URL to a
//     specific product/category in it.
// Given no real data source exists right now, Shopee/Lazada correctly
// show "Đang xác định..." (see get-cashback-link/page.tsx) rather than a
// guessed number — this is the honest, current state, not a shortcut.
//
// FOLLOW-UP investigation 2026-09-09, part 1: GET /v1/cashback/campaigns
// (the "API Get campaign NEW" doc — a different, newer endpoint than the
// dead commission_policies above) looked promising (structured JSON with
// min/max_commission and a per-category all_commissions[] array) but
// returns a REAL {"code":"PX00401","message":"Invalid token"} on this
// account's key — same documented Authorization: Token {{access_key}}
// format as every working endpoint, confirmed against the docs a second
// time to rule out a transcription error. This account is not enrolled
// for whatever tier gates this endpoint; not something fixable in code.
//
// FOLLOW-UP part 2 — WORKING: the CONFIRMED-working /v1/campaigns (same
// endpoint used to look up category/description elsewhere) returns each
// campaign's real, live commission policy as free-text HTML in
// description.commission_policy — verified live against Shopee's and
// Lazada's actual campaign objects (campaign_id from wrangler.toml):
//   Lazada: a clean "Ngành hàng | Mức hoa hồng gốc trực tiếp | ... gián
//     tiếp" table — 36/38 real categories at a flat 7.00% direct rate (2
//     listed exceptions: "Tạp hóa" 2.20%, "Điện thoại & Máy tính bảng" 0%
//     from 10/7/2025). Parsed below as the MODE of the direct-rate column
//     — computed from the real table, not a hardcoded constant, and
//     correct for ~95% of real categories today.
//   Shopee: an explicit "Hoa hồng khách hàng cũ: 1.8%" (existing
//     customer) vs "...khách hàng mới: 24%" (new customer, a time-limited
//     acquisition bonus) label, further broken down by category — every
//     real product category shows the SAME 1.8%/24% split (only a
//     handful of non-physical-product categories — vouchers, food
//     delivery, cinema, pet care, "khác" — are 0%). The EXISTING-customer
//     rate is used as the conservative default: most site visitors
//     already have a Shopee account, and defaulting to the much higher
//     new-customer promo would systematically overstate the typical
//     shopper's real cashback.
// Neither text gives a product PRICE (needed to turn a % rate into a real
// ₫ amount) — Shopee/Lazada's create-link response never has one either.
// So this returns a RATE (not amount) — apps/web combines it with the
// product's own real scraped price (lib/productPreview.ts, independent of
// ACCESSTRADE) once that resolves, same as how the preview thumbnail/
// title already arrive asynchronously. No category/customer-type
// resolution for a SPECIFIC pasted product is possible (same URL→
// category gap documented above), so this is explicitly the campaign-wide
// modal/conservative-default tier, not an exact per-product rate — see
// this file's own README-level notes and get-cashback-link/page.tsx's
// rendering for how that's kept honest to the customer (never shown as
// more precise than it is).
function stripHtml(raw) {
  return String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Hoa hồng khách hàng cũ: 1.8%" — a single labeled value, not a table;
// simplest and most stable pattern to anchor on. Returns undefined (never
// a guessed fallback) if ACCESSTRADE ever rewords this — the caller
// degrades to "Đang xác định..." exactly like a missing field would.
function parseShopeeExistingCustomerRate(commissionPolicyHtml) {
  const text = stripHtml(commissionPolicyHtml);
  const m = /Hoa hồng khách hàng cũ:\s*([\d.,]+)\s*%/i.exec(text);
  if (!m) return undefined;
  const pct = parseFloat(m[1].replace(',', '.'));
  return Number.isFinite(pct) && pct > 0 ? pct / 100 : undefined;
}

// Table rows look like "<Ngành hàng name> 7.00% 3.50%" once HTML-stripped
// (category name, direct %, indirect %) — extracts every row, then takes
// the MODE of the direct-rate column as the representative default (not
// picking a bound, not hardcoding — literally the rate that applies to
// the most real categories in today's real table). Returns undefined if
// fewer than a handful of rows parse (format changed enough that a mode
// wouldn't be trustworthy) rather than trusting a thin/garbled result.
function parseLazadaModalDirectRate(commissionPolicyHtml) {
  const text = stripHtml(commissionPolicyHtml);
  const rowRe = /([\p{L}][\p{L}0-9À-ỹ ,&()/-]*?)\s+([\d.,]+)%(?:\s*\([^)]*\))?\s+([\d.,]+)%(?:\s*\([^)]*\))?/gu;
  const rates = [];
  let m;
  while ((m = rowRe.exec(text)) !== null) {
    const direct = parseFloat(m[2].replace(',', '.'));
    if (Number.isFinite(direct)) rates.push(direct);
  }
  if (rates.length < 10) return undefined;
  const freq = new Map();
  for (const r of rates) freq.set(r, (freq.get(r) || 0) + 1);
  const [modeRate] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
  return modeRate > 0 ? modeRate / 100 : undefined;
}

const CAMPAIGN_COMMISSION_RATE_CACHE_TTL_S = 86400; // policy text changes at most monthly per its own "áp dụng từ" wording

async function fetchCampaignCommissionRate(env, platform, campaignId) {
  if (!campaignId) return undefined;
  const cacheKey = new Request(`https://campaign-commission-rate-cache.internal/?campaign_id=${encodeURIComponent(campaignId)}`);
  const cache = caches.default;
  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const { rate } = await cached.json();
      return rate;
    }
  } catch (err) {
    console.error(`campaign commission rate cache read failed (${platform}):`, err.message);
  }

  const { ok, json } = await accesstradeApi(env, 'GET', '/v1/campaigns', { query: { campaign_id: campaignId } });
  if (!ok || !json?.data?.[0]) {
    console.error(`campaign commission rate fetch failed (${platform}, campaign_id=${campaignId}):`, JSON.stringify(json));
    return undefined;
  }
  const commissionPolicyHtml = json.data[0].description?.commission_policy;
  const rate = platform === 'SHOPEE'
    ? parseShopeeExistingCustomerRate(commissionPolicyHtml)
    : parseLazadaModalDirectRate(commissionPolicyHtml);

  console.log(`campaign commission rate (${platform}, campaign_id=${campaignId}): parsed rate=${rate}`);

  try {
    await cache.put(cacheKey, new Response(JSON.stringify({ rate: rate ?? null }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CAMPAIGN_COMMISSION_RATE_CACHE_TTL_S}` },
    }));
  } catch (err) {
    console.error(`campaign commission rate cache write failed (${platform}):`, err.message);
  }
  return rate;
}

// Real product PRICE for Shopee/Lazada, needed to turn commissionRate into
// an actual ₫ amount — neither platform's create-link response, nor any
// working ACCESSTRADE API, nor a plain fetch() of the product page itself
// (client-rendered SPA, confirmed live) can supply one. Investigated and
// ruled out (2026-09-09) before finding this:
//   - Shopee's own public item API (shopee.vn/api/v4/item/get, the same
//     one their SPA calls client-side) — real, live-tested from BOTH a
//     plain curl AND from this Worker's own Cloudflare edge network,
//     both blocked identically ({"error":90309999}, HTTP 403). Confirmed
//     via external sources (Apify's own Shopee-scraper issue tracker,
//     scraping.club's analysis) this is Shopee's fingerprint-based
//     anti-bot gate — NOT bypassable via headers/cookies/proxies, only by
//     full browser automation (which no free Cloudflare Workers-based
//     approach can do) — every real open-source Shopee scraper found
//     that actually extracts price uses Selenium/Playwright, none work
//     via plain HTTP fetch.
//   - Lazada's own equivalent — no plain/unsigned public endpoint found;
//     its real page HTML (fetched live) references no api.lazada.vn/
//     h5api-style call, consistent with the Alibaba-family "mtop" signed-
//     request pattern (HMAC signing with an app secret this account
//     doesn't have) used elsewhere in that ecosystem.
// WORKING SOURCE FOUND: ACCESSTRADE documents a public, unauthenticated
// static datafeed CSV per merchant — http://datafeed.accesstrade.me/
// <domain>.csv (e.g. shopee.vn.csv) — confirmed live: real, current data
// (Last-Modified same day), columns "sku","name","url","price",
// "discount","image","desc","category", url in the canonical
// shopee.vn/product/<shopid>/<itemid> form. Lazada's equivalent
// (lazada.vn.csv) exists but is CURRENTLY EMPTY (header row only, 65
// bytes) — consistent with its campaign having been approved only
// 2026-09-07, likely not yet synced on ACCESSTRADE's side; re-check
// later as the campaign matures. Same lookupDatafeedProduct function
// handles both — Lazada will start working automatically the day
// ACCESSTRADE populates it, no code change needed.
//
// ALSO INVESTIGATED for Lazada specifically (2026-09-09), since the CSV
// being empty isn't proof nothing else works: the ACCESSTRADE Datafeed
// API (GET /v1/datafeeds?domain=lazada.vn, distinct from the static CSV)
// DOES have real, current data (confirmed live — real name/price/image
// per row) — but `total` is 1,055,719 products, the endpoint has no
// URL/keyword/product_id search (only price/discount RANGE filters, and
// the `campaign` param was tested and does NOT narrow the result set at
// all — same total, same first row, for every value tried), so finding
// one specific customer-pasted product would need brute-force pagination
// through up to ~21,000 pages at 50/row — genuinely infeasible (would
// take many hours to days even ignoring this endpoint's own rate limit).
// Ruled out for per-URL lookup; not used anywhere in this file.
//
// The Shopee file is ~18.5MB — too large to safely response.text() +
// parse on Workers Free's 10ms-CPU-time-per-invocation budget (the
// network transfer itself doesn't count against that budget, but
// decoding/parsing tens of thousands of rows into memory does). Instead
// this streams the response body in chunks and does a plain substring
// search for the exact canonical URL (quoted, as it appears in the CSV)
// — V8's native string search is fast enough per chunk to stay well
// under budget, and the read stops the moment a match is found (or the
// stream ends). Because `url` is column 3 and `price` is column 4 (BEFORE
// the free-text `desc` column, which is the one field that can contain
// embedded newlines inside its quotes), reading the few characters right
// after a url match is always a clean, unambiguous price field — this
// never needs full quote-aware CSV row parsing.
const DATAFEED_CSV_URL = { SHOPEE: 'http://datafeed.accesstrade.me/shopee.vn.csv', LAZADA: 'http://datafeed.accesstrade.me/lazada.vn.csv' };
const DATAFEED_SEARCH_BUFFER_CAP = 200000; // characters kept in memory while scanning — bounded regardless of file size

function extractShopeeIds(productUrl) {
  const m = /-i\.(\d+)\.(\d+)/.exec(productUrl);
  return m ? { shopId: m[1], itemId: m[2] } : null;
}

// Datafeed URLs are the canonical shopee.vn/product/<shopid>/<itemid> form
// (confirmed live in real rows) — a customer's pasted pretty-slug URL
// (.../ten-san-pham-i.<shopid>.<itemid>) must be rebuilt into that exact
// shape before it can match. Returns null (never guesses a URL) when the
// ids can't be extracted.
function canonicalShopeeDatafeedUrl(productUrl) {
  const ids = extractShopeeIds(productUrl);
  return ids ? `https://shopee.vn/product/${ids.shopId}/${ids.itemId}` : null;
}

// Row shape (confirmed live): "sku","name","url","price","discount",
// "image","desc","category" — url is column 3, so `name` is the field
// immediately BEFORE the url match (must look backward) while price/
// discount/image are the three fields immediately AFTER it (look
// forward) — both stop well short of `desc`, the one field that can
// contain embedded newlines/commas inside its quotes, so neither
// direction ever needs full quote-aware CSV parsing.
const DATAFEED_ROW_BACKWARD_WINDOW = 4000; // generous bound for "sku","name" — real product names are rarely anywhere close to this long
const DATAFEED_FORWARD_FIELD_RE = /^\s*,\s*"([\d.]*)"\s*,\s*"([\d.]*)"\s*,\s*"([^"]*)"/; // price, discount, image
const DATAFEED_NAME_BACKWARD_RE = /"([^"]{0,300})"\s*,\s*$/; // captures the field right before the match point

async function lookupDatafeedProduct(platform, productUrl) {
  const feedUrl = DATAFEED_CSV_URL[platform];
  if (!feedUrl) return undefined;
  const searchUrl = platform === 'SHOPEE' ? canonicalShopeeDatafeedUrl(productUrl) : productUrl;
  if (!searchUrl) return undefined;
  const needle = `"${searchUrl}"`;

  const res = await fetch(feedUrl);
  if (!res.ok || !res.body) return undefined;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let foundIdx = -1;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (!done) carry += decoder.decode(value, { stream: true });
      if (foundIdx === -1) foundIdx = carry.indexOf(needle);
      if (foundIdx !== -1) {
        const after = carry.slice(foundIdx + needle.length);
        const fwd = DATAFEED_FORWARD_FIELD_RE.exec(after);
        if (fwd) {
          const before = carry.slice(Math.max(0, foundIdx - DATAFEED_ROW_BACKWARD_WINDOW), foundIdx);
          const nameMatch = DATAFEED_NAME_BACKWARD_RE.exec(before);
          const price = fwd[1] ? Number(fwd[1]) : undefined;
          return {
            name: nameMatch ? nameMatch[1] : undefined,
            price: price && price > 0 ? price : undefined,
            discount: fwd[2] ? Number(fwd[2]) : undefined,
            image: fwd[3] || undefined,
          };
        }
        if (done) return undefined;
        continue; // forward fields not fully buffered yet — read more
      }
      if (done) return undefined;
      if (carry.length > DATAFEED_SEARCH_BUFFER_CAP) carry = carry.slice(-DATAFEED_ROW_BACKWARD_WINDOW);
    }
  } finally {
    try { reader.cancel(); } catch { /* best-effort */ }
  }
}

async function handleCreateLink(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ supported: false, reason: 'bad_request' }, { status: 400 });
  }
  const { idToken, platform, productUrl, subId, productId } = body || {};
  if (!idToken || !platform || !productUrl || !subId) {
    return Response.json({ supported: false, reason: 'bad_request' }, { status: 400 });
  }

  const uid = await verifyFirebaseIdToken(env, idToken);
  if (!uid) return Response.json({ supported: false, reason: 'unauthenticated' }, { status: 401 });

  const trackingFields = buildTrackingFields(body);

  if ((platform === 'TIKTOK_SHOP' || platform === 'SHOPEE' || platform === 'LAZADA') && !isPlatformEnabled(env, platform)) {
    // Lazada today: campaign_id/merchant are stored (see wrangler.toml)
    // but this platform isn't in ACCESSTRADE_ENABLED_PLATFORMS, so it's
    // never called — same "not eligible" answer the web side already
    // falls back from, distinguished in logs/response as maintenance
    // rather than simply unconfigured.
    return Response.json({ supported: false, reason: 'platform_maintenance' });
  }

  if (platform === 'TIKTOK_SHOP') {
    if (!env.ACCESSTRADE_MERCHANT_TIKTOKSHOP) {
      return Response.json({ supported: false, reason: 'not_configured' });
    }
    const { ok, json } = await accesstradeApi(env, 'POST', '/v2/tiktokshop_product_feeds/create_link', {
      body: { product_url: productUrl, ...(productId ? { product_id: productId } : {}), ...trackingFields },
    });
    // Three genuinely different situations, previously all collapsed into
    // one 'not_in_campaign' answer — the exact defect that made it
    // impossible to tell "ACCESSTRADE says this product truly isn't in
    // the campaign" apart from "the HTTP call itself failed" or "the
    // response didn't match either documented shape". Now distinguished:
    //   1. !ok — the request itself failed (network/timeout/4xx/5xx from
    //      accesstradeApi's own fetch) — a technical error, never
    //      reinterpreted as "no commission".
    //   2. json.status === false — ACCESSTRADE's own documented failure
    //      shape ({status:false, message:"The link is not part of the
    //      campaign"}) — this alone is real evidence of "not eligible".
    //   3. ok && status !== false but aff_url still missing — the request
    //      succeeded yet matches NEITHER documented shape — an unexpected
    //      response, treated as a technical error (never guessed to be
    //      "no commission" without the documented failure shape saying so).
    if (!ok) {
      console.error('create_link (tiktok) request failed:', JSON.stringify(json));
      return Response.json({ supported: false, reason: 'technical_error' });
    }
    if (json?.status === false) {
      console.log('create_link (tiktok) not eligible (documented failure shape):', JSON.stringify(json));
      return Response.json({ supported: false, reason: 'not_in_campaign' });
    }
    // aff_url/aff_short_url/product_commission all live under `data`, NOT
    // top-level — confirmed against a REAL production response 2026-09-09
    // ({"data":{"aff_url":...,"aff_short_url":...,"product_commission":
    // {...}},"message":"create link affiliate success","status":true}).
    // Reading json.aff_url directly (the bug that shipped until now) is
    // always undefined, so every real success was being misread as an
    // unexpected shape and reported as technical_error.
    const data = json?.data;
    if (!data?.aff_url) {
      console.error('create_link (tiktok) unexpected response shape:', JSON.stringify(json));
      return Response.json({ supported: false, reason: 'technical_error' });
    }
    // product_commission is the ONE documented field across all 3
    // platforms' create-link responses that carries a real (not derived,
    // not guessed) commission figure at link-creation time — see
    // ACCESSTRADE's TikTok Shop v2 docs. Forwarded to the frontend so
    // get-cashback-link can preview a "Dự kiến hoàn" estimate (see
    // apps/web/lib/redirectLink.ts's estimatedCommission for how it's
    // split before ever being shown). Never sent when absent — no
    // fallback/guessed value substituted here.
    //
    // Prefer a direct commission.amount; only fall back to rate × price
    // when amount is absent but both rate and a price are present.
    // Verified live 2026-09-09 against a real response: amount=15438.4566,
    // rate=0.03888, price=397000 (397000*0.03888=15437.76 ≈ amount,
    // confirming rate is a plain fraction of price, not a percentage, and
    // this formula matches what ACCESSTRADE itself computed).
    const pc = data.product_commission;
    let commission;
    if (pc?.amount != null && Number(pc.amount) > 0) {
      commission = { amount: Number(pc.amount), currency: pc.currency || 'VND' };
    } else if (pc?.rate != null) {
      const rate = Number(pc.rate);
      const price = Number(data.product_price?.minimum_amount ?? data.product_price?.maximum_amount);
      if (rate > 0 && price > 0) {
        commission = { amount: rate * price, currency: pc.currency || data.product_price?.currency || 'VND' };
      }
    }
    // Same ProductResolver output shape Shopee/Lazada use below — TikTok
    // Shop's v2 response already carries these directly (real data,
    // confirmed live 2026-09-09: product_name/product_image/product_price
    // present alongside product_commission), no separate resolver call
    // needed. dataSource is its own tag (not ACCESSTRADE_DATAFEED, which
    // means the static CSV specifically) since this is TikTok's own
    // per-product API field, not a datafeed lookup.
    const product = (data.product_name || data.product_image || data.product_price)
      ? {
          name: data.product_name || undefined,
          image: data.product_image || undefined,
          price: Number(data.product_price?.minimum_amount ?? data.product_price?.maximum_amount) || undefined,
          dataSource: 'ACCESSTRADE_TIKTOK_API',
          updatedAt: new Date().toISOString(),
        }
      : undefined;
    console.log(
      `[ProductResolver] platform=TIKTOK_SHOP source=${product ? 'ACCESSTRADE_TIKTOK_API' : 'NONE'} ` +
      `match=product_id name=${!!product?.name} image=${!!product?.image} price=${!!product?.price}`,
    );
    return Response.json({
      supported: true,
      affLink: data.aff_short_url || data.aff_url,
      ...(commission ? { commission } : {}),
      ...(product ? { product } : {}),
    });
  }

  if (platform === 'SHOPEE' || platform === 'LAZADA') {
    const { campaignId } = PLATFORM_CONFIG[platform](env);
    if (!campaignId) {
      return Response.json({ supported: false, reason: 'not_configured' });
    }
    const { ok, json } = await accesstradeApi(env, 'POST', '/v1/product_link/create', {
      body: { campaign_id: campaignId, urls: [productUrl], ...trackingFields },
    });
    // Same three-way split as TikTok above, using this endpoint's own
    // documented shape instead: {data:{error_link:[],success_link:[...],
    // suspend_url:[]}, success:true} — a URL ACCESSTRADE doesn't convert
    // lands in error_link/suspend_url instead of success_link, WITH
    // success:true still at the top level (that's the documented "some
    // URLs succeeded, some didn't" contract, not a request failure).
    if (!ok) {
      console.error(`create_link (${platform}) request failed:`, JSON.stringify(json));
      return Response.json({ supported: false, reason: 'technical_error' });
    }
    if (json?.success !== true) {
      console.error(`create_link (${platform}) unexpected response shape:`, JSON.stringify(json));
      return Response.json({ supported: false, reason: 'technical_error' });
    }
    const successLink = json?.data?.success_link?.[0];
    if (!successLink?.aff_link) {
      console.log(`create_link (${platform}) not eligible (url not in success_link):`, JSON.stringify(json));
      return Response.json({ supported: false, reason: 'not_in_campaign' });
    }
    // See fetchCampaignCommissionRate's own comment for exactly where this
    // rate comes from (real campaign policy text, parsed) and its
    // reliability tier. Best-effort only — cached at the edge so this is a
    // cache hit for all but the first request per campaign per day; a
    // failure here must never fail the link itself (the aff_link above is
    // already real and usable regardless of whether a rate is found).
    let commissionRate;
    try {
      commissionRate = await fetchCampaignCommissionRate(env, platform, campaignId);
    } catch (err) {
      console.error(`campaign commission rate lookup threw (${platform}):`, err.message);
    }
    // ProductResolver — real name/price/discount/image, when this
    // platform's ACCESSTRADE datafeed CSV actually has this product (see
    // lookupDatafeedProduct's own comment: Shopee's feed is real/current;
    // Lazada's is currently empty — its 1M+-product Datafeed API was
    // investigated and ruled out for per-URL lookup, see that comment).
    // Always attempted (not gated on commissionRate) since name/image are
    // useful even when no rate is available. A failure here must never
    // fail the link itself.
    let product;
    try {
      product = await lookupDatafeedProduct(platform, productUrl);
    } catch (err) {
      console.error(`datafeed product lookup threw (${platform}):`, err.message);
    }
    console.log(
      `[ProductResolver] platform=${platform} source=${product ? 'ACCESSTRADE_DATAFEED' : 'NONE'} ` +
      `match=${product ? 'url' : 'n/a'} name=${!!product?.name} image=${!!product?.image} price=${!!product?.price}` +
      (product ? '' : ' reason=product_not_found'),
    );
    // Full amount computed HERE (server-side) when both a real rate and a
    // real datafeed price are found, rather than making the frontend rely
    // on its own scraped-preview price (lib/productPreview.ts), which is
    // far less reliable for these two platforms (client-rendered SPA
    // pages, no server-rendered price) — see CASHBACK_POLICY/
    // computeEstimatedCashback in apps/web/lib/cashbackPolicy.ts for how
    // priceSource downgrades to 'SCRAPED_PREVIEW'/confidence 'MEDIUM' when
    // this lookup comes back empty and the frontend has to fall back to
    // its own scrape.
    const commission = commissionRate && product?.price
      ? { amount: commissionRate * product.price, currency: 'VND' }
      : undefined;
    return Response.json({
      supported: true,
      affLink: successLink.short_link || successLink.aff_link,
      ...(commission ? { commission, priceSource: 'ACCESSTRADE_DATAFEED' } : commissionRate ? { commissionRate } : {}),
      ...(product ? { product: { name: product.name, image: product.image, price: product.price, discount: product.discount, dataSource: 'ACCESSTRADE_DATAFEED', updatedAt: new Date().toISOString() } } : {}),
    });
  }

  return Response.json({ supported: false, reason: 'unsupported_platform' });
}

// --- 2. Order sync (scheduled) ---

const ORDER_STATUS_MAP = { 0: 'PENDING', 1: 'APPROVED', 2: 'REJECTED' };
const PLATFORM_LABEL = { SHOPEE: 'Shopee', TIKTOK_SHOP: 'TikTok Shop', LAZADA: 'Lazada' };

// (platform, merchant env var) — a platform with no merchant configured is
// skipped entirely for order sync (no guessed value ever sent).
function configuredMerchants(env) {
  return [
    ['SHOPEE', env.ACCESSTRADE_MERCHANT_SHOPEE],
    ['LAZADA', env.ACCESSTRADE_MERCHANT_LAZADA],
    ['TIKTOK_SHOP', env.ACCESSTRADE_MERCHANT_TIKTOKSHOP],
  ].filter(([platform, merchant]) => !!merchant && isPlatformEnabled(env, platform));
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatVnd(amount) {
  return `${Math.round(amount || 0).toLocaleString('vi-VN')} ₫`;
}

// Mirrors orderApprovalMessageText()/orderKeyboard() in apps/web/lib/
// telegram.ts and workers/telegram-bot/src/index.js — third separate copy
// for the same "no shared build" reason those two already document. Same
// TELEGRAM_TOPICS.ORDER_APPROVAL (33) and same order_approve:/order_reject:
// callback_data prefixes, so workers/telegram-bot's EXISTING webhook
// handler processes taps on this message with zero changes needed there.
function renderNewOrderMessage(fields) {
  const DIVIDER = '━━━━━━━━━━━━━━━━━━━';
  return [
    '🆕 <b>ĐƠN HÀNG MỚI (ACCESSTRADE)</b>',
    DIVIDER,
    `👤 <b>Khách hàng:</b> <code>${escapeHtml(fields.requesterLabel)}</code>`,
    `🛍️ <b>Sản phẩm:</b> <code>${escapeHtml(fields.productName)}</code>`,
    `🏬 <b>Sàn:</b> <code>${escapeHtml(fields.platformLabel)}</code>`,
    `💰 <b>Giá trị đơn:</b> <code>${escapeHtml(formatVnd(fields.orderValue))}</code>`,
    `💵 <b>Hoa hồng sàn trả:</b> <code>${escapeHtml(formatVnd(fields.commissionAmount))}</code>`,
    `🆔 <b>Mã đơn:</b> <code>${escapeHtml(fields.orderId)}</code>`,
    `🔗 <b>ACCESSTRADE order_id:</b> <code>${escapeHtml(fields.externalOrderId)}</code>`,
    DIVIDER,
    '⏳ <b>Trạng thái:</b> Chờ duyệt',
  ].join('\n');
}

function newOrderKeyboard(orderId) {
  return [[
    { text: '✅ Duyệt đơn hàng', callback_data: `order_approve:${orderId}` },
    { text: '❌ Từ chối đơn hàng', callback_data: `order_reject:${orderId}` },
  ]];
}

async function sendTelegramNewOrder(env, fields) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      message_thread_id: 33,
      parse_mode: 'HTML',
      text: renderNewOrderMessage(fields),
      reply_markup: { inline_keyboard: newOrderKeyboard(fields.orderId) },
    }),
  }).then((r) => r.json()).catch((err) => {
    console.error('sendTelegramNewOrder threw:', err.message);
    return null;
  });
  if (!res?.ok) return null;
  return { chatId: String(res.result.chat.id), messageId: res.result.message_id };
}

// One customer's own refund history vs. total CONFIRMED-or-REFUNDED orders
// — mirrors classifyClawbackRisk() in apps/web/lib/orderEntry.ts exactly
// (same thresholds), reimplemented over REST since this Worker can't
// import that module. Keep both in sync if the thresholds ever change.
const FRAUD_REPEAT_COUNT_THRESHOLD = 3;
const FRAUD_REPEAT_RATE_THRESHOLD = 0.5;
const FRAUD_MIN_SAMPLE_FOR_RATE = 2;
const HIGH_VALUE_ORDER_THRESHOLD_VND = 2000000;

function classifyClawbackRisk({ alreadyReleased, refundCount, totalOrders, orderValue }) {
  const rate = totalOrders > 0 ? refundCount / totalOrders : 1;
  const isRepeatedPattern = refundCount >= FRAUD_REPEAT_COUNT_THRESHOLD || (totalOrders >= FRAUD_MIN_SAMPLE_FOR_RATE && rate > FRAUD_REPEAT_RATE_THRESHOLD);
  if (alreadyReleased) return refundCount >= 2 ? 'HIGH' : 'MEDIUM';
  if (isRepeatedPattern) return 'HIGH';
  if (refundCount === 1 && orderValue < HIGH_VALUE_ORDER_THRESHOLD_VND) return null;
  return refundCount >= 2 ? 'MEDIUM' : 'LOW';
}

// Mirrors lib/orderEntry.ts's upsertOrder REFUNDED branch — triggered here
// by a REAL ACCESSTRADE rejection/cancellation instead of an admin's
// manual "Trả hàng" click, applied to an order THIS Worker itself created.
async function handleClawback(env, idToken, orderDoc, orderId, orderFields, reason) {
  const userId = fv(orderFields, 'userId');
  const orderValue = fv(orderFields, 'orderValue') || 0;
  const currentStatus = fv(orderFields, 'status');
  if (currentStatus !== 'CONFIRMED') return; // nothing to claw back from PENDING (no ledger exists yet)

  const ledgerRows = await firestoreRunQuery(env, idToken, {
    from: [{ collectionId: 'cashbackLedger' }],
    where: { fieldFilter: { field: { fieldPath: 'orderId' }, op: 'EQUAL', value: { stringValue: orderId } } },
  });

  let clawedBackFrozen = false;
  let clawedBackReleased = false;
  for (const row of ledgerRows) {
    const ledgerId = row.document.name.split('/').pop();
    const status = fv(row.document.fields, 'status');
    if (status === 'FROZEN') {
      await firestorePatch(env, idToken, 'cashbackLedger', ledgerId, { status: { stringValue: 'REJECTED' } });
      clawedBackFrozen = true;
    } else if (status === 'RELEASED') {
      clawedBackReleased = true;
    }
  }
  if (!clawedBackFrozen && !clawedBackReleased) return;

  const ordersOfUser = await firestoreRunQuery(env, idToken, {
    from: [{ collectionId: 'orders' }],
    where: { fieldFilter: { field: { fieldPath: 'userId' }, op: 'EQUAL', value: { stringValue: userId } } },
  });
  const relevant = ordersOfUser
    .map((row) => (row.document.name.split('/').pop() === orderId ? 'REFUNDED' : fv(row.document.fields, 'status')))
    .filter((s) => s === 'CONFIRMED' || s === 'REFUNDED');
  const totalOrders = relevant.length;
  const refundCount = relevant.filter((s) => s === 'REFUNDED').length;

  const clawbackFlag = clawedBackReleased ? 'RELEASED_FLAGGED' : 'FROZEN_REJECTED';
  await firestorePatch(env, idToken, 'orders', orderId, {
    status: { stringValue: 'REFUNDED' },
    commissionStatus: { stringValue: 'REJECTED' },
    cashbackClawback: { stringValue: clawbackFlag },
  });

  if (clawedBackFrozen) {
    const risk = classifyClawbackRisk({ alreadyReleased: false, refundCount, totalOrders, orderValue });
    if (risk) {
      await accesstradeCreateFraudSignal(env, idToken, { userId, orderId, orderValue, refundCount, totalOrders, risk, reason, released: false });
    }
  }
  if (clawedBackReleased) {
    const risk = classifyClawbackRisk({ alreadyReleased: true, refundCount, totalOrders, orderValue });
    if (risk) {
      await accesstradeCreateFraudSignal(env, idToken, { userId, orderId, orderValue, refundCount, totalOrders, risk, reason, released: true });
    }
  }
}

async function accesstradeCreateFraudSignal(env, idToken, { userId, orderId, orderValue, refundCount, totalOrders, risk, reason, released }) {
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/fraudSignals`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        userId: { stringValue: userId },
        orderId: { stringValue: orderId },
        signalType: { stringValue: 'REFUND_AFTER_RELEASE' },
        riskLevel: { stringValue: risk },
        orderValue: { integerValue: String(Math.round(orderValue)) },
        refundCount: { integerValue: String(refundCount) },
        totalOrders: { integerValue: String(totalOrders) },
        reason: { stringValue: `[ACCESSTRADE] Đơn ${orderId} bị ${reason} (lần trả hàng thứ ${refundCount}/${totalOrders} của khách này).${released ? ' Cashback đã giải phóng — cần Admin xem xét thu hồi thủ công.' : ''}` },
        status: { stringValue: 'OPEN' },
        createdAt: { timestampValue: new Date().toISOString() },
      },
    }),
  });
  if (!res.ok) console.error('accesstradeCreateFraudSignal failed:', res.status, await res.text().catch(() => ''));
}

// UNVERIFIED (see top-of-file note): the order-list RESPONSE fields as
// given are order_id/billing/merchant/pub_commission/is_confirmed/
// order_pending/order_approved/order_reject/... — no plain `status` field
// is documented in the response itself (0/1/2 is only shown as a REQUEST
// filter param). If the real response does carry `order.status` anyway,
// that's used directly and is the most trustworthy signal available.
// Otherwise this falls back to the order_reject/order_approved/
// order_pending flags — but their real TYPE (boolean vs. an amount
// breakdown, similar to order-products' billing.approved/pending/reject)
// isn't confirmed either, so this treats any truthy/non-zero value as
// "this bucket applies" and defaults to the safest state (PENDING — never
// triggers a release or a clawback on its own) whenever genuinely unclear.
function deriveOrderStatus(order) {
  if (order.status !== undefined && order.status !== null && ORDER_STATUS_MAP[order.status]) {
    return ORDER_STATUS_MAP[order.status];
  }
  if (order.order_reject) return 'REJECTED';
  if (order.order_approved && !order.order_pending) return 'APPROVED';
  return 'PENDING';
}

async function processOneOrder(env, idToken, platform, merchant, order) {
  const externalOrderId = String(order.order_id);
  const orderId = `accesstrade_${externalOrderId}`;
  const status = deriveOrderStatus(order);
  // billing = best-effort "order value" per order-list's own documented
  // field name; pub_commission = the commission ACCESSTRADE actually pays
  // — see this file's top-of-file UNVERIFIED note if either looks wrong
  // once real orders are inspected.
  const orderValue = Number(order.billing) || 0;
  const commissionAmount = Number(order.pub_commission) || 0;
  console.log(`order ${externalOrderId}: raw order-list row =`, JSON.stringify(order), `-> derived status = ${status}`);

  const existing = await firestoreGet(env, idToken, 'orders', orderId);

  if (!existing) {
    if (status === 'REJECTED') {
      console.log(`order ${externalOrderId}: already REJECTED on first sighting, not creating anything`);
      return;
    }
    if (commissionAmount <= 0) {
      console.log(`order ${externalOrderId}: commission = 0, not creating a cashback order (per policy)`);
      return;
    }

    // order-products gives the tracking parameters a plain order-list
    // response doesn't carry (see this file's top comment on sub_id1).
    const { ok, json } = await accesstradeApi(env, 'GET', '/v1/order-products', { query: { order_id: externalOrderId, merchant } });
    await sleep(ORDER_PRODUCTS_THROTTLE_MS); // rate-limit guard — see this const's own comment
    if (!ok) {
      console.error(`order ${externalOrderId}: order-products fetch failed, skipping this cycle`);
      return;
    }
    const params = json?.data?._extra?.parameters || json?._extra?.parameters || {};
    const subId = params.sub_id1;
    console.log(`order ${externalOrderId}: raw _extra.parameters (full, for manual review) =`, JSON.stringify(params));

    // --- MAPPING CHECK — read this block, not just the pass/fail, before
    // ever trusting a real order created from this. `redirectCache`'s own
    // doc id IS whatever value was sent as sub1 at link-creation time (see
    // lib/redirectLink.ts) — so a successful lookup below IS the proof
    // sub1 round-tripped correctly as sub_id1, and a failed one tells you
    // exactly which of the two ways this can go wrong actually happened. ---
    const userId = subId ? await resolveUserIdFromSubId(env, idToken, subId) : null;
    const mappingResult = !subId ? 'UNKNOWN' : userId ? 'MATCH' : 'NO_MATCH';
    console.log([
      `[MAPPING CHECK] order_id=${externalOrderId}`,
      `sub1 gửi khi tạo link: (không lưu riêng — chính là redirectCache doc id được tra cứu bên dưới, xem lib/redirectLink.ts)`,
      `sub_id1 ACCESSTRADE trả về: ${subId ?? '(KHÔNG CÓ — field sub_id1 vắng mặt trong _extra.parameters)'}`,
      `userId dự kiến: ${userId ?? '(không xác định)'}`,
      `mapping: ${mappingResult}`,
    ].join('\n  '));

    if (mappingResult === 'UNKNOWN') {
      console.error(`order ${externalOrderId}: order-products response has NO sub_id1 field at all in _extra.parameters — this endpoint may not carry mapping data for this merchant/campaign. Not creating an order.`);
      return;
    }
    if (!userId) {
      console.error(`order ${externalOrderId}: NO_MATCH — sub_id1="${subId}" did not match any redirectCache doc. Not creating an order. Full params logged above for manual review.`);
      return;
    }

    const orderFields = {
      userId: { stringValue: userId },
      platform: { stringValue: platform },
      productName: { stringValue: `Đơn hàng ACCESSTRADE #${externalOrderId}` },
      productUrl: order.at_product_link ? { stringValue: order.at_product_link } : { nullValue: null },
      imageUrl: { nullValue: null },
      orderValue: { integerValue: String(Math.round(orderValue)) },
      commissionAmount: { integerValue: String(Math.round(commissionAmount)) },
      status: { stringValue: 'PENDING' },
      orderDate: { timestampValue: new Date().toISOString() },
      confirmedAt: { nullValue: null },
      source: { stringValue: 'AFFILIATE' },
      externalOrderId: { stringValue: externalOrderId },
      subId: { stringValue: subId },
      trackingId: { stringValue: subId },
      affiliateProvider: { stringValue: 'ACCESSTRADE' },
      affiliateConversionId: { stringValue: externalOrderId },
      commissionStatus: { stringValue: status },
      // Starts hidden from the customer regardless of DRY_RUN — only
      // Admin approving (PENDING -> CONFIRMED, via the existing
      // /manager/orders or Telegram flow, unchanged by this Worker) flips
      // this true. Enforced again at the firestore.rules level (this
      // Worker's own isConversionBot() create rule requires this to be
      // exactly `false`), not just here.
      customerVisible: { booleanValue: false },
      telegramChatId: { nullValue: null },
      telegramMessageId: { nullValue: null },
    };

    if (env.DRY_RUN !== 'false') {
      console.log(`[DRY_RUN] would CREATE ${orderId} for userId=${userId}, value=${orderValue}, commission=${commissionAmount}`);
      return;
    }

    const { created } = await firestoreCreate(env, idToken, 'orders', orderId, orderFields);
    if (!created) {
      console.log(`order ${orderId}: create raced/lost (already exists) — no-op, no duplicate`);
      return;
    }

    const userDoc = await firestoreGet(env, idToken, 'users', userId).catch(() => null);
    const requesterLabel = (userDoc && (fv(userDoc.fields, 'fullName') || fv(userDoc.fields, 'email'))) || userId;
    const telegramRef = await sendTelegramNewOrder(env, {
      requesterLabel,
      productName: `Đơn hàng ACCESSTRADE #${externalOrderId}`,
      platformLabel: PLATFORM_LABEL[platform] ?? platform,
      orderValue,
      commissionAmount,
      orderId,
      externalOrderId,
    });
    if (telegramRef) {
      await firestorePatch(env, idToken, 'orders', orderId, {
        telegramChatId: { stringValue: telegramRef.chatId },
        telegramMessageId: { integerValue: String(telegramRef.messageId) },
      });
    }
    console.log(`order ${orderId}: created (PENDING), Telegram notified: ${!!telegramRef}`);
    return;
  }

  // Already exists — either refresh commissionStatus while still PENDING,
  // or trigger the clawback path if ACCESSTRADE now reports a rejection/
  // cancellation on an order the admin already CONFIRMED.
  const existingStatus = fv(existing.fields, 'status');
  const existingCommissionStatus = fv(existing.fields, 'commissionStatus');

  if (existingStatus === 'PENDING') {
    if (existingCommissionStatus !== status || fv(existing.fields, 'commissionAmount') !== Math.round(commissionAmount)) {
      if (env.DRY_RUN !== 'false') {
        console.log(`[DRY_RUN] would UPDATE ${orderId} commissionStatus ${existingCommissionStatus} -> ${status}`);
        return;
      }
      await firestorePatch(env, idToken, 'orders', orderId, {
        commissionStatus: { stringValue: status },
        commissionAmount: { integerValue: String(Math.round(commissionAmount)) },
      });
      console.log(`order ${orderId}: PENDING, commissionStatus refreshed to ${status}`);
    }
    return;
  }

  if (existingStatus === 'CONFIRMED' && status === 'REJECTED') {
    if (env.DRY_RUN !== 'false') {
      console.log(`[DRY_RUN] would CLAW BACK ${orderId} (ACCESSTRADE reported rejected/cancelled after CONFIRMED)`);
      return;
    }
    await handleClawback(env, idToken, existing, orderId, existing.fields, 'bị ACCESSTRADE báo hủy/từ chối');
    console.log(`order ${orderId}: clawback processed`);
    return;
  }

  // CONFIRMED + still approved/pending, or already REFUNDED/CANCELLED —
  // nothing to do this cycle.
}

// order-list's own docs mention `page` as an available param but never
// document its exact convention (1-indexed? 0-indexed? a token instead?).
// UNVERIFIED like everything else flagged at the top of this file — this
// assumes the common 1-indexed convention and stops as soon as a page
// comes back shorter than `limit` (the standard "that was the last page"
// signal) or after MAX_PAGES as a hard safety cap. On this platform's
// realistic order volume, a single page has never been expected to be
// insufficient — this exists so a real future volume spike doesn't
// silently drop orders past page 1 rather than because it's needed today.
const ORDER_LIST_PAGE_SIZE = 300;
const ORDER_LIST_MAX_PAGES = 5;

async function fetchAllOrderListPages(env, platform, merchant, sinceIso, untilIso) {
  const all = [];
  for (let page = 1; page <= ORDER_LIST_MAX_PAGES; page++) {
    const { ok, json } = await accesstradeApi(env, 'GET', '/v1/order-list', {
      query: { since: sinceIso, until: untilIso, merchant, limit: String(ORDER_LIST_PAGE_SIZE), page: String(page) },
    });
    if (!ok) {
      console.error(`order-list fetch failed for ${platform}/${merchant} (page ${page})`);
      break;
    }
    const pageOrders = json?.data?.orders || json?.data || [];
    if (!Array.isArray(pageOrders)) {
      console.error(`order-list response for ${platform} (page ${page}) wasn't the expected array shape:`, JSON.stringify(json).slice(0, 500));
      break;
    }
    all.push(...pageOrders);
    if (pageOrders.length < ORDER_LIST_PAGE_SIZE) break; // last page
    if (page < ORDER_LIST_MAX_PAGES) await sleep(ORDER_PRODUCTS_THROTTLE_MS); // stay under 10 req/min across pages too
  }
  return all;
}

async function pollOrders(env) {
  const idToken = await firestoreSignIn(env);
  // 3-hour rolling window, re-scanned every run — idempotency (the
  // deterministic accesstrade_<order_id> doc id) makes re-scanning
  // overlap safe, and this covers a missed cron tick without needing a
  // separate "last polled at" cursor doc. ISO 8601 (not Unix seconds) per
  // ACCESSTRADE's docs — see this file's top-of-file note on since/until.
  const untilIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

  for (const [platform, merchant] of configuredMerchants(env)) {
    const orders = await fetchAllOrderListPages(env, platform, merchant, sinceIso, untilIso);
    console.log(`order-list ${platform}/${merchant}: ${orders.length} order(s) in window`);
    for (const order of orders) {
      try {
        await processOneOrder(env, idToken, platform, merchant, order);
      } catch (err) {
        console.error(`processOneOrder threw for order_id=${order?.order_id}:`, err.message);
      }
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/create-link') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === 'POST') {
        const res = await handleCreateLink(request, env, ctx);
        const headers = new Headers(res.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      }
    }
    // Read-only diagnostic: shows exactly what fetchCampaignCommissionRate
    // parses for a given campaign, straight from the confirmed-working
    // /v1/campaigns endpoint — no customer auth needed (nothing account/
    // order-specific), no Firestore access, only ever reads. Useful to
    // verify a rate stays sane after ACCESSTRADE reformats their policy
    // text (see fetchCampaignCommissionRate's own comment).
    if (url.pathname === '/debug/campaign') {
      const campaignId = url.searchParams.get('campaign_id');
      const platform = url.searchParams.get('platform');
      const { ok, status, json } = await accesstradeApi(env, 'GET', '/v1/campaigns', {
        query: { campaign_id: campaignId },
      });
      const commissionPolicyHtml = json?.data?.[0]?.description?.commission_policy;
      const parsedRate = platform === 'SHOPEE'
        ? parseShopeeExistingCustomerRate(commissionPolicyHtml)
        : platform === 'LAZADA'
          ? parseLazadaModalDirectRate(commissionPolicyHtml)
          : undefined;
      return Response.json({ campaignId, platform, ok, status, parsedRate, name: json?.data?.[0]?.name });
    }
    // Read-only diagnostic: verifies lookupDatafeedProduct against a real
    // URL — no customer auth needed, no Firestore access. Kept
    // permanently (not "temporary") as an operational tool: lets a real
    // product be re-checked directly if ACCESSTRADE ever reformats the
    // CSV in a way that breaks parsing, without needing a customer to
    // reproduce it through the full UI flow.
    if (url.pathname === '/debug/datafeed-lookup') {
      const platform = url.searchParams.get('platform');
      const productUrl = url.searchParams.get('url');
      const startedAt = Date.now();
      const product = await lookupDatafeedProduct(platform, productUrl);
      return Response.json({ platform, productUrl, product: product ?? null, ms: Date.now() - startedAt });
    }
    return new Response('OK', { status: 200 });
  },
  async scheduled(event, env, ctx) {
    // Diagnostic only — confirms Cloudflare actually invoked scheduled()
    // independent of whatever pollOrders() does next (its own first log
    // line is gated behind an awaited Firebase sign-in call, so this is
    // the only way to see a tick land before any network I/O happens).
    console.log(`[CRON] scheduled fired ${new Date().toISOString()} (cron="${event.cron}")`);
    ctx.waitUntil(pollOrders(env).catch((err) => console.error('pollOrders failed:', err.message)));
  },
};
