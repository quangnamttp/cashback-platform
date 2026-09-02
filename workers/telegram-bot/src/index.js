// Receiving half of the withdrawal-notification Telegram bot. The web app
// (apps/web/lib/telegram.ts) only ever SENDS messages — a static site with
// no server can't receive anything back from Telegram (button presses,
// etc.), since that needs an always-on endpoint Telegram can call. This
// Worker is that endpoint: register it once with Telegram's setWebhook and
// every button press on a withdrawal message arrives here as a
// callback_query update.
//
// Firestore write access: rather than an Admin SDK service-account key
// (which bypasses Security Rules entirely — too much blast radius for a
// bot that only ever needs to flip one field on one collection), this
// signs in as a dedicated, narrowly-scoped Firebase Auth account and calls
// the Firestore REST API with its ID token, so the SAME firestore.rules
// that gate every other write in this app also gate this bot — see the
// isPaymentBot() rule in firestore.rules, which allows that one account to
// do exactly one thing: flip a withdrawalRequests doc from PENDING_ADMIN/
// APPROVED to PAID or REJECTED, touching only status/decidedAt/decidedBy/
// rejectionReason. Nothing else in the database is reachable with this
// credential.

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

function firestoreDocUrl(env, requestId) {
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/withdrawalRequests/${requestId}`;
}

async function getWithdrawalDoc(env, idToken, requestId) {
  const res = await fetch(firestoreDocUrl(env, requestId), {
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
    bank: f.bank?.stringValue ?? f.method?.stringValue ?? '',
    accountNumber: f.accountNumber?.stringValue ?? '',
    accountHolder: f.accountHolder?.stringValue ?? '',
    amount: Number(f.amount?.integerValue ?? f.amount?.doubleValue ?? 0),
    requesterName: f.requesterName?.stringValue ?? f.requesterLabel?.stringValue ?? 'Khách hàng',
    requesterEmail: f.requesterEmail?.stringValue ?? '—',
  };
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

  const res = await fetch(`${firestoreDocUrl(env, requestId)}?${mask}`, {
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

function formatVnd(amount) {
  return `${amount.toLocaleString('vi-VN')} ₫`;
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
