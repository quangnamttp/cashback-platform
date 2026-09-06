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
//   - The exact `since`/`until` format /v1/order-list expects (docs say
//     they're required, never say the format) — this Worker sends Unix
//     seconds as the most common convention for this shape of param; if
//     ACCESSTRADE's real response is an error about the date format,
//     `wrangler tail` will show it and this needs correcting.
//   - Which order-list/order-products field is "the" product name — none
//     of the fields ACCESSTRADE's docs list for either endpoint is an
//     obviously-named product title, so productName below is a generic
//     placeholder including at_product_link for admin reference, not a
//     real scraped title.
// ============================================================

const ACCESSTRADE_BASE = 'https://api.accesstrade.vn';

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

async function handleCreateLink(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ supported: false, reason: 'bad_request' }, { status: 400 });
  }
  const { idToken, platform, productUrl, subId } = body || {};
  if (!idToken || !platform || !productUrl || !subId) {
    return Response.json({ supported: false, reason: 'bad_request' }, { status: 400 });
  }

  const uid = await verifyFirebaseIdToken(env, idToken);
  if (!uid) return Response.json({ supported: false, reason: 'unauthenticated' }, { status: 401 });

  if (platform === 'TIKTOK_SHOP') {
    if (!env.ACCESSTRADE_MERCHANT_TIKTOKSHOP) {
      return Response.json({ supported: false, reason: 'not_configured' });
    }
    const { ok, json } = await accesstradeApi(env, 'POST', '/v2/tiktokshop_product_feeds/create_link', {
      body: { product_url: productUrl, sub1: subId },
    });
    // Documented failure shape: {status:false, message:"The link is not
    // part of the campaign"} — treated as "not eligible", never faked.
    if (!ok || json?.status === false || !json?.aff_url) {
      console.log('create_link (tiktok) not eligible:', JSON.stringify(json));
      return Response.json({ supported: false, reason: 'not_in_campaign' });
    }
    return Response.json({ supported: true, affLink: json.aff_short_url || json.aff_url });
  }

  if (platform === 'SHOPEE' || platform === 'LAZADA') {
    const { campaignId } = PLATFORM_CONFIG[platform](env);
    if (!campaignId) {
      return Response.json({ supported: false, reason: 'not_configured' });
    }
    const { ok, json } = await accesstradeApi(env, 'POST', '/v1/product_link/create', {
      body: { campaign_id: campaignId, urls: [productUrl], sub1: subId },
    });
    const successLink = json?.data?.success_link?.[0];
    if (!ok || !successLink?.aff_link) {
      console.log(`create_link (${platform}) not eligible:`, JSON.stringify(json));
      return Response.json({ supported: false, reason: 'not_in_campaign' });
    }
    return Response.json({ supported: true, affLink: successLink.short_link || successLink.aff_link });
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
  ].filter(([, merchant]) => !!merchant);
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
    if (!ok) {
      console.error(`order ${externalOrderId}: order-products fetch failed, skipping this cycle`);
      return;
    }
    const params = json?.data?._extra?.parameters || json?._extra?.parameters || {};
    const subId = params.sub_id1;
    console.log(`order ${externalOrderId}: raw _extra.parameters =`, JSON.stringify(params));

    const userId = await resolveUserIdFromSubId(env, idToken, subId);
    if (!userId) {
      console.error(`order ${externalOrderId}: COULD NOT RESOLVE USER — sub_id1="${subId ?? '(missing)'}" did not match any redirectCache doc. Not creating an order. Full params logged above for manual review.`);
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

async function pollOrders(env) {
  const idToken = await firestoreSignIn(env);
  const nowSec = Math.floor(Date.now() / 1000);
  // 3-hour rolling window, re-scanned every run — idempotency (the
  // deterministic accesstrade_<order_id> doc id) makes re-scanning
  // overlap safe, and this covers a missed cron tick without needing a
  // separate "last polled at" cursor doc.
  const sinceSec = nowSec - 3 * 60 * 60;

  for (const [platform, merchant] of configuredMerchants(env)) {
    const { ok, json } = await accesstradeApi(env, 'GET', '/v1/order-list', {
      query: { since: String(sinceSec), until: String(nowSec), merchant, limit: '300' },
    });
    if (!ok) {
      console.error(`order-list fetch failed for ${platform}/${merchant}`);
      continue;
    }
    const orders = json?.data?.orders || json?.data || [];
    if (!Array.isArray(orders)) {
      console.error(`order-list response for ${platform} wasn't the expected array shape:`, JSON.stringify(json).slice(0, 500));
      continue;
    }
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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/create-link') {
      return handleCreateLink(request, env);
    }
    return new Response('OK', { status: 200 });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pollOrders(env).catch((err) => console.error('pollOrders failed:', err.message)));
  },
};
