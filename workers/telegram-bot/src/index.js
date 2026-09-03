// Receiving half of three Telegram notification flows: withdrawal
// requests, order approval, and cashback-release approval. The web app
// (apps/web/lib/telegram.ts) only ever SENDS messages — a static site with
// no server can't receive anything back from Telegram (button presses,
// etc.), since that needs an always-on endpoint Telegram can call. This
// Worker is that endpoint: register it once with Telegram's setWebhook and
// every button press on any of the three kinds of message arrives here as
// a callback_query update, distinguished by callback_data prefix
// (pay:/paid_noop:/rejected_noop: for withdrawals, order_approve:/
// order_reject:/order_confirmed_noop:/order_cancelled_noop: for order
// approval, cb_approve:/cb_reject:/cb_approved_noop:/cb_rejected_noop: for
// cashback release).
//
// Firestore write access: rather than an Admin SDK service-account key
// (which bypasses Security Rules entirely — too much blast radius for a
// bot that only ever needs to touch three collections in narrowly bounded
// ways), this signs in as a dedicated, narrowly-scoped Firebase Auth
// account and calls the Firestore REST API with its ID token, so the SAME
// firestore.rules that gate every other write in this app also gate this
// bot — see the isPaymentBot() rule in firestore.rules, which allows that
// one account to do exactly three things: flip a withdrawalRequests doc
// from PENDING_ADMIN/APPROVED to PAID or REJECTED; flip an orders doc from
// PENDING to CONFIRMED/CANCELLED (and, only when confirming, create the
// FROZEN cashbackLedger entries that transition implies — the same
// commission-split math apps/web/lib/orderEntry.ts's addCommissionLedgerEntries
// does, mirrored below since this Worker has no access to that module);
// and flip a FROZEN cashbackLedger entry to RELEASED/REJECTED. Nothing
// else in the database is reachable with this credential.

async function telegramApi(env, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error(`telegram ${method} failed:`, JSON.stringify(json));
  }
  return json;
}

async function answerCallback(env, callbackQueryId, text, showAlert) {
  await telegramApi(env, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: !!showAlert,
  }).catch((err) => console.error('answerCallbackQuery threw:', err.message));
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const DIVIDER = '━━━━━━━━━━━━━━━━━━━';

const STATUS_HEADER = {
  paid: `✅ <b>YÊU CẦU RÚT TIỀN</b>`,
  rejected: `❌ <b>YÊU CẦU RÚT TIỀN</b>`,
};
const STATUS_LINE = {
  paid: `✅ <b>Trạng thái:</b> Đã thanh toán`,
  rejected: `❌ <b>Trạng thái:</b> Đã từ chối`,
};
const LOCK_LABEL = {
  paid: '🔒 Đã thanh toán (Không thể bấm)',
  rejected: '🔒 Đã từ chối (Không thể bấm)',
};
const LOCK_CALLBACK_PREFIX = {
  paid: 'paid_noop:',
  rejected: 'rejected_noop:',
};

// Mirrors withdrawalMessageText()/withdrawalKeyboard() in
// apps/web/lib/telegram.ts — kept as a separate copy since this Worker
// doesn't share a build with the Next.js app; if you change the format
// there, update it here too. <code> is Telegram's real tap-to-copy
// mechanism (a copy_text button was tried instead, to dodge <code>'s
// theme-accent color, but turned out to be a no-op on this user's client).
function renderSettledMessage(fields, status) {
  return [
    STATUS_HEADER[status],
    DIVIDER,
    `👤 <b>Người rút:</b> <code>${escapeHtml(fields.requesterName)}</code>`,
    `📧 <b>Email:</b> <code>${escapeHtml(fields.requesterEmail)}</code>`,
    `🏦 <b>Ngân hàng:</b> <code>${escapeHtml(fields.bank)}</code>`,
    `🔢 <b>Số tài khoản:</b> <code>${escapeHtml(fields.accountNumber)}</code>`,
    `📝 <b>Chủ tài khoản:</b> <code>${escapeHtml(fields.accountHolder)}</code>`,
    `💵 <b>Số tiền:</b> <code>${escapeHtml(fields.amountLabel)}</code>`,
    `🆔 <b>Mã lệnh:</b> <code>${escapeHtml(fields.requestId)}</code>`,
    DIVIDER,
    STATUS_LINE[status],
  ].join('\n');
}

// Telegram has no real "disabled button" — every inline button needs a url
// or callback_data. This callback is a deliberate no-op (see the *_noop
// branches below): tapping it again just shows a toast, it never touches
// Firestore — safe to leave visible as a locked-looking label instead of
// removing the keyboard entirely.
function settledKeyboard(fields, status) {
  return [[{ text: LOCK_LABEL[status], callback_data: `${LOCK_CALLBACK_PREFIX[status]}${fields.requestId}` }]];
}

// --- Cashback approval (order confirmed -> release to customer's wallet) ---
// Mirrors cashbackMessageText()/cashbackKeyboard() in apps/web/lib/telegram.ts
// — same "separate copy, no shared build" reason as the withdrawal render
// functions above. Distinct callback_data prefixes (cb_*) keep this
// entirely separate from the withdrawal flow's pay:/paid_noop:/etc, even
// though both live in the same Worker/webhook.

const CASHBACK_STATUS_HEADER = {
  approved: `✅ <b>HOÀN TIỀN</b>`,
  rejected: `❌ <b>HOÀN TIỀN</b>`,
};
const CASHBACK_STATUS_LINE = {
  approved: `✅ <b>Trạng thái:</b> Đã duyệt`,
  rejected: `❌ <b>Trạng thái:</b> Đã từ chối`,
};
const CASHBACK_LOCK_LABEL = {
  approved: '🔒 Đã duyệt (Không thể bấm)',
  rejected: '🔒 Đã từ chối (Không thể bấm)',
};
const CASHBACK_LOCK_CALLBACK_PREFIX = {
  approved: 'cb_approved_noop:',
  rejected: 'cb_rejected_noop:',
};

function renderCashbackSettledMessage(fields, status) {
  return [
    CASHBACK_STATUS_HEADER[status],
    DIVIDER,
    `👤 <b>Khách hàng:</b> <code>${escapeHtml(fields.requesterName)}</code>`,
    `📧 <b>Email:</b> <code>${escapeHtml(fields.requesterEmail)}</code>`,
    `🆔 <b>Mã đơn hàng:</b> <code>${escapeHtml(fields.orderId)}</code>`,
    `💵 <b>Số tiền:</b> <code>${escapeHtml(fields.amountLabel)}</code>`,
    DIVIDER,
    CASHBACK_STATUS_LINE[status],
  ].join('\n');
}

function cashbackSettledKeyboard(fields, status) {
  return [[{ text: CASHBACK_LOCK_LABEL[status], callback_data: `${CASHBACK_LOCK_CALLBACK_PREFIX[status]}${fields.ledgerId}` }]];
}

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
  if (!res.ok) {
    console.error('firebase sign-in failed:', res.status, JSON.stringify(json));
    throw new Error(`firebase sign-in failed: ${json.error?.message || res.status}`);
  }
  console.log('firebase sign-in OK, uid:', json.localId);
  return json.idToken;
}

function firestoreDocUrl(env, collectionName, docId) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collectionName}/${docId}`;
}

async function getWithdrawalDoc(env, idToken, requestId) {
  const res = await fetch(firestoreDocUrl(env, 'withdrawalRequests', requestId), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) {
    console.error('firestore get failed:', res.status, JSON.stringify(json));
    throw new Error(`firestore get failed: ${json.error?.message || res.status}`);
  }
  const f = json.fields || {};
  return {
    status: f.status?.stringValue ?? null,
    userId: f.userId?.stringValue ?? '',
    bank: f.bank?.stringValue ?? f.method?.stringValue ?? '',
    accountNumber: f.accountNumber?.stringValue ?? '',
    accountHolder: f.accountHolder?.stringValue ?? '',
    amount: Number(f.amount?.integerValue ?? f.amount?.doubleValue ?? 0),
    requesterName: f.requesterName?.stringValue ?? f.requesterLabel?.stringValue ?? 'Khách hàng',
    requesterEmail: f.requesterEmail?.stringValue ?? '—',
  };
}

// Mirrors lib/walletBalance.ts's creditWalletBalance — the Worker has no
// Firebase SDK, so this is a plain read-modify-write over the REST API
// instead of the client SDK's increment() FieldValue, guarded by
// currentDocument.updateTime (or currentDocument.exists=false on first
// write for this uid) so a concurrent credit from the web side can't be
// silently clobbered. Retries once on a lost race — low-contention path
// (one uid's wallet is rarely credited twice within the same instant), so
// a single retry is enough rather than needing a full backoff loop.
async function creditWalletBalance(env, idToken, uid, amount) {
  if (!uid || uid === ADMIN_WALLET_ID || !(amount > 0)) return;
  const url = firestoreDocUrl(env, 'walletBalances', uid);
  for (let attempt = 0; attempt < 2; attempt++) {
    const getRes = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
    if (getRes.status === 404) {
      const res = await fetch(`${url}?currentDocument.exists=false`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { available: { integerValue: String(Math.round(amount)) } } }),
      });
      if (res.ok) return;
      continue; // someone else created it in the meantime — retry as an update
    }
    const json = await getRes.json().catch(() => ({}));
    if (!getRes.ok) {
      console.error('creditWalletBalance get failed:', getRes.status, JSON.stringify(json));
      return;
    }
    const current = Number(json.fields?.available?.integerValue ?? json.fields?.available?.doubleValue ?? 0);
    const nextValue = Math.round(current + amount);
    const res = await fetch(
      `${url}?updateMask.fieldPaths=available&currentDocument.updateTime=${encodeURIComponent(json.updateTime)}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { available: { integerValue: String(nextValue) } } }),
      },
    );
    if (res.ok) return;
  }
  console.error('creditWalletBalance: gave up after retries for', uid);
}

async function markDocSettled(env, idToken, requestId, status) {
  const fields = ['status', 'decidedAt', 'decidedBy'];
  if (status === 'REJECTED') fields.push('rejectionReason');
  const mask = fields.map((p) => `updateMask.fieldPaths=${p}`).join('&');
  const body = {
    fields: {
      status: { stringValue: status },
      decidedAt: { timestampValue: new Date().toISOString() },
      decidedBy: { stringValue: 'telegram-bot' },
    },
  };
  if (status === 'REJECTED') body.fields.rejectionReason = { stringValue: 'Từ chối qua Telegram' };

  const res = await fetch(`${firestoreDocUrl(env, 'withdrawalRequests', requestId)}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('firestore patch failed:', res.status, JSON.stringify(json));
    throw new Error(`firestore patch failed: ${json.error?.message || res.status}`);
  }
  console.log('firestore patch OK for', requestId, '->', status);
}

async function getLedgerDoc(env, idToken, ledgerId) {
  const res = await fetch(firestoreDocUrl(env, 'cashbackLedger', ledgerId), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) {
    console.error('firestore get (ledger) failed:', res.status, JSON.stringify(json));
    throw new Error(`firestore get (ledger) failed: ${json.error?.message || res.status}`);
  }
  const f = json.fields || {};
  return {
    status: f.status?.stringValue ?? null,
    userId: f.userId?.stringValue ?? '',
    orderId: f.orderId?.stringValue ?? '—',
    amount: Number(f.amount?.integerValue ?? f.amount?.doubleValue ?? 0),
    requesterName: f.requesterName?.stringValue ?? 'Khách hàng',
    requesterEmail: f.requesterEmail?.stringValue ?? '—',
  };
}

async function markLedgerSettled(env, idToken, ledgerId, status) {
  const mask = ['status', 'releasedAt', 'releasedBy'].map((p) => `updateMask.fieldPaths=${p}`).join('&');
  const body = {
    fields: {
      status: { stringValue: status },
      releasedAt: { timestampValue: new Date().toISOString() },
      releasedBy: { stringValue: 'telegram-bot' },
    },
  };

  const res = await fetch(`${firestoreDocUrl(env, 'cashbackLedger', ledgerId)}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('firestore patch (ledger) failed:', res.status, JSON.stringify(json));
    throw new Error(`firestore patch (ledger) failed: ${json.error?.message || res.status}`);
  }
  console.log('firestore patch (ledger) OK for', ledgerId, '->', status);
}

function formatVnd(amount) {
  return `${amount.toLocaleString('vi-VN')} ₫`;
}

// --- Order approval (PENDING -> CONFIRMED) helpers ---
// Mirrors resolveReferrer()/computeCommissionSplit()/addCommissionLedgerEntries()
// in apps/web/lib/orderEntry.ts — kept as a separate copy for the same
// reason as the message-render functions above (this Worker has no access
// to that module, and no Firebase client SDK, only the raw REST API).
// COMMISSION_SPLIT and ADMIN_WALLET_ID values must match that file exactly.

const ADMIN_WALLET_ID = 'ADMIN_WALLET';
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

async function getOrderDoc(env, idToken, orderId) {
  const res = await fetch(firestoreDocUrl(env, 'orders', orderId), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) {
    console.error('firestore get (order) failed:', res.status, JSON.stringify(json));
    throw new Error(`firestore get (order) failed: ${json.error?.message || res.status}`);
  }
  const f = json.fields || {};
  return {
    status: f.status?.stringValue ?? null,
    userId: f.userId?.stringValue ?? '',
    platform: f.platform?.stringValue ?? '',
    productName: f.productName?.stringValue ?? '',
    orderValue: Number(f.orderValue?.integerValue ?? f.orderValue?.doubleValue ?? 0),
    commissionAmount: Number(f.commissionAmount?.integerValue ?? f.commissionAmount?.doubleValue ?? 0),
    // Needed by tryClaimOrderStatus below — an optimistic-concurrency
    // precondition, not displayed anywhere.
    updateTime: json.updateTime,
  };
}

async function getUserDoc(env, idToken, userId) {
  const res = await fetch(firestoreDocUrl(env, 'users', userId), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) {
    console.error('firestore get (user) failed:', res.status, JSON.stringify(json));
    throw new Error(`firestore get (user) failed: ${json.error?.message || res.status}`);
  }
  const f = json.fields || {};
  return {
    fullName: f.fullName?.stringValue ?? null,
    email: f.email?.stringValue ?? null,
    referredBy: f.referredBy?.stringValue ?? null,
  };
}

// Firestore REST's structured-query endpoint — the one thing a plain
// document GET can't do (finding a user BY their referralCode, not by
// uid). Mirrors resolveReferrer()'s where('referralCode','==',code) query.
async function findUserIdByReferralCode(env, idToken, referralCode) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'users' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'referralCode' },
              op: 'EQUAL',
              value: { stringValue: referralCode },
            },
          },
          limit: 1,
        },
      }),
    },
  );
  const json = await res.json();
  if (!res.ok) {
    console.error('firestore runQuery failed:', res.status, JSON.stringify(json));
    throw new Error(`firestore runQuery failed: ${json.error?.message || res.status}`);
  }
  const match = Array.isArray(json) ? json.find((row) => row.document) : null;
  if (!match) return null;
  // document.name is a full path — projects/.../documents/users/{uid}.
  const parts = match.document.name.split('/');
  return parts[parts.length - 1];
}

async function resolveReferrerUid(env, idToken, customerUserId, customerReferredBy) {
  if (!customerReferredBy) return null;
  const referrerUid = await findUserIdByReferralCode(env, idToken, customerReferredBy);
  if (!referrerUid || referrerUid === customerUserId) return null;
  return referrerUid;
}

// POST (no doc id in the URL) lets Firestore mint the id itself — the
// closest REST equivalent of the client SDK's doc(collection(db,...)).
// Returns that generated id.
async function createLedgerDocument(env, idToken, fields) {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/cashbackLedger`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    },
  );
  const json = await res.json();
  if (!res.ok) {
    console.error('firestore create (ledger) failed:', res.status, JSON.stringify(json));
    throw new Error(`firestore create (ledger) failed: ${json.error?.message || res.status}`);
  }
  const parts = json.name.split('/');
  return parts[parts.length - 1];
}

/**
 * The atomic guard against double-approving the same order from two
 * directions at once (a web tab's approveOrdersBatch racing this same
 * Telegram tap, or two taps on two devices) — mirrors what
 * confirmOrderWithLedger's Firestore transaction does on the web side
 * (apps/web/lib/orderEntry.ts), but this Worker has no Firebase SDK/
 * transactions, only the raw REST API, so the equivalent here is an
 * optimistic-concurrency precondition: the PATCH only applies if the order
 * doc's updateTime still matches what was read a moment ago. If someone
 * else (web or another tap) wrote to it in between, this fails with 409
 * and the caller must NOT create ledger entries — the order was already
 * claimed by whoever won. Called BEFORE any ledger-entry creation for
 * exactly that reason (unlike the old unconditional markOrderSettled this
 * replaces, which ran AFTER ledger creation, leaving a window where two
 * concurrent callers could both create a full set of FROZEN entries before
 * either one got around to writing the order's own status).
 */
async function tryClaimOrderStatus(env, idToken, orderId, expectedUpdateTime, status) {
  const mask = ['status', 'confirmedAt'].map((p) => `updateMask.fieldPaths=${p}`).join('&');
  const body = {
    fields: {
      status: { stringValue: status },
      confirmedAt: { timestampValue: new Date().toISOString() },
    },
  };
  const precondition = expectedUpdateTime
    ? `&currentDocument.updateTime=${encodeURIComponent(expectedUpdateTime)}`
    : '&currentDocument.exists=true';
  const res = await fetch(`${firestoreDocUrl(env, 'orders', orderId)}?${mask}${precondition}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 409 || res.status === 400) {
    console.log('tryClaimOrderStatus: lost the race for', orderId, '(order changed since read)');
    return false;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('firestore patch (order) failed:', res.status, JSON.stringify(json));
    throw new Error(`firestore patch (order) failed: ${json.error?.message || res.status}`);
  }
  console.log('firestore patch (order) OK for', orderId, '->', status);
  return true;
}

// --- Order approval message render (mirrors orderApprovalMessageText()/
// orderApprovalKeyboard() in apps/web/lib/telegram.ts) ---

const ORDER_STATUS_HEADER = {
  pending: `🆕 <b>ĐƠN HÀNG MỚI</b>`,
  confirmed: `✅ <b>ĐƠN HÀNG</b>`,
  cancelled: `❌ <b>ĐƠN HÀNG</b>`,
};
const ORDER_STATUS_LINE = {
  pending: `⏳ <b>Trạng thái:</b> Chờ duyệt`,
  confirmed: `✅ <b>Trạng thái:</b> Đã duyệt`,
  cancelled: `❌ <b>Trạng thái:</b> Đã từ chối`,
};

function renderOrderMessage(fields, status) {
  return [
    ORDER_STATUS_HEADER[status],
    DIVIDER,
    `👤 <b>Khách hàng:</b> <code>${escapeHtml(fields.requesterName)}</code>`,
    `📧 <b>Email:</b> <code>${escapeHtml(fields.requesterEmail)}</code>`,
    `🛍️ <b>Sản phẩm:</b> <code>${escapeHtml(fields.productName)}</code>`,
    `🏬 <b>Sàn:</b> <code>${escapeHtml(fields.platformLabel)}</code>`,
    `💰 <b>Giá trị đơn:</b> <code>${escapeHtml(fields.orderValueLabel)}</code>`,
    `💵 <b>Hoa hồng sàn trả:</b> <code>${escapeHtml(fields.commissionAmountLabel)}</code>`,
    `🆔 <b>Mã đơn:</b> <code>${escapeHtml(fields.orderId)}</code>`,
    DIVIDER,
    ORDER_STATUS_LINE[status],
  ].join('\n');
}

function orderKeyboard(fields, status) {
  if (status === 'confirmed') {
    return [[{ text: '🔒 Đã duyệt (Không thể bấm)', callback_data: `order_confirmed_noop:${fields.orderId}` }]];
  }
  if (status === 'cancelled') {
    return [[{ text: '🔒 Đã từ chối (Không thể bấm)', callback_data: `order_cancelled_noop:${fields.orderId}` }]];
  }
  return [[
    { text: '✅ Duyệt đơn hàng', callback_data: `order_approve:${fields.orderId}` },
    { text: '❌ Từ chối đơn hàng', callback_data: `order_reject:${fields.orderId}` },
  ]];
}

// --- Cashback-pending message render (mirrors cashbackMessageText()/
// cashbackKeyboard() status:'pending' in apps/web/lib/telegram.ts) — the
// Worker needs this too now, since confirming an order FROM TELEGRAM has
// to send this same "chờ duyệt hoàn tiền" follow-up message itself,
// instead of only ever receiving it from the web side.

const CASHBACK_PENDING_HEADER = `🎉 <b>ĐƠN HÀNG ĐÃ XÁC NHẬN — CHỜ HOÀN TIỀN</b>`;
const CASHBACK_PENDING_LINE = `⏳ <b>Trạng thái:</b> Chờ duyệt`;

function renderCashbackPendingMessage(fields) {
  return [
    CASHBACK_PENDING_HEADER,
    DIVIDER,
    `👤 <b>Khách hàng:</b> <code>${escapeHtml(fields.requesterName)}</code>`,
    `📧 <b>Email:</b> <code>${escapeHtml(fields.requesterEmail)}</code>`,
    `🆔 <b>Mã đơn hàng:</b> <code>${escapeHtml(fields.orderId)}</code>`,
    `💵 <b>Số tiền:</b> <code>${escapeHtml(fields.amountLabel)}</code>`,
    DIVIDER,
    CASHBACK_PENDING_LINE,
  ].join('\n');
}

function cashbackPendingKeyboard(fields) {
  return [[
    { text: '✅ Duyệt hoàn tiền', callback_data: `cb_approve:${fields.ledgerId}` },
    { text: '❌ Từ chối hoàn tiền', callback_data: `cb_reject:${fields.ledgerId}` },
  ]];
}

// targetStatus: 'PAID' | 'REJECTED'
async function handleDecision(env, callbackQuery, requestId, targetStatus) {
  const statusKey = targetStatus === 'PAID' ? 'paid' : 'rejected';
  console.log('handleDecision start, requestId:', requestId, 'target:', targetStatus);
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  let idToken;
  try {
    idToken = await firestoreSignIn(env);
  } catch (err) {
    console.error('sign-in step failed:', err.message);
    await answerCallback(env, callbackQuery.id, '⚠️ Lỗi xác thực hệ thống, thử lại sau.', true);
    return;
  }

  let doc;
  try {
    doc = await getWithdrawalDoc(env, idToken, requestId);
  } catch (err) {
    console.error('get doc step failed:', err.message);
    await answerCallback(env, callbackQuery.id, '⚠️ Không đọc được lệnh rút, thử lại sau.', true);
    return;
  }

  console.log('doc fetched:', JSON.stringify(doc));

  if (!doc) {
    await answerCallback(env, callbackQuery.id, '⚠️ Không tìm thấy lệnh rút này.', true);
    return;
  }

  const otherFinalStatus = targetStatus === 'PAID' ? 'REJECTED' : 'PAID';
  if (doc.status === otherFinalStatus) {
    await answerCallback(
      env,
      callbackQuery.id,
      targetStatus === 'PAID'
        ? '⚠️ Lệnh này đã bị từ chối, không thể đánh dấu đã thanh toán.'
        : '⚠️ Lệnh này đã được thanh toán, không thể từ chối.',
      true,
    );
    return;
  }

  // Already in the target state (most likely: admin decided from the web
  // dashboard first) — no write needed, just bring this message's own
  // state in sync so a stray second tap here is a no-op instead of an
  // error.
  if (doc.status !== targetStatus) {
    try {
      await markDocSettled(env, idToken, requestId, targetStatus);
    } catch (err) {
      console.error('patch step failed:', err.message);
      await answerCallback(env, callbackQuery.id, '⚠️ Không cập nhật được trạng thái, thử lại sau.', true);
      return;
    }
    // Mirrors app/manager/withdrawals/page.tsx's decide(REJECT) branch — a
    // rejected request must give back the amount it reserved out of
    // walletBalances/{uid}.available at creation time (see
    // lib/walletBalance.ts), or the requester's real withdrawable ceiling
    // stays wrongly lower forever. PAID needs no change (the reservation
    // was already permanent the moment money actually moved).
    if (targetStatus === 'REJECTED') {
      await creditWalletBalance(env, idToken, doc.userId, doc.amount).catch((err) =>
        console.error('creditWalletBalance (withdrawal reject) threw:', err.message),
      );
    }
  }

  const settledFields = {
    requesterName: doc.requesterName,
    requesterEmail: doc.requesterEmail,
    bank: doc.bank,
    accountNumber: doc.accountNumber,
    accountHolder: doc.accountHolder,
    amount: doc.amount,
    amountLabel: formatVnd(doc.amount),
    requestId,
  };
  const editResult = await telegramApi(env, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    text: renderSettledMessage(settledFields, statusKey),
    reply_markup: { inline_keyboard: settledKeyboard(settledFields, statusKey) },
  }).catch((err) => {
    console.error('editMessageText threw:', err.message);
    return null;
  });
  console.log('editMessageText result ok:', editResult?.ok);

  await answerCallback(
    env,
    callbackQuery.id,
    targetStatus === 'PAID' ? '✅ Đã xác nhận thanh toán!' : '❌ Đã từ chối lệnh rút.',
    false,
  );
  console.log('handleDecision done, requestId:', requestId);
}

// targetStatus: 'RELEASED' | 'REJECTED' — mirrors handleDecision above,
// operating on cashbackLedger instead of withdrawalRequests.
async function handleCashbackDecision(env, callbackQuery, ledgerId, targetStatus) {
  const statusKey = targetStatus === 'RELEASED' ? 'approved' : 'rejected';
  console.log('handleCashbackDecision start, ledgerId:', ledgerId, 'target:', targetStatus);
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  let idToken;
  try {
    idToken = await firestoreSignIn(env);
  } catch (err) {
    console.error('sign-in step failed:', err.message);
    await answerCallback(env, callbackQuery.id, '⚠️ Lỗi xác thực hệ thống, thử lại sau.', true);
    return;
  }

  let ledgerDoc;
  try {
    ledgerDoc = await getLedgerDoc(env, idToken, ledgerId);
  } catch (err) {
    console.error('get ledger doc step failed:', err.message);
    await answerCallback(env, callbackQuery.id, '⚠️ Không đọc được khoản hoàn tiền, thử lại sau.', true);
    return;
  }

  console.log('ledger doc fetched:', JSON.stringify(ledgerDoc));

  if (!ledgerDoc) {
    await answerCallback(env, callbackQuery.id, '⚠️ Không tìm thấy khoản hoàn tiền này.', true);
    return;
  }

  const otherFinalStatus = targetStatus === 'RELEASED' ? 'REJECTED' : 'RELEASED';
  if (ledgerDoc.status === otherFinalStatus) {
    await answerCallback(
      env,
      callbackQuery.id,
      targetStatus === 'RELEASED'
        ? '⚠️ Khoản này đã bị từ chối, không thể duyệt.'
        : '⚠️ Khoản này đã được duyệt, không thể từ chối.',
      true,
    );
    return;
  }

  // Already in the target state (most likely: admin decided from the web
  // dashboard first) — no write needed, just bring this message's own
  // state in sync so a stray second tap here is a no-op instead of an
  // error.
  if (ledgerDoc.status !== targetStatus) {
    try {
      await markLedgerSettled(env, idToken, ledgerId, targetStatus);
    } catch (err) {
      console.error('patch step failed:', err.message);
      await answerCallback(env, callbackQuery.id, '⚠️ Không cập nhật được trạng thái, thử lại sau.', true);
      return;
    }
    // Mirrors app/manager/payouts/page.tsx's decideSelected('RELEASED')
    // branch — money only becomes withdrawable (and therefore checkable
    // against the withdrawalRequests/create rule) once it's credited into
    // walletBalances/{uid}.available here. REJECTED needs no credit (the
    // money was never released).
    if (targetStatus === 'RELEASED') {
      await creditWalletBalance(env, idToken, ledgerDoc.userId, ledgerDoc.amount).catch((err) =>
        console.error('creditWalletBalance (cashback release) threw:', err.message),
      );
    }
  }

  const settledFields = {
    requesterName: ledgerDoc.requesterName,
    requesterEmail: ledgerDoc.requesterEmail,
    orderId: ledgerDoc.orderId,
    amount: ledgerDoc.amount,
    amountLabel: formatVnd(ledgerDoc.amount),
    ledgerId,
  };
  const editResult = await telegramApi(env, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    text: renderCashbackSettledMessage(settledFields, statusKey),
    reply_markup: { inline_keyboard: cashbackSettledKeyboard(settledFields, statusKey) },
  }).catch((err) => {
    console.error('editMessageText threw:', err.message);
    return null;
  });
  console.log('editMessageText result ok:', editResult?.ok);

  await answerCallback(
    env,
    callbackQuery.id,
    targetStatus === 'RELEASED' ? '✅ Đã duyệt hoàn tiền!' : '❌ Đã từ chối hoàn tiền.',
    false,
  );
  console.log('handleCashbackDecision done, ledgerId:', ledgerId);
}

const PLATFORM_LABEL = { SHOPEE: 'Shopee', TIKTOK_SHOP: 'TikTok Shop', LAZADA: 'Lazada' };

// targetStatus: 'CONFIRMED' | 'CANCELLED' — mirrors handleDecision/
// handleCashbackDecision above, but CONFIRMED does substantially more:
// the same referrer-lookup + commission-split + FROZEN-ledger-entries work
// upsertOrder()/addCommissionLedgerEntries() do on the web side (see the
// mirrored helpers above), since tapping "✅ Duyệt đơn hàng" here has to
// reach the exact same end state as approving from /manager/orders would.
async function handleOrderDecision(env, callbackQuery, orderId, targetStatus) {
  const statusKey = targetStatus === 'CONFIRMED' ? 'confirmed' : 'cancelled';
  console.log('handleOrderDecision start, orderId:', orderId, 'target:', targetStatus);
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;

  let idToken;
  try {
    idToken = await firestoreSignIn(env);
  } catch (err) {
    console.error('sign-in step failed:', err.message);
    await answerCallback(env, callbackQuery.id, '⚠️ Lỗi xác thực hệ thống, thử lại sau.', true);
    return;
  }

  let order;
  try {
    order = await getOrderDoc(env, idToken, orderId);
  } catch (err) {
    console.error('get order step failed:', err.message);
    await answerCallback(env, callbackQuery.id, '⚠️ Không đọc được đơn hàng, thử lại sau.', true);
    return;
  }

  console.log('order fetched:', JSON.stringify(order));

  if (!order) {
    await answerCallback(env, callbackQuery.id, '⚠️ Không tìm thấy đơn hàng này.', true);
    return;
  }

  const otherFinalStatus = targetStatus === 'CONFIRMED' ? 'CANCELLED' : 'CONFIRMED';
  if (order.status === otherFinalStatus) {
    await answerCallback(
      env,
      callbackQuery.id,
      targetStatus === 'CONFIRMED'
        ? '⚠️ Đơn này đã bị từ chối, không thể duyệt.'
        : '⚠️ Đơn này đã được duyệt, không thể từ chối.',
      true,
    );
    return;
  }

  // Already in the target state (most likely: admin decided from the web
  // dashboard first) — no write needed, just bring this message's own
  // state in sync so a stray second tap here is a no-op instead of an
  // error. Ledger entries (if any) were already created by whichever side
  // got there first, so nothing further to do on that front either.
  let customerUser = null;
  if (order.status !== targetStatus) {
    // Claim the order FIRST (atomic, guarded by order.updateTime — see
    // tryClaimOrderStatus) — only the caller that wins this race is allowed
    // to go on and create ledger entries below. Losing the race here means
    // a web approve or another tap already settled this exact order in the
    // moment between our read above and this write.
    let claimed;
    try {
      claimed = await tryClaimOrderStatus(env, idToken, orderId, order.updateTime, targetStatus);
    } catch (err) {
      console.error('order claim step failed:', err.message);
      await answerCallback(env, callbackQuery.id, '⚠️ Không cập nhật được đơn hàng, thử lại sau.', true);
      return;
    }

    if (!claimed) {
      const fresh = await getOrderDoc(env, idToken, orderId).catch(() => null);
      if (fresh) order = fresh;
      customerUser = await getUserDoc(env, idToken, order.userId).catch(() => null);
    } else {
    try {
      customerUser = await getUserDoc(env, idToken, order.userId);
      if (targetStatus === 'CONFIRMED' && order.commissionAmount > 0) {
        const referrerUid = await resolveReferrerUid(env, idToken, order.userId, customerUser?.referredBy);
        const split = computeCommissionSplit(order.commissionAmount, !!referrerUid);
        const requesterName = customerUser?.fullName || customerUser?.email || order.userId;
        const requesterEmail = customerUser?.email || '—';

        if (split.customerAmount > 0) {
          const ledgerId = await createLedgerDocument(env, idToken, {
            userId: { stringValue: order.userId },
            orderId: { stringValue: orderId },
            amount: { integerValue: String(split.customerAmount) },
            type: { stringValue: 'CUSTOMER_CASHBACK' },
            status: { stringValue: 'FROZEN' },
            confirmedAt: { timestampValue: new Date().toISOString() },
            requesterName: { stringValue: requesterName },
            requesterEmail: { stringValue: requesterEmail },
          });
          const cashbackFields = {
            requesterName,
            requesterEmail,
            orderId,
            amountLabel: formatVnd(split.customerAmount),
            ledgerId,
          };
          const cashbackSend = await telegramApi(env, 'sendMessage', {
            chat_id: chatId,
            message_thread_id: 13,
            parse_mode: 'HTML',
            text: renderCashbackPendingMessage(cashbackFields),
            reply_markup: { inline_keyboard: cashbackPendingKeyboard(cashbackFields) },
          }).catch((err) => {
            console.error('cashback follow-up sendMessage threw:', err.message);
            return null;
          });
          if (cashbackSend?.ok) {
            await fetch(
              `${firestoreDocUrl(env, 'cashbackLedger', ledgerId)}?updateMask.fieldPaths=telegramChatId&updateMask.fieldPaths=telegramMessageId`,
              {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fields: {
                    telegramChatId: { stringValue: String(cashbackSend.result.chat.id) },
                    telegramMessageId: { integerValue: String(cashbackSend.result.message_id) },
                  },
                }),
              },
            ).catch((err) => console.error('ledger telegram-ref patch threw:', err.message));
          }
        }

        if (split.platformAmount > 0) {
          await createLedgerDocument(env, idToken, {
            userId: { stringValue: ADMIN_WALLET_ID },
            orderId: { stringValue: orderId },
            amount: { integerValue: String(split.platformAmount) },
            type: { stringValue: 'PLATFORM_REVENUE' },
            status: { stringValue: 'FROZEN' },
            confirmedAt: { timestampValue: new Date().toISOString() },
          });
        }

        if (referrerUid && split.referrerAmount > 0) {
          await createLedgerDocument(env, idToken, {
            userId: { stringValue: referrerUid },
            orderId: { stringValue: orderId },
            amount: { integerValue: String(split.referrerAmount) },
            type: { stringValue: 'REFERRAL_BONUS' },
            status: { stringValue: 'FROZEN' },
            confirmedAt: { timestampValue: new Date().toISOString() },
          });
        }
      }
    } catch (err) {
      console.error('order settle step failed:', err.message);
      await answerCallback(env, callbackQuery.id, '⚠️ Không cập nhật được đơn hàng, thử lại sau.', true);
      return;
    }
    }
  } else {
    customerUser = await getUserDoc(env, idToken, order.userId).catch(() => null);
  }

  const settledFields = {
    requesterName: customerUser?.fullName || customerUser?.email || order.userId,
    requesterEmail: customerUser?.email || '—',
    productName: order.productName,
    platformLabel: PLATFORM_LABEL[order.platform] ?? order.platform,
    orderValueLabel: formatVnd(order.orderValue),
    commissionAmountLabel: formatVnd(order.commissionAmount),
    orderId,
  };
  const editResult = await telegramApi(env, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML',
    text: renderOrderMessage(settledFields, statusKey),
    reply_markup: { inline_keyboard: orderKeyboard(settledFields, statusKey) },
  }).catch((err) => {
    console.error('editMessageText threw:', err.message);
    return null;
  });
  console.log('editMessageText result ok:', editResult?.ok);

  await answerCallback(
    env,
    callbackQuery.id,
    targetStatus === 'CONFIRMED' ? '✅ Đã duyệt đơn hàng!' : '❌ Đã từ chối đơn hàng.',
    false,
  );
  console.log('handleOrderDecision done, orderId:', orderId);
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return new Response('OK', { status: 200 });

    // Telegram sends this exact header (set via setWebhook's secret_token
    // param) on every real webhook call — anything without it is not from
    // Telegram and is dropped before touching Firestore or the bot token.
    const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      console.error('rejected: bad or missing webhook secret header');
      return new Response('Forbidden', { status: 403 });
    }

    const update = await request.json().catch((err) => {
      console.error('failed to parse update JSON:', err.message);
      return null;
    });
    console.log('update received:', JSON.stringify(update));
    const callbackQuery = update?.callback_query;
    const data = callbackQuery?.data;

    // No 'reject:' callback — rejecting only ever happens from the web UI
    // (/manager/withdrawals, which asks for a reason). The rejected_noop
    // branch below still exists to render the locked label once a web
    // reject has already synced this message to that state.
    if (callbackQuery && typeof data === 'string' && data.startsWith('pay:')) {
      const requestId = data.slice('pay:'.length);
      await handleDecision(env, callbackQuery, requestId, 'PAID');
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('paid_noop:')) {
      // The locked "🔒 Đã thanh toán" button on an already-settled request —
      // still technically tappable (Telegram has no true disabled state),
      // but this never touches Firestore, just tells the admin it's a no-op.
      await answerCallback(env, callbackQuery.id, 'Lệnh này đã được thanh toán rồi.', false);
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('rejected_noop:')) {
      await answerCallback(env, callbackQuery.id, 'Lệnh này đã bị từ chối rồi.', false);
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('cb_approve:')) {
      const ledgerId = data.slice('cb_approve:'.length);
      await handleCashbackDecision(env, callbackQuery, ledgerId, 'RELEASED');
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('cb_reject:')) {
      const ledgerId = data.slice('cb_reject:'.length);
      await handleCashbackDecision(env, callbackQuery, ledgerId, 'REJECTED');
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('cb_approved_noop:')) {
      await answerCallback(env, callbackQuery.id, 'Khoản này đã được duyệt rồi.', false);
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('cb_rejected_noop:')) {
      await answerCallback(env, callbackQuery.id, 'Khoản này đã bị từ chối rồi.', false);
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('order_approve:')) {
      const orderId = data.slice('order_approve:'.length);
      await handleOrderDecision(env, callbackQuery, orderId, 'CONFIRMED');
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('order_reject:')) {
      const orderId = data.slice('order_reject:'.length);
      await handleOrderDecision(env, callbackQuery, orderId, 'CANCELLED');
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('order_confirmed_noop:')) {
      await answerCallback(env, callbackQuery.id, 'Đơn này đã được duyệt rồi.', false);
    } else if (callbackQuery && typeof data === 'string' && data.startsWith('order_cancelled_noop:')) {
      await answerCallback(env, callbackQuery.id, 'Đơn này đã bị từ chối rồi.', false);
    } else if (callbackQuery) {
      console.log('unrecognized callback_data:', data);
      // An unrecognized button/callback — still must be acknowledged or
      // Telegram shows the user a stuck loading spinner.
      await answerCallback(env, callbackQuery.id, '', false);
    } else {
      console.log('update had no callback_query (probably a webhook health-check or unrelated update type)');
    }

    // Telegram only cares about the 200 — the update itself carries no
    // meaningful response body.
    return new Response('OK', { status: 200 });
  },
};
