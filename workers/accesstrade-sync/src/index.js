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
//   - RESOLVED 2026-09-12 against a real conversion (order_id
//     260911RD0KW95Q): `sub1` sent at link-creation time comes back as
//     `data[i]._extra.sub_params.sub1` — NOT `data._extra.parameters.sub_id1`
//     as originally assumed from the docs' example (that field/shape never
//     appeared in this account's real responses, so the mapping check
//     silently produced 'UNKNOWN' for every real order until this fix).
//     `data` is a list of per-product line items, one per product in the
//     order; every row of the same order carries the same sub1 (same
//     tracking link), so processOneOrder takes the first row with one set.
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
  // FIXED 2026-09-13 — docId reaches this raw (no encodeURIComponent) in
  // some call sites via subId/sub1 (resolveUserIdFromSubId), a value
  // ACCESSTRADE echoes back from a public tracking-link query string an
  // attacker could tamper with before ever clicking it. A crafted value
  // containing "/", "?" or "&" could otherwise alter the REST path/query
  // instead of being treated as a single opaque document id. Every real
  // Firestore doc id used in this file (order ids, generated subId codes)
  // encodes to itself unchanged, so this is a no-op for legitimate values.
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${encodeURIComponent(docId)}`;
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
  // updateTime is needed by sendTopic33AndMark's own atomic precondition
  // when patching telegramChatId/telegramMessageId/orderNotificationSentAt
  // right after this create — existing callers destructuring just
  // {created} are unaffected.
  return { created: true, updateTime: json.updateTime };
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

// --- Commission service: resolveCommission() ----------------------------
// Single entry point for "what commission rate applies to this product,
// right now, before any order exists" — tried in trust/precision order,
// each tier only consulted if the previous one had nothing to offer:
//
//   1. Category-specific policy — GET /v1/cashback/campaigns. STRUCTURALLY
//      READY but INERT today: this ACCESSTRADE account has only ever
//      received {"code":"PX00401","message":"Invalid token"} from this
//      endpoint (confirmed live 2026-09-09/10 against this exact Shopee
//      campaign_id, same documented `Authorization: Token {access_key}`
//      header every OTHER working call here uses — ruled out as an
//      account-tier gate, not a code bug). fetchCashbackCampaignCommission
//      below still genuinely calls the real endpoint every time (never
//      skipped/stubbed) — the moment ACCESSTRADE grants this account
//      access, real 200 responses start flowing through this tier with NO
//      code change and NO frontend change, only the 401 stops happening.
//   2. Campaign-wide flat rate — GET /v1/campaigns' own real
//      description.commission_policy text (fetchCampaignCommissionRate
//      above) — real, live, working today; this is the ONLY tier that
//      currently ever produces a result.
//
// Deliberately does NOT touch /v1/order-list's pub_commission — that is
// real, ACTUAL, post-purchase data with its own entirely separate path
// (processOneOrder further below), never an input to a pre-purchase
// estimate. Also deliberately does NOT call /v1/product_detail — that
// endpoint requires a transaction_id that only exists after a real click
// (see its own note near processOneOrder), so it has no role in a
// before-purchase resolution and is never called here.
//
// categoryId/categoryName/productId/price are accepted (matching the
// requested resolveCommission({merchant, campaignId, productId,
// categoryId, categoryName, price}) shape) but are OPTIONAL and, for
// Shopee/Lazada today, always undefined in practice — the ACCESSTRADE
// static datafeed CSV (lookupDatafeedProduct) is the only real per-
// product data source available pre-purchase and its own `category`
// column is empty ("nan") for every row (confirmed live 2026-09-10,
// entire current file, 12,858/12,858 rows) — there is no free source for
// a real category today. Accepted now anyway so a future category source
// (or /v1/product_detail once a transaction_id-bearing flow exists) can
// pass them straight in without this function's signature changing again.
async function resolveCommission(env, { platform, campaignId, categoryId, categoryName }) {
  // Both tiers are started together and awaited via Promise.all — latency
  // is MAX(tier1, tier2) instead of tier1-then-tier2's SUM. Previously
  // tier 1 was awaited alone first: since this account gets a real 401
  // from /v1/cashback/campaigns every time (see fetchCashbackCampaignCommission's
  // own comment), that 401 round-trip (measured live 2026-09-10: ~2-3.5s
  // on a cache-cold request) was pure added wait in front of tier 2 (~0.3-
  // 1.4s alone) for an endpoint that never succeeds today. Tier 1 is still
  // preferred the instant it DOES return a usable policy (unchanged
  // priority) — this only changes how the two calls are scheduled, not
  // which one wins or what either returns.
  const categoryPolicyPromise = fetchCashbackCampaignCommission(env, platform, campaignId).catch((err) => {
    console.error(`resolveCommission: category-policy tier threw (${platform}):`, err.message);
    return undefined;
  });
  const flatRatePromise = fetchCampaignCommissionRate(env, platform, campaignId).catch((err) => {
    console.error(`resolveCommission: campaign-policy tier threw (${platform}):`, err.message);
    return undefined;
  });
  const [categoryPolicy, flatRate] = await Promise.all([categoryPolicyPromise, flatRatePromise]);
  if (categoryPolicy) {
    const matched = resolveCategoryCommissionRate(categoryPolicy, categoryId, categoryName);
    if (matched) {
      console.log(`[resolveCommission] platform=${platform} tier=CATEGORY_POLICY matchedBy=${matched.matchedBy} rate=${matched.rate}`);
      return { rate: matched.rate, source: 'ACCESSTRADE_CASHBACK_CAMPAIGNS' };
    }
  }
  if (flatRate != null) {
    return { rate: flatRate, source: 'ACCESSTRADE_CAMPAIGN_POLICY' };
  }
  return undefined;
}

const CASHBACK_CAMPAIGNS_CACHE_TTL_S = 3600; // short — see fetchCashbackCampaignCommission's own comment on why

// GET /v1/cashback/campaigns adapter. UNVERIFIED response shape/units:
// this account has never received a real 200 from this endpoint (always
// 401 — see resolveCommission's comment above), so nothing below has ever
// been checked against real data. Parses exactly the documented field
// names (campaign_id, min_commission, max_commission, commission_type,
// category_id, category_name, is_default, all_commissions[]) and nothing
// beyond them — no field is invented, no THEFACESHOP example value is
// copied in. Cached for only 1 hour (not the 24h the confirmed-working
// campaign-policy tier uses) specifically so that IF this account's
// access is ever upgraded, the change is picked up automatically within
// an hour with no deploy — while still not hammering a currently-always-
// failing endpoint on every single create-link call.
async function fetchCashbackCampaignCommission(env, platform, campaignId) {
  if (!campaignId) return undefined;
  const cacheKey = new Request(`https://cashback-campaigns-cache.internal/?campaign_id=${encodeURIComponent(campaignId)}`);
  const cache = caches.default;
  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const body = await cached.json();
      return body.policy ?? undefined;
    }
  } catch (err) {
    console.error(`cashback/campaigns cache read failed (${platform}):`, err.message);
  }

  const { ok, status, json } = await accesstradeApi(env, 'GET', '/v1/cashback/campaigns', { query: { campaign_id: campaignId } });
  const policy = ok ? (json?.data?.[0] ?? json?.data ?? null) : null;
  if (!ok) {
    console.log(`[resolveCommission] cashback/campaigns tier unavailable (${platform}, campaign_id=${campaignId}): HTTP ${status} — falling back to campaign-policy tier`);
  }
  try {
    await cache.put(cacheKey, new Response(JSON.stringify({ policy }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${CASHBACK_CAMPAIGNS_CACHE_TTL_S}` },
    }));
  } catch (err) {
    console.error(`cashback/campaigns cache write failed (${platform}):`, err.message);
  }
  return policy ?? undefined;
}

// A single all_commissions[] entry (or the top-level policy object itself,
// which the docs show carrying its own min_commission/commission_type as
// a campaign-wide default) turned into a plain 0-1 fraction, or undefined
// if it can't be trusted as one. min_commission (not max) is used
// deliberately — the conservative default, matching the same choice
// already made for the working /v1/campaigns tier (existing-customer
// 1.8% over new-customer 24%) — never overstate a customer's estimate.
// UNVERIFIED unit convention (see fetchCashbackCampaignCommission's own
// comment) — this treats a value >= 1 as a plain percentage number (e.g.
// 1.8 meaning 1.8%, consistent with how /v1/campaigns' OWN real policy
// text writes rates, the one other confirmed-real ACCESSTRADE source this
// project has — not a value copied from documentation). commission_type
// is checked so a non-percentage entry (e.g. a flat currency amount) is
// never misread as a rate. The final (0, 1] bound is the actual safety
// net: if the real unit turns out different than inferred here, this
// simply declines to produce a rate (falls through to tier 2) instead of
// ever computing an absurd cashback number.
function normalizeCommissionEntry(entry) {
  if (!entry || entry.min_commission == null) return undefined;
  const type = String(entry.commission_type || '').trim().toLowerCase();
  if (type && !type.includes('percent') && type !== '%') return undefined;
  const raw = Number(entry.min_commission);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  const rate = raw >= 1 ? raw / 100 : raw;
  return rate > 0 && rate <= 1 ? rate : undefined;
}

// category_id match first, then category_name, then whichever
// all_commissions[] entry is flagged is_default, then the policy's own
// top-level min_commission as the last, coarsest fallback (Section F: "if
// the API only returns a campaign-wide min/max, use min_commission,
// labeled as an estimate" — never category-specific, but still real data,
// never a guess). Never invents a category — categoryId/categoryName
// simply go unmatched (falls through to the next step) when absent or
// when nothing in all_commissions lines up with them.
function resolveCategoryCommissionRate(policy, categoryId, categoryName) {
  const pool = Array.isArray(policy.all_commissions) ? policy.all_commissions : [];
  if (categoryId != null) {
    const byId = pool.find((c) => String(c.category_id) === String(categoryId));
    const r = byId && normalizeCommissionEntry(byId);
    if (r) return { rate: r, matchedBy: 'category_id' };
  }
  if (categoryName) {
    const needle = categoryName.trim().toLowerCase();
    const byName = pool.find((c) => (c.category_name || '').trim().toLowerCase() === needle);
    const r = byName && normalizeCommissionEntry(byName);
    if (r) return { rate: r, matchedBy: 'category_name' };
  }
  const def = pool.find((c) => c.is_default);
  const defRate = def && normalizeCommissionEntry(def);
  if (defRate) return { rate: defRate, matchedBy: 'is_default' };
  const topRate = normalizeCommissionEntry(policy);
  if (topRate) return { rate: topRate, matchedBy: 'campaign_min_commission' };
  return undefined;
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

// Two real Shopee URL shapes carry the same shopId/itemId pair:
//   1. The canonical form ITSELF: shopee.vn/product/<shopid>/<itemid>
//      (confirmed live 2026-09-09 — a real customer paste, sometimes with
//      extra query params like ?credential_token=... riding along, which
//      parsing via URL().pathname naturally ignores).
//   2. The marketing pretty-slug form: .../ten-san-pham-i.<shopid>.<itemid>
// BUG FIXED 2026-09-09: this previously only matched form 2 — any
// customer already on form 1 (confirmed happening — see the two card
// screenshots that started this fix) silently got no datafeed match at
// all, even though form 1 IS the exact shape the datafeed's own `url`
// column uses, because canonicalShopeeDatafeedUrl returned null and
// lookupDatafeedProduct bailed out before ever calling fetch().
function extractShopeeIds(productUrl) {
  try {
    // Matches ANY single-word path segment followed by exactly two digit
    // groups — not just /product/<id>/<id>. Confirmed live 2026-09-10:
    // Shopee's own s.shopee.vn short-link redirect (once actually
    // followed — see workers/product-preview's desktop-UA comment for
    // why the mobile UA used everywhere else never got a real redirect
    // here) lands on /opaanlp/<shopid>/<itemid>, a DIFFERENT prefix than
    // the canonical /product/<shopid>/<itemid> form the datafeed itself
    // uses — same id pair, different entry-point path. Anchoring on the
    // shape (word, then exactly two digit runs) rather than one specific
    // word makes this resilient to Shopee using yet another prefix for
    // some other entry point later without needing another round of
    // "which path shape now" fixes.
    const pathMatch = /^\/[a-z]+\/(\d+)\/(\d+)/i.exec(new URL(productUrl).pathname);
    if (pathMatch) return { shopId: pathMatch[1], itemId: pathMatch[2] };
  } catch {
    // fall through to the slug-form regex below
  }
  const m = /-i\.(\d+)\.(\d+)/.exec(productUrl);
  return m ? { shopId: m[1], itemId: m[2] } : null;
}

// --- Shopee short-link (s.shopee.vn) resolve cache, D1-backed ----------
//
// A share short-link's query string (share_channel_code, credential_token,
// gads_t_sig, ...) describes the SHARE EVENT, not the product — two
// different share events of the exact same short code resolve to the same
// product every time (confirmed live across this whole engagement). Cache
// key is origin+pathname ONLY, so those varying params never fragment the
// cache. Never confused with redirectCache (Firestore, per-user tracking
// links) — this is a small, anonymous, shared lookup table, same spirit as
// the shopee_products D1 index above, and lives in the SAME D1 database
// (no new binding needed).
const SHOPEE_SHORTLINK_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — generous but bounded; a stale row is simply re-resolved and overwritten, never trusted forever

function normalizeShopeeShortUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

// Real network round-trip ONLY on a cache miss. Deliberately does NOT reuse
// workers/product-preview's HTMLRewriter/title/image scraping — this only
// ever needs the resolved URL to extract shopId/itemId, the exact same
// "fast=1" reasoning already applied to resolveShortlink() on the frontend
// (see that function's own comment): a scraped title/image here would only
// ever be a placeholder D1/ACCESSTRADE datafeed data already supersedes.
async function resolveShopeeShortlinkCached(env, shortUrl) {
  const id = normalizeShopeeShortUrl(shortUrl);
  if (!id) return null;
  const now = Date.now();

  try {
    const row = await env.DATAFEED_DB.prepare(
      'SELECT resolved_url, shop_id, item_id, expires_at FROM shopee_shortlink_cache WHERE id = ?1',
    ).bind(id).first();
    if (row && row.expires_at > now) {
      return { resolvedUrl: row.resolved_url, shopId: row.shop_id || undefined, itemId: row.item_id || undefined, cacheHit: true };
    }
  } catch (err) {
    console.error('[ShortlinkCache] D1 read failed:', err.message);
  }

  let resolvedUrl;
  try {
    // Same desktop UA requirement already established for s.shopee.vn
    // specifically (see workers/product-preview's own comment) — the
    // mobile UA used elsewhere on this domain never gets a real redirect.
    const res = await fetch(shortUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
      },
    });
    resolvedUrl = res.url;
  } catch (err) {
    console.error('[ShortlinkCache] resolve fetch threw:', err.message);
    return null;
  }
  if (!resolvedUrl) return null;

  const ids = extractShopeeIds(resolvedUrl);
  // A resolve that didn't yield a parseable id is never cached — per this
  // task's own "if resolve thất bại, không lưu kết quả lỗi lâu dài" rule,
  // so the next request gets a fresh real attempt instead of a frozen miss.
  if (!ids) return { resolvedUrl, shopId: undefined, itemId: undefined, cacheHit: false };

  try {
    await env.DATAFEED_DB.prepare(
      'INSERT INTO shopee_shortlink_cache (id, short_url, resolved_url, shop_id, item_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) ' +
      'ON CONFLICT(id) DO UPDATE SET short_url=excluded.short_url, resolved_url=excluded.resolved_url, shop_id=excluded.shop_id, item_id=excluded.item_id, created_at=excluded.created_at, expires_at=excluded.expires_at',
    ).bind(id, shortUrl, resolvedUrl, ids.shopId, ids.itemId, now, now + SHOPEE_SHORTLINK_CACHE_TTL_MS).run();
  } catch (err) {
    console.error('[ShortlinkCache] D1 write failed:', err.message);
  }

  return { resolvedUrl, shopId: ids.shopId, itemId: ids.itemId, cacheHit: false };
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

// A miss (product genuinely not in the ~92K-row Shopee file) means
// scanning all the way to EOF — confirmed live 2026-09-09 to take up to
// ~13s end-to-end, which is a real, customer-visible delay on a page
// that's supposed to respond instantly. Capped so a miss fails fast
// instead of exhausting the whole file — at the cost of occasionally
// missing a real match that happens to sit past the cutoff, which is an
// acceptable trade for a customer-facing wait time (this is only ever a
// best-effort PRE-purchase estimate; a miss here just means the card
// shows the friendly "chưa xác định số tiền" copy, nothing breaks).
const DATAFEED_SEARCH_TIMEOUT_MS = 4000;

// GET /v1/datafeeds?domain=shopee.vn&sku=<itemId> — the OFFICIAL ACCESSTRADE
// per-product lookup endpoint (docs provided 2026-09-11), confirmed live
// against real products: `sku` is exactly Shopee's own itemId (NOT
// ACCESSTRADE's own `product_id`, which is a separate internal id like
// "322_4949621399", and NOT shopId_itemId — verified by reading the raw
// CSV's own sku column AND cross-checking 3 real products' API responses).
// `domain=shopee.vn` alone (no sku) returns total:12813 — the EXACT same
// row count as the CSV/D1 index, confirming this is the same underlying
// dataset, just queryable per-product instead of requiring a full
// download+scan. Verified live: a product confirmed absent from the CSV
// (shopId 37104925 and 947189686 — see D1 rebuild investigation) is ALSO
// total:0 here, so this is not a way to find MORE products than the CSV
// already has — only a way to find a specific one FRESHER (update_time is
// today's date, vs. up to an hour of staleness from the CSV-based rebuild)
// and FASTER (121-750ms measured for a single sku, vs a 19MB download).
// Used only as a fallback on a D1 MISS (see lookupShopeeProductFromIndex
// below) — never called on a D1 hit, and never on every single request,
// specifically to avoid unknown rate-limit exposure on an endpoint whose
// docs (as provided) don't state one, the same caution already applied to
// every other ACCESSTRADE endpoint in this file.
async function fetchShopeeProductFromDatafeedApi(env, ids) {
  const { ok, json } = await accesstradeApi(env, 'GET', '/v1/datafeeds', {
    query: { domain: 'shopee.vn', sku: ids.itemId },
  });
  if (!ok) return undefined;
  const row = Array.isArray(json?.data) ? json.data[0] : undefined;
  if (!row) return undefined;
  // Matches CSV's own sku-is-itemId identity, but itemId alone (sku) isn't
  // guaranteed globally unique across every shop by ACCESSTRADE's own
  // contract — cheap extra safety: reject a row whose own url doesn't
  // actually carry the shopId we asked for, rather than trusting sku alone.
  const rowIds = row.url ? extractShopeeIds(row.url) : null;
  if (!rowIds || rowIds.shopId !== ids.shopId) return undefined;
  const price = Number(row.price);
  return {
    name: row.name || undefined,
    price: Number.isFinite(price) && price > 0 ? price : undefined,
    discount: row.discount != null ? Number(row.discount) || 0 : undefined,
    image: row.image || undefined,
  };
}

// Shopee only — reads the D1 index rebuildDatafeedIndex() below maintains,
// instead of downloading+scanning the ~19MB CSV per request (measured live
// 2026-09-11: up to ~4s on a miss, the old DATAFEED_SEARCH_TIMEOUT_MS path
// further below — still used for Lazada, whose datafeed CSV is real but
// currently empty, so this was never worth the same D1 treatment yet).
// `env` is the one necessary addition to this function's inputs — D1 is
// only reachable through the bindings object, which the call sites already
// have in scope; platform/productUrl/return shape are all unchanged.
//
// On a D1 miss, falls back to the real GET /v1/datafeeds API (see
// fetchShopeeProductFromDatafeedApi above) before giving up — catches a
// product added to ACCESSTRADE's feed after the last hourly rebuild, or
// one whose price/name changed since. A live-API hit is opportunistically
// upserted into D1 (same ON CONFLICT DO UPDATE pattern rebuildDatafeedIndex
// uses) so the NEXT request for this same product is a fast D1 hit again —
// self-healing cache, never a second API call for the same product within
// the same hour unless rebuildDatafeedIndex overwrites it first anyway.
async function lookupShopeeProductFromIndex(productUrl, env) {
  const ids = extractShopeeIds(productUrl);
  if (!ids) return undefined;
  const id = `${ids.shopId}_${ids.itemId}`;
  let row;
  // TEMPORARY perf-only instrumentation — d1Lookup/datafeedFallback split
  // out of the combined "[PERF] datafeed" total already logged one level up
  // (handleCreateLink), to see which half of a miss is actually slow.
  const d1Start = Date.now();
  try {
    row = await env.DATAFEED_DB.prepare(
      'SELECT name, price, discount, image FROM shopee_products WHERE id = ?1',
    ).bind(id).first();
  } catch (err) {
    console.error(`[DatafeedIndex] D1 lookup threw for id=${id}:`, err.message);
  }
  console.log(`[PERF] d1Lookup: ${Date.now() - d1Start} ms (${row ? 'HIT' : 'MISS'})`);
  if (row) {
    return {
      name: row.name || undefined,
      price: row.price && row.price > 0 ? row.price : undefined,
      discount: row.discount != null ? row.discount : undefined,
      image: row.image || undefined,
    };
  }

  let apiProduct;
  const fallbackStart = Date.now();
  try {
    apiProduct = await fetchShopeeProductFromDatafeedApi(env, ids);
  } catch (err) {
    console.error(`[DatafeedIndex] /v1/datafeeds fallback threw for id=${id}:`, err.message);
    console.log(`[PERF] datafeedFallback: ${Date.now() - fallbackStart} ms (threw)`);
    return undefined;
  }
  console.log(`[PERF] datafeedFallback: ${Date.now() - fallbackStart} ms (${apiProduct ? 'HIT' : 'MISS'})`);
  if (!apiProduct) return undefined;

  try {
    await env.DATAFEED_DB.prepare(
      'INSERT INTO shopee_products (id, name, price, discount, image, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ' +
      'ON CONFLICT(id) DO UPDATE SET name=excluded.name, price=excluded.price, discount=excluded.discount, image=excluded.image, updated_at=excluded.updated_at',
    ).bind(id, apiProduct.name || null, apiProduct.price || null, apiProduct.discount ?? 0, apiProduct.image || null, Date.now()).run();
  } catch (err) {
    // Best-effort cache population only — a write failure here must never
    // fail the lookup itself, since apiProduct is already real, correct
    // data ready to return regardless of whether it gets cached.
    console.error(`[DatafeedIndex] D1 cache-populate failed for id=${id}:`, err.message);
  }
  return apiProduct;
}

async function lookupDatafeedProduct(platform, productUrl, env) {
  if (platform === 'SHOPEE') {
    return lookupShopeeProductFromIndex(productUrl, env);
  }
  // ---- Lazada only below — unchanged CSV-download-and-scan path. Its
  // datafeed CSV is real but currently an empty file (header row only, see
  // this file's own earlier investigation notes), so this practically
  // never runs today; left exactly as it was rather than folding Lazada
  // into the new D1 index before there's any real data to index. ----
  const feedUrl = DATAFEED_CSV_URL[platform];
  if (!feedUrl) return undefined;
  const searchUrl = productUrl;
  if (!searchUrl) return undefined;
  const needle = `"${searchUrl}"`;
  const deadline = Date.now() + DATAFEED_SEARCH_TIMEOUT_MS;

  const res = await fetch(feedUrl);
  if (!res.ok || !res.body) return undefined;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let foundIdx = -1;
  try {
    for (;;) {
      if (Date.now() > deadline) {
        console.log(`[ProductResolver] datafeed search timed out (${platform}) after ${DATAFEED_SEARCH_TIMEOUT_MS}ms — treating as not found`);
        return undefined;
      }
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

// --- Datafeed index rebuild (Shopee only, D1) ---------------------------

// Splits already-decoded text into complete CSV rows, respecting quoted
// fields — a field can itself contain a literal newline (the `desc`
// column does, confirmed live), so a plain string.split('\n') would cut
// a real row in half. Toggling `inQuotes` on every `"` character (rather
// than trying to specially detect the `""` escaped-quote sequence) is
// still correct here: an escaped `""` toggles twice in a row, which nets
// to no change, so `inQuotes` only ever really flips at a field's true
// open/close quote regardless of how many escaped quotes sit inside it.
// Returns the complete rows found plus whatever incomplete tail is left
// over (to be prepended to the next chunk).
function splitCsvRows(text) {
  const rows = [];
  let start = 0;
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === '\n' && !inQuotes) {
      rows.push(text.slice(start, i));
      start = i + 1;
    }
  }
  return { rows, rest: text.slice(start) };
}

// Parses one complete CSV row into its raw field strings — same
// quote-toggle idea as splitCsvRows, but this time actually unescaping
// `""` into a literal `"` since callers need the real field VALUE, not
// just where it ends.
function parseCsvRow(row) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') {
      if (inQuotes && row[i + 1] === '"') { field += '"'; i++; } else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += c;
    }
  }
  fields.push(field);
  return fields;
}

const DATAFEED_REBUILD_BATCH_SIZE = 200; // rows per D1 batch() call — small enough that one slow/failed batch never risks a huge amount of already-parsed work, large enough not to spend more calls than rows need for ~13K real rows
// Purely a defensive wall-clock ceiling (NOT the same thing as Cloudflare's
// own CPU-time budget, which this can't observe directly) — if a run
// somehow runs unexpectedly long (slow upstream CSV, slow D1), stop
// cleanly instead of risking the platform killing the invocation mid-
// batch. Whatever rows were already upserted stay (real, correct data),
// and the next hourly tick simply starts over from the top — never
// corrupts anything, matches the "never delete, only upsert" safety
// requirement below.
const DATAFEED_REBUILD_WALLCLOCK_CAP_MS = 25000;

// Reads ACCESSTRADE's real Shopee datafeed CSV ONCE and upserts every row
// into D1's shopee_products table, keyed by "<shopId>_<itemId>" (the same
// identity extractShopeeIds/shopeeProductId already use elsewhere in this
// file — never a new concept of "product"). Runs on its own hourly cron
// (see the scheduled() handler below) — completely separate from
// pollOrders()'s */5 * * * * schedule, and never invoked from the
// customer-facing /create-link path (lookupDatafeedProduct above only
// ever READS this table).
//
// Safety, per this task's own requirements: every write is an upsert
// (`ON CONFLICT ... DO UPDATE`) — nothing is ever DELETEd, and no
// "truncate first" step exists, so a run that fails or gets cut off
// partway through never leaves the table in a worse state than before it
// started; whatever rows it reached are simply refreshed, everything
// else keeps its previous (still real, just not-yet-refreshed) value.
async function rebuildDatafeedIndex(env) {
  const startedAt = Date.now();
  const feedUrl = DATAFEED_CSV_URL.SHOPEE;
  let res;
  try {
    res = await fetch(feedUrl);
  } catch (err) {
    console.error('[DatafeedIndex] fetch threw:', err.message);
    return;
  }
  if (!res.ok || !res.body) {
    console.error(`[DatafeedIndex] fetch failed: HTTP ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let sawHeader = false;
  let pending = [];
  let scanned = 0;
  let upserted = 0;
  let malformed = 0;
  let stoppedEarly = false;

  const flush = async () => {
    if (pending.length === 0) return;
    const now = Date.now();
    // FIXED 2026-09-13 — this used to unconditionally rewrite every one of
    // the ~13K rows every single hourly run: 13K rows x 24 runs/day is
    // ~312K row-writes/day against D1's free-tier 100K/day cap, which is
    // exactly what exhausted it on 2026-09-12 (confirmed via the Cloudflare
    // quota-exceeded email). The WHERE clause on DO UPDATE makes SQLite
    // skip the write entirely for a row whose name/price/discount/image
    // haven't actually changed since the last run — `IS NOT` (not `!=`) so
    // a NULL-vs-NULL comparison correctly counts as "unchanged" instead of
    // always triggering a write. `updated_at` is deliberately left OUT of
    // the WHERE (and would otherwise always differ) — a genuinely-new
    // `now` alone must never force a write. Real-world days only have a
    // small fraction of ~13K products change price/discount, so this
    // should keep total daily writes well under quota. `results[i].meta.
    // changes` (0 when the WHERE skipped it, 1 when it actually wrote) is
    // summed for `upserted` so the log line reports real writes, not rows
    // merely considered.
    const stmts = pending.map((row) =>
      env.DATAFEED_DB.prepare(
        'INSERT INTO shopee_products (id, name, price, discount, image, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ' +
        'ON CONFLICT(id) DO UPDATE SET name=excluded.name, price=excluded.price, discount=excluded.discount, image=excluded.image, updated_at=excluded.updated_at ' +
        'WHERE shopee_products.name IS NOT excluded.name OR shopee_products.price IS NOT excluded.price ' +
        'OR shopee_products.discount IS NOT excluded.discount OR shopee_products.image IS NOT excluded.image',
      ).bind(row.id, row.name, row.price, row.discount, row.image, now),
    );
    const results = await env.DATAFEED_DB.batch(stmts);
    upserted += results.reduce((sum, r) => sum + (r?.meta?.changes || 0), 0);
    pending = [];
  };

  const processRow = (rawRow) => {
    if (!rawRow.trim()) return;
    if (!sawHeader) { sawHeader = true; return; } // skip the "sku","name",... header line
    scanned++;
    const fields = parseCsvRow(rawRow);
    // "sku","name","url","price","discount","image","desc","category"
    const [, name, url, priceRaw, discountRaw, image] = fields;
    const ids = url ? extractShopeeIds(url) : null;
    if (!ids) { malformed++; return; }
    const price = Number(priceRaw);
    pending.push({
      id: `${ids.shopId}_${ids.itemId}`,
      name: name || null,
      price: Number.isFinite(price) && price > 0 ? price : null,
      discount: discountRaw ? Number(discountRaw) || 0 : 0,
      image: image || null,
    });
  };

  try {
    for (;;) {
      if (Date.now() - startedAt > DATAFEED_REBUILD_WALLCLOCK_CAP_MS) {
        stoppedEarly = true;
        console.log(`[DatafeedIndex] stopped at wall-clock cap (${DATAFEED_REBUILD_WALLCLOCK_CAP_MS}ms) — will resume from the top on the next hourly tick`);
        break;
      }
      const { done, value } = await reader.read();
      if (value) carry += decoder.decode(value, { stream: true });
      const { rows, rest } = splitCsvRows(carry);
      carry = rest;
      for (const row of rows) {
        processRow(row);
        if (pending.length >= DATAFEED_REBUILD_BATCH_SIZE) await flush();
      }
      if (done) {
        if (carry.trim()) processRow(carry); // final row with no trailing newline
        break;
      }
    }
    await flush(); // last partial batch
  } catch (err) {
    console.error('[DatafeedIndex] rebuild threw mid-run:', err.message);
    // Whatever was already flushed above this point is real, valid data —
    // left in place deliberately, per the "never corrupt on failure" rule.
  } finally {
    try { reader.cancel(); } catch { /* best-effort */ }
  }

  console.log(
    `[DatafeedIndex] rebuild ${stoppedEarly ? 'stopped early' : 'finished'}: ${scanned} row(s) scanned, ` +
    `${upserted} upserted, ${malformed} malformed/unmatched, ${Date.now() - startedAt}ms`,
  );
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

  // TEMPORARY perf-only instrumentation — same call, same result, just timed.
  const verifyStart = Date.now();
  const uid = await verifyFirebaseIdToken(env, idToken);
  console.log(`[PERF] verifyFirebaseIdToken: ${Date.now() - verifyStart} ms`);
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
          productId: data.product_id ? String(data.product_id) : undefined,
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
    // Three genuinely independent calls — none needs another's result —
    // kicked off together instead of sequentially, so total latency is
    // the SLOWEST of the three rather than their sum. Previously
    // sequential: commission rate + datafeed lookup only started AFTER
    // create-link finished, purely additive wait for no reason (confirmed
    // live 2026-09-09 as a real, customer-visible slowdown, alongside the
    // datafeed search's own worst-case time — see
    // DATAFEED_SEARCH_TIMEOUT_MS above). If create-link itself fails
    // below, the other two settle in the background and are simply
    // discarded — wasted work in that one case, never a correctness
    // issue, and a fair trade for the common (success) case being faster.
    // TEMPORARY perf-only instrumentation below (createLinkStart/
    // commissionStart/datafeedStart + the .finally() on each promise) —
    // appended purely to log each branch's own real duration without
    // altering what it resolves/rejects to, or the existing .catch()
    // fallback values. Remove once the real bottleneck is confirmed.
    const createLinkStart = Date.now();
    const createLinkPromise = accesstradeApi(env, 'POST', '/v1/product_link/create', {
      body: { campaign_id: campaignId, urls: [productUrl], ...trackingFields },
    }).finally(() => {
      console.log(`[PERF] product_link/create: ${Date.now() - createLinkStart} ms`);
    });
    // See resolveCommission's own comment for the tier order (category
    // policy when this account eventually gets access, campaign-wide flat
    // rate today) and its reliability tier. Best-effort only — each tier
    // is cached at the edge, so this is a cache hit for all but the first
    // request per campaign per cache window; a failure here must never
    // fail the link itself.
    const commissionStart = Date.now();
    const commissionResolutionPromise = resolveCommission(env, { platform, campaignId }).catch((err) => {
      console.error(`resolveCommission threw (${platform}):`, err.message);
      return undefined;
    }).finally(() => {
      console.log(`[PERF] resolveCommission: ${Date.now() - commissionStart} ms`);
    });
    // ProductResolver — real name/price/discount/image, when this
    // platform's ACCESSTRADE datafeed CSV actually has this product (see
    // lookupDatafeedProduct's own comment: Shopee's feed is real/current;
    // Lazada's is currently empty — its 1M+-product Datafeed API was
    // investigated and ruled out for per-URL lookup, see that comment).
    // Always attempted (not gated on commissionRate) since name/image are
    // useful even when no rate is available. A failure here must never
    // fail the link itself.
    const datafeedStart = Date.now();
    const productPromise = lookupDatafeedProduct(platform, productUrl, env).catch((err) => {
      console.error(`datafeed product lookup threw (${platform}):`, err.message);
      return undefined;
    }).finally(() => {
      console.log(`[PERF] datafeed: ${Date.now() - datafeedStart} ms`);
    });

    const { ok, json } = await createLinkPromise;
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
    const [commissionResolution, product] = await Promise.all([commissionResolutionPromise, productPromise]);
    const commissionRate = commissionResolution?.rate;
    const commissionSource = commissionResolution?.source;
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
    // Shopee's shopId_itemId pair IS its unique product identity (same
    // pair extractShopeeIds/canonicalShopeeDatafeedUrl already use to
    // match the datafeed) — sent even when the datafeed itself had no
    // matching row, so the frontend can tell "we know which product this
    // is, just no price for it" apart from "identity never determined at
    // all" (e.g. an unresolved short link) — see get-cashback-link/
    // page.tsx's productIdentityKnown. No equivalent extractor exists for
    // Lazada yet (out of scope this round — see extractShopeeIds's own
    // comment for why a URL-based Lazada product id can't be resolved via
    // its Datafeed API).
    const shopeeProductId = platform === 'SHOPEE'
      ? (() => { const ids = extractShopeeIds(productUrl); return ids ? `${ids.shopId}_${ids.itemId}` : undefined; })()
      : undefined;
    return Response.json({
      supported: true,
      affLink: successLink.short_link || successLink.aff_link,
      ...(commission ? { commission, priceSource: 'ACCESSTRADE_DATAFEED' } : commissionRate ? { commissionRate } : {}),
      // Which resolveCommission() tier produced commissionRate/commission
      // above — orthogonal to priceSource (that's about where the PRICE
      // came from; this is about where the RATE came from). Always
      // 'ACCESSTRADE_CAMPAIGN_POLICY' today (see resolveCommission's own
      // comment on why the category tier is currently always inert).
      ...(commissionSource ? { commissionSource } : {}),
      ...(product ? { product: { productId: shopeeProductId, name: product.name, image: product.image, price: product.price, discount: product.discount, dataSource: 'ACCESSTRADE_DATAFEED', updatedAt: new Date().toISOString() } } : {}),
      ...(shopeeProductId ? { productId: shopeeProductId } : {}),
      // Diagnostic only — never read by any commission/estimate logic, only
      // surfaced so the frontend/ops can tell WHY Shopee's D1 lookup came up
      // empty without needing a live wrangler tail: 'url_parse_failed' means
      // extractShopeeIds itself couldn't find a shopId/itemId pair in this
      // URL (shopeeProductId is undefined); 'product_not_found' means the
      // pair WAS extracted but that key isn't in the shopee_products D1
      // index (see lookupShopeeProductFromIndex) — a real, expected miss for
      // a product outside ACCESSTRADE's ~12.8K-row Shopee datafeed. Lazada
      // deliberately excluded (still on the old CSV-scan path, out of scope
      // for this field).
      ...(platform === 'SHOPEE' && !product ? { productLookupReason: shopeeProductId ? 'product_not_found' : 'url_parse_failed' } : {}),
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
// Shows the real commission SPLIT PREVIEW (customer/admin) alongside the
// raw commissionAmount ACCESSTRADE reported, per this task's own explicit
// requirement — Admin approving from Topic 33 must be able to see what
// duyệt đơn actually implies in money terms, computed via the SAME
// computeCommissionSplit/COMMISSION_SPLIT this whole codebase uses
// everywhere else (never a new formula, see this file's own comment on
// computeCommissionSplit above). commissionStatusLabel is ACCESSTRADE's
// OWN current verdict (PENDING/APPROVED/REJECTED) — shown explicitly so
// Admin never mistakes "Đã duyệt đơn" for "ACCESSTRADE đã APPROVED".
function renderNewOrderMessage(fields) {
  return [
    '🆕 <b>ĐƠN HÀNG MỚI (ACCESSTRADE)</b>',
    `👤 <b>Khách hàng:</b> <code>${escapeHtml(fields.requesterLabel)}</code>`,
    `🛍️ <b>Sản phẩm:</b> <code>${escapeHtml(fields.productName)}</code>`,
    `🏬 <b>Sàn:</b> <code>${escapeHtml(fields.platformLabel)}</code>`,
    `💰 <b>Giá trị đơn:</b> <code>${escapeHtml(formatVnd(fields.orderValue))}</code>`,
    `💵 <b>Hoa hồng thực tế:</b> <code>${escapeHtml(formatVnd(fields.commissionAmount))}</code>`,
    `🤑 <b>Khách được hoàn:</b> <code>${escapeHtml(formatVnd(fields.customerAmount))}</code>`,
    `🏦 <b>Hệ thống/Admin:</b> <code>${escapeHtml(formatVnd(fields.platformAmount))}</code>`,
    `🆔 <b>Mã đơn:</b> <code>${escapeHtml(fields.orderId)}</code>`,
    `🔗 <b>ACCESSTRADE order_id:</b> <code>${escapeHtml(fields.externalOrderId)}</code>`,
    `📶 <b>Trạng thái hoa hồng:</b> ${escapeHtml(fields.commissionStatusLabel)}`,
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

// FIXED 2026-09-12 — a real order (260912VUDW3U) was created successfully
// but Topic 33 was never sent: the old code sent the message and, whether
// or not it actually succeeded, moved on with no way to notice or retry a
// failure later (the PENDING branch below only ever refreshed
// commissionStatus, never re-checked whether Topic 33 had gone out).
// SENDS FIRST, marks orderNotificationSentAt only once Telegram actually
// confirms delivery — the opposite order from payoutNotificationSentAt's
// own claim-before-send pattern (Topic 13), deliberately: Topic 13 guards
// against ever double-triggering something release-adjacent, while a
// missed Topic 33 means an order silently never gets Admin's attention at
// all, which is the worse failure mode here. The realistic cost of this
// ordering — an extremely rare duplicate message if two ticks somehow
// overlap on the exact same order — is a harmless Telegram duplicate, not
// a money-moving event. Returns true once a message has been sent,
// regardless of whether the metadata patch that follows it succeeds (a
// lost patch race just means another cycle already recorded the same
// real send moments ago).
async function sendTopic33AndMark(env, idToken, orderId, currentUpdateTime, messageFields) {
  const telegramRef = await sendTelegramNewOrder(env, messageFields);
  if (!telegramRef) {
    console.error(`order ${orderId}: Topic 33 send failed — orderNotificationSentAt NOT set, will retry on a later cron tick`);
    return false;
  }
  const precondition = currentUpdateTime
    ? `&currentDocument.updateTime=${encodeURIComponent(currentUpdateTime)}`
    : '&currentDocument.exists=true';
  const res = await fetch(
    `${firestoreDocUrl(env, 'orders', orderId)}?updateMask.fieldPaths=telegramChatId&updateMask.fieldPaths=telegramMessageId&updateMask.fieldPaths=orderNotificationSentAt${precondition}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          telegramChatId: { stringValue: telegramRef.chatId },
          telegramMessageId: { integerValue: String(telegramRef.messageId) },
          orderNotificationSentAt: { timestampValue: new Date().toISOString() },
        },
      }),
    },
  ).catch((err) => {
    console.error(`order ${orderId}: Topic 33 metadata patch threw:`, err.message);
    return null;
  });
  if (res && (res.status === 409 || res.status === 400)) {
    console.log(`order ${orderId}: another cycle already recorded a Topic 33 send — this send's own message stays sent regardless`);
  } else if (!res || !res.ok) {
    console.error(`order ${orderId}: Topic 33 metadata patch failed (message WAS sent — orderNotificationSentAt may retry-resend next cycle)`);
  }
  return true;
}

// Backfill for a still-PENDING order whose Topic 33 was never confirmed
// sent — checked on every cron tick a PENDING order is seen again (see the
// PENDING branch below), so a one-off Telegram failure self-heals within
// one cycle instead of leaving Admin permanently unaware of a real order.
async function backfillOrderNotification(env, idToken, orderId, existingDoc, platform, commissionStatusLabel, commissionAmount) {
  const userId = fv(existingDoc.fields, 'userId');
  const externalOrderId = fv(existingDoc.fields, 'externalOrderId') || orderId;
  const orderValue = fv(existingDoc.fields, 'orderValue') || 0;
  const productName = fv(existingDoc.fields, 'productName') || `Đơn hàng ACCESSTRADE #${externalOrderId}`;
  const userDoc = await firestoreGet(env, idToken, 'users', userId).catch(() => null);
  const requesterLabel = (userDoc && (fv(userDoc.fields, 'fullName') || fv(userDoc.fields, 'email'))) || userId;
  const referredByCode = userDoc ? fv(userDoc.fields, 'referredBy') : undefined;
  const referrerUid = await resolveReferrerUid(env, idToken, userId, referredByCode).catch((err) => {
    console.error(`order ${orderId}: referrer lookup for Topic 33 backfill threw:`, err.message);
    return null;
  });
  const split = computeCommissionSplit(commissionAmount, !!referrerUid);
  const notified = await sendTopic33AndMark(env, idToken, orderId, existingDoc.updateTime, {
    requesterLabel,
    productName,
    platformLabel: PLATFORM_LABEL[platform] ?? platform,
    orderValue,
    commissionAmount: Math.round(commissionAmount),
    customerAmount: split.customerAmount,
    platformAmount: split.platformAmount,
    commissionStatusLabel,
    orderId,
    externalOrderId,
  });
  console.log(`order ${orderId}: Topic 33 backfill attempt, notified=${notified}`);
}

// --- Commission split preview (Topic 33) + payout-eligibility detection ---
// Mirrors computeCommissionSplit()/COMMISSION_SPLIT in apps/web/lib/
// orderEntry.ts and workers/telegram-bot/src/index.js exactly (same
// reason both of those already carry their own copy — no shared build
// between this Worker and the web app or the OTHER Worker). Used ONLY to
// render a preview in the Topic 33 "đơn hàng cần duyệt" message, computed
// fresh from the real commissionAmount ACCESSTRADE reported — never
// written anywhere, never the actual split used for the real ledger
// entries (those are created by lib/orderEntry.ts/handleOrderDecision
// when Admin taps "✅ Duyệt đơn hàng", exactly as before this change).
const COMMISSION_SPLIT = {
  CUSTOMER_WITH_REFERRER: 0.75,
  REFERRER_BONUS: 0.05,
  CUSTOMER_NO_REFERRER: 0.8,
  PLATFORM_SHARE: 0.2,
};

function computeCommissionSplit(commissionAmount, hasReferrer) {
  const safeAmount = Math.max(0, Math.round(commissionAmount || 0));
  if (hasReferrer) {
    return {
      customerAmount: Math.round(safeAmount * COMMISSION_SPLIT.CUSTOMER_WITH_REFERRER),
      referrerAmount: Math.round(safeAmount * COMMISSION_SPLIT.REFERRER_BONUS),
      platformAmount: Math.round(safeAmount * COMMISSION_SPLIT.PLATFORM_SHARE),
    };
  }
  return {
    customerAmount: Math.round(safeAmount * COMMISSION_SPLIT.CUSTOMER_NO_REFERRER),
    referrerAmount: 0,
    platformAmount: Math.round(safeAmount * COMMISSION_SPLIT.PLATFORM_SHARE),
  };
}

// Mirrors workers/telegram-bot/src/index.js's findUserIdByReferralCode/
// resolveReferrerUid exactly — same reason as computeCommissionSplit above.
async function findUserIdByReferralCode(env, idToken, referralCode) {
  const rows = await firestoreRunQuery(env, idToken, {
    from: [{ collectionId: 'users' }],
    where: { fieldFilter: { field: { fieldPath: 'referralCode' }, op: 'EQUAL', value: { stringValue: referralCode } } },
  });
  if (rows.length === 0) return null;
  const parts = rows[0].document.name.split('/');
  return parts[parts.length - 1];
}

async function resolveReferrerUid(env, idToken, customerUserId, customerReferredBy) {
  if (!customerReferredBy) return null;
  const referrerUid = await findUserIdByReferralCode(env, idToken, customerReferredBy);
  if (!referrerUid || referrerUid === customerUserId) return null;
  return referrerUid;
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
    // FIXED 2026-09-12 — CONFIRMED live against a real order-products
    // response (order_id 260911RD0KW95Q): `data` is a LIST of per-product
    // line items (one per product in the order), and the real tracking
    // value lives at each row's `_extra.sub_params.sub1` — NOT
    // `_extra.parameters.sub_id1`, which this previously read and which
    // this account's real responses have never actually populated (always
    // silently produced mappingResult 'UNKNOWN', for every order, not just
    // this one). Every line item of the same order was created from the
    // same tracking link, so any row's sub1 is equally valid — the first
    // defined one is used.
    const rows = Array.isArray(json?.data) ? json.data : (json?.data ? [json.data] : []);
    const subId = rows.map((row) => row?._extra?.sub_params?.sub1).find((v) => !!v);
    // CONFIRMED live against the same real response (order_id
    // 260911RD0KW95Q): each row's real product title lives at
    // `_extra.product_name`, not any documented field — a "bonus"/reward
    // line item carries an empty string there, so this skips blanks and
    // takes the first row with a real name. Falls back to the old
    // ACCESSTRADE-id placeholder only when no row has one at all (never an
    // empty product name written to Firestore).
    const productName = rows.map((row) => row?._extra?.product_name).find((v) => !!v) || `Đơn hàng ACCESSTRADE #${externalOrderId}`;
    console.log(`order ${externalOrderId}: raw order-products data (full, for manual review) =`, JSON.stringify(json?.data));

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
      `sub1 ACCESSTRADE trả về: ${subId ?? '(KHÔNG CÓ — không dòng nào trong data[] có _extra.sub_params.sub1)'}`,
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
      productName: { stringValue: productName },
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
      // Set only once sendTopic33AndMark's own send actually succeeds —
      // stays null (not this order's fault) if the very first Topic 33
      // attempt fails right after creation, so the PENDING branch below
      // retries it on a later tick instead of the order silently sitting
      // with no alert ever sent. See that function's own comment.
      orderNotificationSentAt: { nullValue: null },
    };

    if (env.DRY_RUN !== 'false') {
      console.log(`[DRY_RUN] would CREATE ${orderId} for userId=${userId}, value=${orderValue}, commission=${commissionAmount}`);
      return;
    }

    const { created, updateTime } = await firestoreCreate(env, idToken, 'orders', orderId, orderFields);
    if (!created) {
      console.log(`order ${orderId}: create raced/lost (already exists) — no-op, no duplicate`);
      return;
    }

    const userDoc = await firestoreGet(env, idToken, 'users', userId).catch(() => null);
    const requesterLabel = (userDoc && (fv(userDoc.fields, 'fullName') || fv(userDoc.fields, 'email'))) || userId;
    // Preview only (see computeCommissionSplit's own comment) — the REAL
    // ledger entries (and their own referrer resolution) are created later,
    // unchanged, when Admin actually taps "✅ Duyệt đơn hàng".
    const referredByCode = userDoc ? fv(userDoc.fields, 'referredBy') : undefined;
    const referrerUid = await resolveReferrerUid(env, idToken, userId, referredByCode).catch((err) => {
      console.error(`order ${externalOrderId}: referrer lookup for Topic 33 preview threw:`, err.message);
      return null;
    });
    const split = computeCommissionSplit(commissionAmount, !!referrerUid);
    const notified = await sendTopic33AndMark(env, idToken, orderId, updateTime, {
      requesterLabel,
      productName,
      platformLabel: PLATFORM_LABEL[platform] ?? platform,
      orderValue,
      commissionAmount,
      customerAmount: split.customerAmount,
      platformAmount: split.platformAmount,
      commissionStatusLabel: status,
      orderId,
      externalOrderId,
    });
    console.log(`order ${orderId}: created (PENDING), Telegram notified: ${notified}`);
    return;
  }

  // Already exists — either refresh commissionStatus while still PENDING,
  // or trigger the clawback path if ACCESSTRADE now reports a rejection/
  // cancellation on an order the admin already CONFIRMED.
  const existingStatus = fv(existing.fields, 'status');
  const existingCommissionStatus = fv(existing.fields, 'commissionStatus');

  if (existingStatus === 'PENDING') {
    const commissionChanged = existingCommissionStatus !== status || fv(existing.fields, 'commissionAmount') !== Math.round(commissionAmount);
    if (commissionChanged) {
      if (env.DRY_RUN !== 'false') {
        console.log(`[DRY_RUN] would UPDATE ${orderId} commissionStatus ${existingCommissionStatus} -> ${status}`);
      } else {
        await firestorePatch(env, idToken, 'orders', orderId, {
          commissionStatus: { stringValue: status },
          commissionAmount: { integerValue: String(Math.round(commissionAmount)) },
        });
        console.log(`order ${orderId}: PENDING, commissionStatus refreshed to ${status}`);
      }
    }
    // FIXED 2026-09-12 — see sendTopic33AndMark/backfillOrderNotification's
    // own comments: retries Topic 33 for as long as orderNotificationSentAt
    // is still missing on a real, existing PENDING order, so one Telegram
    // hiccup right after creation never leaves an order permanently
    // un-alerted. Never runs under DRY_RUN (this Worker must not write
    // anything at all in that mode, matching every other branch here).
    if (env.DRY_RUN === 'false' && !fv(existing.fields, 'orderNotificationSentAt')) {
      await backfillOrderNotification(env, idToken, orderId, existing, platform, status, commissionAmount);
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

  if (existingStatus === 'CONFIRMED') {
    // FIXED 2026-09-12 — this used to be "nothing to do this cycle" for
    // every CONFIRMED order not being rejected, which meant commissionStatus
    // froze at whatever value it had the instant Admin approved and could
    // NEVER reach APPROVED afterwards, no matter what ACCESSTRADE later
    // reported. Now keeps syncing commissionStatus/commissionAmount for as
    // long as ACCESSTRADE keeps reporting this order, and — once (and only
    // once) that sync reveals APPROVED with a real commission — notifies
    // Topic 13. Never touches order.status here (that's the REFUNDED
    // clawback branch above, or Admin/Telegram's own CONFIRMED write).
    await syncConfirmedOrderCommission(env, idToken, orderId, existing, status, commissionAmount, platform);
    return;
  }

  // Already REFUNDED/CANCELLED — nothing to do this cycle.
}

// --- Payout-eligibility detection (Topic 13), run only for an order
// Admin has already CONFIRMED (see processOneOrder above) ---------------

// Single source of truth for "does ACCESSTRADE's own data say this
// commission is safe to pay out" — deliberately narrow (only the ACCESSTRADE
// side of eligibility; commissionAmount/order/ledger state are checked by
// this function's own caller and by notifyPayoutEligible below, and the
// REAL, final backend gate before money ever moves is firestore.rules'
// canReleaseLedgerFor(), not this function). Exported in spirit (not
// literally, this Worker has no module system beyond this one file) as the
// one place this decision is made — manager/payouts/page.tsx's own
// isEligibleForPayout() checks the exact same order.commissionStatus field,
// just from the browser instead of from this cron.
function isAccesstradeApproved(commissionStatus, commissionAmount) {
  return commissionStatus === 'APPROVED' && commissionAmount > 0;
}

async function syncConfirmedOrderCommission(env, idToken, orderId, existingDoc, freshCommissionStatus, freshCommissionAmount, platform) {
  const existingCommissionStatus = fv(existingDoc.fields, 'commissionStatus');
  const existingCommissionAmount = fv(existingDoc.fields, 'commissionAmount');
  const alreadyNotified = !!fv(existingDoc.fields, 'payoutNotificationSentAt');
  const roundedAmount = Math.round(freshCommissionAmount) || 0;
  let currentUpdateTime = existingDoc.updateTime;

  const commissionChanged = existingCommissionStatus !== freshCommissionStatus || existingCommissionAmount !== roundedAmount;
  if (commissionChanged) {
    if (env.DRY_RUN !== 'false') {
      console.log(`[DRY_RUN] would SYNC ${orderId} (CONFIRMED) commissionStatus ${existingCommissionStatus} -> ${freshCommissionStatus}, commissionAmount ${existingCommissionAmount} -> ${roundedAmount}`);
      return;
    }
    try {
      const patched = await firestorePatch(env, idToken, 'orders', orderId, {
        commissionStatus: { stringValue: freshCommissionStatus },
        commissionAmount: { integerValue: String(roundedAmount) },
      });
      currentUpdateTime = patched.updateTime || currentUpdateTime;
      console.log(`order ${orderId}: CONFIRMED, commissionStatus synced ${existingCommissionStatus} -> ${freshCommissionStatus} (amount ${roundedAmount})`);
    } catch (err) {
      console.error(`order ${orderId}: commissionStatus sync failed:`, err.message);
      return; // don't act on eligibility against data that may now be stale
    }
  }

  if (!isAccesstradeApproved(freshCommissionStatus, roundedAmount)) {
    console.log(`order ${orderId}: not eligible for payout yet (commissionStatus=${freshCommissionStatus}, amount=${roundedAmount})`);
    return;
  }
  if (alreadyNotified) {
    return; // already handled on a previous cycle — see tryClaimPayoutNotification's own comment
  }

  if (env.DRY_RUN !== 'false') {
    console.log(`[DRY_RUN] would CHECK payout eligibility + notify Topic 13 for ${orderId} (commissionStatus=APPROVED, amount=${roundedAmount})`);
    return;
  }

  // Claim BEFORE looking up the ledger or sending anything — see this
  // function's own precondition comment. Losing the claim means another
  // cron tick (or a retry of this same one, e.g. after a transient error)
  // already owns sending this order's Topic 13 message.
  const claimed = await tryClaimPayoutNotification(env, idToken, orderId, currentUpdateTime);
  if (!claimed) {
    console.log(`order ${orderId}: another cycle already claimed the payout notification — skipping`);
    return;
  }

  await notifyPayoutEligible(env, idToken, orderId, platform, roundedAmount);
}

// Atomic guard against sending Topic 13 twice for the same order — two
// overlapping cron ticks (a slow previous run still finishing when the next
// one fires), or a retry after a Worker restart mid-cycle. Uses the SAME
// currentDocument.updateTime precondition every other atomic claim in this
// codebase relies on (see tryClaimOrderStatus in workers/telegram-bot for
// the identical pattern): the PATCH only applies if the order doc's
// updateTime still matches what was just read/written a moment ago. Losing
// the race (409/400) means someone else's claim already committed first —
// this caller must NOT proceed to look up the ledger or send anything.
async function tryClaimPayoutNotification(env, idToken, orderId, expectedUpdateTime) {
  const precondition = expectedUpdateTime
    ? `&currentDocument.updateTime=${encodeURIComponent(expectedUpdateTime)}`
    : '&currentDocument.exists=true';
  const res = await fetch(
    `${firestoreDocUrl(env, 'orders', orderId)}?updateMask.fieldPaths=payoutNotificationSentAt${precondition}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { payoutNotificationSentAt: { timestampValue: new Date().toISOString() } } }),
    },
  );
  if (res.status === 409 || res.status === 400) {
    console.log(`tryClaimPayoutNotification: lost the race for ${orderId} (order changed since read)`);
    return false;
  }
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    console.error(`tryClaimPayoutNotification failed for ${orderId}:`, res.status, JSON.stringify(json));
    return false;
  }
  return true;
}

// Sends the Topic 13 "đủ điều kiện hoàn tiền" message — only ever called
// after tryClaimPayoutNotification above has already succeeded, so this
// runs at most once per order. Reads the REAL, already-persisted
// CUSTOMER_CASHBACK/PLATFORM_REVENUE ledger amounts (created by lib/
// orderEntry.ts or workers/telegram-bot's handleOrderDecision when Admin
// tapped "✅ Duyệt đơn hàng" — see this function's own comment on why:
// those already ran the real, referrer-aware computeCommissionSplit, so
// reading them back can never drift from what actually exists) rather than
// recomputing the split itself.
async function notifyPayoutEligible(env, idToken, orderId, platform, commissionAmount) {
  let ledgerRows;
  try {
    ledgerRows = await firestoreRunQuery(env, idToken, {
      from: [{ collectionId: 'cashbackLedger' }],
      where: { fieldFilter: { field: { fieldPath: 'orderId' }, op: 'EQUAL', value: { stringValue: orderId } } },
    });
  } catch (err) {
    console.error(`order ${orderId}: cashbackLedger lookup failed (payoutNotificationSentAt already claimed — will not retry automatically):`, err.message);
    return;
  }

  const customerRow = ledgerRows.find((row) => fv(row.document.fields, 'type') === 'CUSTOMER_CASHBACK');
  const platformRow = ledgerRows.find((row) => fv(row.document.fields, 'type') === 'PLATFORM_REVENUE');
  if (!customerRow) {
    console.error(`order ${orderId}: eligible for payout but NO CUSTOMER_CASHBACK ledger entry exists yet (Admin may not have tapped "Duyệt đơn hàng" through the ledger-creating path) — payoutNotificationSentAt already claimed, Topic 13 NOT sent. Needs manual follow-up.`);
    return;
  }
  const ledgerId = customerRow.document.name.split('/').pop();
  const ledgerStatus = fv(customerRow.document.fields, 'status');
  if (ledgerStatus !== 'FROZEN') {
    console.log(`order ${orderId}: ledger ${ledgerId} is already ${ledgerStatus} (not FROZEN) — Topic 13 not sent, nothing left to approve`);
    return;
  }

  const customerAmount = fv(customerRow.document.fields, 'amount') || 0;
  const platformAmount = platformRow ? (fv(platformRow.document.fields, 'amount') || 0) : Math.max(0, commissionAmount - customerAmount);
  const userId = fv(customerRow.document.fields, 'userId');
  const requesterName = fv(customerRow.document.fields, 'requesterName') || userId;

  const send = await sendTelegramPayoutEligible(env, {
    requesterName,
    platformLabel: PLATFORM_LABEL[platform] ?? platform,
    orderId,
    commissionAmountLabel: formatVnd(commissionAmount),
    customerAmountLabel: formatVnd(customerAmount),
    platformAmountLabel: formatVnd(platformAmount),
    ledgerId,
  });
  if (!send) {
    console.error(`order ${orderId}: Topic 13 send failed for ledger ${ledgerId} — payoutNotificationSentAt already claimed, message NOT sent. Needs manual follow-up (check /manager/payouts).`);
    return;
  }

  await firestorePatch(env, idToken, 'cashbackLedger', ledgerId, {
    telegramChatId: { stringValue: send.chatId },
    telegramMessageId: { integerValue: String(send.messageId) },
  }).catch((err) => console.error(`order ${orderId}: ledger telegram-ref patch failed:`, err.message));
  console.log(`order ${orderId}: Topic 13 sent for ledger ${ledgerId} (customer=${customerAmount}, platform=${platformAmount})`);
}

function renderPayoutEligibleMessage(fields) {
  return [
    '🎉 <b>ĐƠN HÀNG ĐỦ ĐIỀU KIỆN HOÀN TIỀN</b>',
    `👤 <b>Khách hàng:</b> <code>${escapeHtml(fields.requesterName)}</code>`,
    `🏬 <b>Sàn:</b> <code>${escapeHtml(fields.platformLabel)}</code>`,
    `🆔 <b>Mã đơn:</b> <code>${escapeHtml(fields.orderId)}</code>`,
    `💰 <b>Hoa hồng ACCESSTRADE:</b> <code>${escapeHtml(fields.commissionAmountLabel)}</code>`,
    `🤑 <b>Khách nhận:</b> <code>${escapeHtml(fields.customerAmountLabel)}</code>`,
    `🏦 <b>Hệ thống/Admin giữ:</b> <code>${escapeHtml(fields.platformAmountLabel)}</code>`,
    '✅ <b>ACCESSTRADE:</b> APPROVED',
    '🔒 <b>Cashback hiện tại:</b> FROZEN',
    '⏳ <b>Trạng thái:</b> Chờ Admin duyệt hoàn',
  ].join('\n');
}

function payoutEligibleKeyboard(ledgerId) {
  return [[
    { text: '💰 Duyệt hoàn tiền', callback_data: `cb_approve:${ledgerId}` },
    { text: '❌ Từ chối hoàn tiền', callback_data: `cb_reject:${ledgerId}` },
  ]];
}

async function sendTelegramPayoutEligible(env, fields) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return null;
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.TELEGRAM_CHAT_ID,
      message_thread_id: 13,
      parse_mode: 'HTML',
      text: renderPayoutEligibleMessage(fields),
      reply_markup: { inline_keyboard: payoutEligibleKeyboard(fields.ledgerId) },
    }),
  }).then((r) => r.json()).catch((err) => {
    console.error('sendTelegramPayoutEligible threw:', err.message);
    return null;
  });
  if (!res?.ok) return null;
  return { chatId: String(res.result.chat.id), messageId: res.result.message_id };
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

// WIDENED 2026-09-12 from 3 to 72 hours — CONFIRMED live via a real test
// order (order_id 260911RD0KW95Q): ACCESSTRADE's since/until on
// /v1/order-list filters by the order's own click_time/sales_time, NOT by
// when it was last updated/confirmed. That order's click_time was 22:08
// but it wasn't confirmed until 02:18, ~4 hours later — already outside a
// 3-hour window by the time any tick could have seen the confirmed status,
// so it would never have been caught at all. 72 hours gives real
// confirmation delays enough room. Safe to re-scan this much every 5
// minutes: processOneOrder's own firestoreGet-before-write check (keyed on
// the deterministic accesstrade_<order_id> doc id) means an
// already-processed order already existing is only ever cheaply re-checked
// for a status/commission change — never duplicated. order-products'
// own per-new-order throttle (ORDER_PRODUCTS_THROTTLE_MS) and order-list's
// own page cap (ORDER_LIST_MAX_PAGES) are unchanged, so this widening adds
// no new unbounded request growth — it only widens which rows order-list
// itself returns.
const ORDER_LIST_WINDOW_HOURS = 72;

async function pollOrders(env) {
  const idToken = await firestoreSignIn(env);
  // ISO 8601 (not Unix seconds) per ACCESSTRADE's docs — see this file's
  // top-of-file note on since/until.
  const untilIso = new Date().toISOString();
  const sinceIso = new Date(Date.now() - ORDER_LIST_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

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

// Shared gate for every /debug/* route below (except /debug/postback-test,
// which keeps its own separate key since that one's URL is already
// configured on ACCESSTRADE's dashboard — changing its key would break
// that integration). Added 2026-09-13: every /debug/* route was reachable
// by anyone who found the Worker's URL, with no auth at all — several
// return real customer data (userId, commissionAmount) by order id, and
// /debug/rebuild-datafeed lets anyone trigger the same full-table D1
// rewrite job already responsible for exhausting the daily write quota
// once. Not a replacement for real auth (a single shared static string),
// but closes the "wide open to anyone on the internet" gap these were
// deployed with — every one of these routes is an internal operational
// tool, never called by any customer-facing code path.
const DEBUG_ACCESS_KEY = 'dbgkey_7hN3qX9mZp2Lw5Rt';
function isDebugAuthorized(url) {
  return url.searchParams.get('key') === DEBUG_ACCESS_KEY;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/create-link') {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }
      if (request.method === 'POST') {
        // TEMPORARY perf-only instrumentation — wraps the existing call with
        // no change to its logic/response. Remove once the real bottleneck
        // is confirmed and no longer needed.
        const perfStart = Date.now();
        const res = await handleCreateLink(request, env, ctx);
        console.log(`[PERF] total create-link: ${Date.now() - perfStart} ms`);
        const headers = new Headers(res.headers);
        Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
      }
    }
    // Public (no auth — same security model as workers/product-preview,
    // which this replaces for Shopee short links specifically): resolves
    // a real s.shopee.vn share link to its canonical product URL, D1-cached
    // 30 days (see resolveShopeeShortlinkCached above). Called by
    // lib/productPreview.ts's resolveShortlink() ONLY for Shopee short
    // links — Lazada/TikTok Shop short links are untouched, still resolved
    // via workers/product-preview exactly as before. A plain GET with no
    // custom request headers is a CORS "simple request" — no OPTIONS
    // preflight needed, only Access-Control-Allow-Origin on the response.
    if (url.pathname === '/resolve-shortlink') {
      const shortUrl = url.searchParams.get('url');
      if (!shortUrl || !/^https:\/\/s\.shopee\.vn\//i.test(shortUrl)) {
        return Response.json({ error: 'invalid_url' }, { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      const startedAt = Date.now();
      const result = await resolveShopeeShortlinkCached(env, shortUrl);
      console.log(`[PERF] resolveShortlinkCached: ${Date.now() - startedAt} ms (${result?.cacheHit ? 'HIT' : 'MISS'})`);
      return Response.json(
        result ? { ...result, ms: Date.now() - startedAt } : { resolvedUrl: null, ms: Date.now() - startedAt },
        { headers: { 'Access-Control-Allow-Origin': '*' } },
      );
    }
    // Read-only diagnostic: shows exactly what fetchCampaignCommissionRate
    // parses for a given campaign, straight from the confirmed-working
    // /v1/campaigns endpoint — no customer auth needed (nothing account/
    // order-specific), no Firestore access, only ever reads. Useful to
    // verify a rate stays sane after ACCESSTRADE reformats their policy
    // text (see fetchCampaignCommissionRate's own comment).
    if (url.pathname === '/debug/campaign') {
      if (!isDebugAuthorized(url)) return new Response('forbidden', { status: 403 });
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
    // Read-only diagnostic: exercises the REAL resolveCommission() service
    // end-to-end (both tiers, real network calls, real fallback) — no
    // customer auth needed, no Firestore access, only ever reads. This is
    // what actually proves the /v1/cashback/campaigns 401 falls through to
    // the campaign-policy tier correctly, rather than trusting that from
    // reading the code alone. Kept permanently, same operational-tool
    // reasoning as /debug/campaign and /debug/datafeed-lookup above — also
    // the fastest way to notice the moment ACCESSTRADE ever grants this
    // account real /v1/cashback/campaigns access (tier flips to
    // ACCESSTRADE_CASHBACK_CAMPAIGNS with zero code change).
    if (url.pathname === '/debug/commission') {
      if (!isDebugAuthorized(url)) return new Response('forbidden', { status: 403 });
      const campaignId = url.searchParams.get('campaign_id');
      const platform = url.searchParams.get('platform');
      const categoryId = url.searchParams.get('category_id') || undefined;
      const categoryName = url.searchParams.get('category_name') || undefined;
      const startedAt = Date.now();
      const resolution = await resolveCommission(env, { platform, campaignId, categoryId, categoryName });
      return Response.json({ campaignId, platform, categoryId, categoryName, resolution: resolution ?? null, ms: Date.now() - startedAt });
    }
    // Read-only diagnostic: verifies lookupDatafeedProduct against a real
    // URL — no customer auth needed, no Firestore access. Kept
    // permanently (not "temporary") as an operational tool: lets a real
    // product be re-checked directly if ACCESSTRADE ever reformats the
    // CSV in a way that breaks parsing, without needing a customer to
    // reproduce it through the full UI flow.
    if (url.pathname === '/debug/datafeed-lookup') {
      if (!isDebugAuthorized(url)) return new Response('forbidden', { status: 403 });
      const platform = url.searchParams.get('platform');
      const productUrl = url.searchParams.get('url');
      const startedAt = Date.now();
      const product = await lookupDatafeedProduct(platform, productUrl, env);
      return Response.json({ platform, productUrl, product: product ?? null, ms: Date.now() - startedAt });
    }
    // Manual trigger for rebuildDatafeedIndex() — same operational-tool
    // reasoning as the debug routes above, and the only way to verify the
    // rebuild actually completes (row counts, timing) without waiting for
    // the top of the hour. No customer auth, no Firestore access — only
    // ever writes to the D1 index (upsert-only, see that function's own
    // safety comment), never touches anything customer/financial-facing.
    if (url.pathname === '/debug/rebuild-datafeed') {
      if (!isDebugAuthorized(url)) return new Response('forbidden', { status: 403 });
      const startedAt = Date.now();
      await rebuildDatafeedIndex(env);
      return Response.json({ ok: true, ms: Date.now() - startedAt });
    }
    // Read-only diagnostic: exercises the REAL GET /v1/datafeeds endpoint
    // directly (real network call, real Authorization header built from
    // env.ACCESSTRADE_API_KEY server-side only — never returned/logged).
    // Added 2026-09-11 to investigate whether this endpoint can look up a
    // single Shopee product by sku/domain instead of the static CSV. Kept
    // permanently, same operational-tool reasoning as the other /debug/*
    // routes — never called from the customer-facing /create-link path.
    if (url.pathname === '/debug/datafeeds') {
      if (!isDebugAuthorized(url)) return new Response('forbidden', { status: 403 });
      const domain = url.searchParams.get('domain') || undefined;
      const sku = url.searchParams.get('sku') || undefined;
      const campaign = url.searchParams.get('campaign') || undefined;
      const page = url.searchParams.get('page') || undefined;
      const limit = url.searchParams.get('limit') || undefined;
      const price_from = url.searchParams.get('price_from') || undefined;
      const price_to = url.searchParams.get('price_to') || undefined;
      const startedAt = Date.now();
      const { ok, status, json } = await accesstradeApi(env, 'GET', '/v1/datafeeds', {
        query: { domain, sku, campaign, page, limit, price_from, price_to },
      });
      return Response.json({ domain, sku, campaign, page, limit, ok, status, json, ms: Date.now() - startedAt });
    }
    // TEMPORARY read-only diagnostic (added 2026-09-12, per explicit
    // request) — investigates whether pollOrders()'s 3-hour rolling window
    // (see that function's own comment) is wide enough to see a real
    // conversion, or whether ACCESSTRADE's since/until filters by the
    // order's ORIGINAL date rather than by when it was last updated (which
    // would mean an order past that window can never resurface on its
    // own). Reuses fetchAllOrderListPages/configuredMerchants exactly as
    // pollOrders does — same real GET /v1/order-list calls, same
    // pagination/throttle — but with a caller-chosen window and ZERO
    // Firestore access: no order-products call, no user mapping, no
    // Firestore create/update, no interaction with DRY_RUN at all. Never
    // called from pollOrders/scheduled() or from any customer-facing path.
    if (url.pathname === '/debug/order-list') {
      if (!isDebugAuthorized(url)) return new Response('forbidden', { status: 403 });
      const hours = Number(url.searchParams.get('hours')) || 72;
      // Optional, additive — mirrors processOneOrder's own sub_id1 lookup
      // and redirectCache mapping check EXACTLY, but read-only: calls
      // GET /v1/order-products (real network call, same throttle) and
      // firestoreGet on redirectCache (a plain read), never firestoreCreate/
      // firestorePatch, never touches `orders`/`cashbackLedger`, completely
      // independent of DRY_RUN. Off by default (adds a real network call +
      // a 6.5s throttle per order) — pass &mapping=1 to include it.
      const includeMapping = url.searchParams.get('mapping') === '1';
      const untilIso = new Date().toISOString();
      const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const startedAt = Date.now();
      const idToken = includeMapping ? await firestoreSignIn(env) : null;
      const byPlatform = {};
      for (const [platform, merchant] of configuredMerchants(env)) {
        const orders = await fetchAllOrderListPages(env, platform, merchant, sinceIso, untilIso);
        const entries = [];
        for (const order of orders) {
          const externalOrderId = String(order.order_id);
          const entry = {
            order_id: externalOrderId,
            status: deriveOrderStatus(order),
            billing: order.billing,
            pub_commission: order.pub_commission,
            is_confirmed: order.is_confirmed,
            order_approved: order.order_approved,
            order_pending: order.order_pending,
            order_reject: order.order_reject,
            click_time: order.click_time,
            sales_time: order.sales_time,
            confirmed_time: order.confirmed_time,
            update_time: order.update_time,
          };
          if (includeMapping) {
            const { ok, json } = await accesstradeApi(env, 'GET', '/v1/order-products', { query: { order_id: externalOrderId, merchant } });
            await sleep(ORDER_PRODUCTS_THROTTLE_MS);
            entry.orderProductsRaw = json ?? null; // full raw response, for manual review — this is a diagnostic route, not the live path
            // Checking BOTH the shape processOneOrder currently assumes
            // (data._extra.parameters.sub_id1) AND the real shape a live
            // response just showed (data is a LIST of line items, each with
            // its own _extra.sub_params.sub1) — reporting both so it's
            // clear which one (if either) actually carries a value, rather
            // than guessing which is "correct" from one sample.
            const rows = Array.isArray(json?.data) ? json.data : (json?.data ? [json.data] : []);
            const legacyParams = json?.data?._extra?.parameters || json?._extra?.parameters || {};
            const rowSub1 = rows.map((r) => r?._extra?.sub_params?.sub1).find((v) => v);
            entry.sub_id1_legacyPath = legacyParams.sub_id1 ?? null;
            entry.sub1_subParamsPath = rowSub1 ?? null;
            entry.sub_id1 = legacyParams.sub_id1 ?? rowSub1 ?? null;
            entry.redirectCacheDoc = null;
            entry.userId = null;
            entry.mapping = 'UNKNOWN';
            if (entry.sub_id1) {
              const doc = await firestoreGet(env, idToken, 'redirectCache', entry.sub_id1).catch(() => null);
              entry.redirectCacheDoc = !!doc;
              entry.userId = doc ? fv(doc.fields, 'userId') ?? null : null;
              entry.mapping = doc && entry.userId ? 'MATCH' : 'NO_MATCH';
            }
          }
          entries.push(entry);
        }
        byPlatform[platform] = { merchant, count: orders.length, orders: entries };
      }
      return Response.json({ hours, includeMapping, sinceIso, untilIso, byPlatform, ms: Date.now() - startedAt });
    }
    // TEMPORARY test-only receiver (added 2026-09-12, per explicit request)
    // — lets a real ACCESSTRADE Postback call be observed (logged only)
    // before any decision is made about building a real, Firestore-writing
    // receiver. Never reads/writes Firestore, never touches
    // processOneOrder/pollOrders/handleCreateLink or any customer-facing
    // path — purely logs whatever query params arrive and returns 200.
    // Gated by a shared-secret query param (?key=...): not a real security
    // boundary (nothing sensitive is ever exposed or written here), just
    // noise reduction against random callers hitting a guessed path.
    // Remove once the real receiver (if built) supersedes it, or once the
    // test is done and the answer is no.
    if (url.pathname === '/debug/postback-test') {
      const POSTBACK_TEST_KEY = 'pbtest_8f2k1m9x';
      if (url.searchParams.get('key') !== POSTBACK_TEST_KEY) {
        return new Response('forbidden', { status: 403 });
      }
      const params = Object.fromEntries(url.searchParams.entries());
      delete params.key;
      console.log('[PostbackTest] received:', JSON.stringify(params));
      return new Response('OK', { status: 200 });
    }
    // TEMPORARY read-only diagnostic (added 2026-09-12) — plain
    // firestoreGet on a single `orders` doc, to independently confirm what
    // pollOrders actually wrote (or didn't) after a real DRY_RUN=false
    // create, without trusting only the Worker's own log line. Read-only:
    // no write, no update, not part of processOneOrder/pollOrders, never
    // called from any customer-facing path.
    if (url.pathname === '/debug/order-doc') {
      if (!isDebugAuthorized(url)) return new Response('forbidden', { status: 403 });
      const id = url.searchParams.get('id');
      if (!id) return Response.json({ error: 'missing id' }, { status: 400 });
      const idToken = await firestoreSignIn(env);
      const doc = await firestoreGet(env, idToken, 'orders', id);
      if (!doc) return Response.json({ id, exists: false });
      const f = doc.fields;
      return Response.json({
        id,
        exists: true,
        fields: {
          userId: fv(f, 'userId'),
          platform: fv(f, 'platform'),
          orderValue: fv(f, 'orderValue'),
          commissionAmount: fv(f, 'commissionAmount'),
          status: fv(f, 'status'),
          source: fv(f, 'source'),
          externalOrderId: fv(f, 'externalOrderId'),
          subId: fv(f, 'subId'),
          trackingId: fv(f, 'trackingId'),
          affiliateProvider: fv(f, 'affiliateProvider'),
          affiliateConversionId: fv(f, 'affiliateConversionId'),
          commissionStatus: fv(f, 'commissionStatus'),
          customerVisible: fv(f, 'customerVisible'),
          payoutNotificationSentAt: fv(f, 'payoutNotificationSentAt'),
          orderNotificationSentAt: fv(f, 'orderNotificationSentAt'),
          telegramChatId: fv(f, 'telegramChatId'),
          telegramMessageId: fv(f, 'telegramMessageId'),
        },
      });
    }
    // TEMPORARY read-only diagnostic (added 2026-09-12, per explicit
    // request) — independently confirms what cashbackLedger entries exist
    // for a given orderId (created by lib/orderEntry.ts or workers/
    // telegram-bot's handleOrderDecision, never by this Worker directly),
    // to verify the FROZEN->eligible->RELEASED flow end to end without
    // trusting only log lines. Read-only: no write, not part of
    // processOneOrder/pollOrders.
    if (url.pathname === '/debug/ledger-for-order') {
      if (!isDebugAuthorized(url)) return new Response('forbidden', { status: 403 });
      const orderId = url.searchParams.get('orderId');
      if (!orderId) return Response.json({ error: 'missing orderId' }, { status: 400 });
      const idToken = await firestoreSignIn(env);
      const rows = await firestoreRunQuery(env, idToken, {
        from: [{ collectionId: 'cashbackLedger' }],
        where: { fieldFilter: { field: { fieldPath: 'orderId' }, op: 'EQUAL', value: { stringValue: orderId } } },
      });
      const entries = rows.map((row) => {
        const f = row.document.fields;
        return {
          ledgerId: row.document.name.split('/').pop(),
          userId: fv(f, 'userId'),
          type: fv(f, 'type'),
          amount: fv(f, 'amount'),
          status: fv(f, 'status'),
          telegramChatId: fv(f, 'telegramChatId'),
          telegramMessageId: fv(f, 'telegramMessageId'),
        };
      });
      return Response.json({ orderId, count: entries.length, entries });
    }
    return new Response('OK', { status: 200 });
  },
  async scheduled(event, env, ctx) {
    // Diagnostic only — confirms Cloudflare actually invoked scheduled()
    // independent of whatever pollOrders() does next (its own first log
    // line is gated behind an awaited Firebase sign-in call, so this is
    // the only way to see a tick land before any network I/O happens).
    console.log(`[CRON] scheduled fired ${new Date().toISOString()} (cron="${event.cron}")`);
    // Two independent schedules on this one Worker (see wrangler.toml's
    // crons array) — told apart by event.cron so each only ever runs its
    // own job, never both on the same tick.
    if (event.cron === '0 * * * *') {
      ctx.waitUntil(rebuildDatafeedIndex(env).catch((err) => console.error('rebuildDatafeedIndex failed:', err.message)));
      return;
    }
    ctx.waitUntil(pollOrders(env).catch((err) => console.error('pollOrders failed:', err.message)));
  },
};
