// Notification relay: web app -> Telegram. There is no backend on this
// project (Firebase Spark / static export only), so this calls Telegram's
// Bot API directly from the browser. That is the only way to reach
// Telegram without a server, but it also means the bot token ships inside
// the public JS bundle — anyone can read it from devtools. Mitigate by
// using a bot that ONLY posts to one fixed group (no other privileges) and
// rotating the token from @BotFather if it's ever abused. Leave the env
// vars empty to disable this feature entirely.
//
// The withdrawal message below has a "✅ Đã thanh toán" button — tapping it
// in Telegram is handled by workers/telegram-bot (a webhook Telegram calls
// on button presses, since receiving events FROM Telegram needs always-on
// server compute this static site doesn't have on its own). This file only
// ever SENDS to Telegram; see that Worker for the receiving half. When
// admin instead marks a request paid from the web UI, markWithdrawalPaidOnTelegram
// below edits that same Telegram message so the button can't be tapped
// again — the two directions stay in sync without either side polling.

import { buildVietQrImageUrl } from './bankBin';

const BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

export function isTelegramRelayConfigured(): boolean {
  return !!BOT_TOKEN && !!CHAT_ID;
}

// One bot, one group chat with Topics enabled (chat id -1004411327315) —
// every notification kind routes to its own topic via the Bot API's
// message_thread_id instead of one mixed stream, so a withdrawal request
// doesn't get lost between cashback approvals and general support-chat
// activity. Mirrored in workers/telegram-bot/src/index.js — keep both in
// sync if a topic ever changes.
export const TELEGRAM_TOPICS = {
  SUPPORT: 11,
  WITHDRAWAL: 14,
  CASHBACK: 13,
} as const;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function callTelegramApi<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  if (!BOT_TOKEN) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
      console.error(`telegram ${method} failed`, json.description);
      return null;
    }
    return json.result as T;
  } catch (err) {
    // Best-effort only — never block the caller's UX if Telegram is
    // unreachable or misconfigured.
    console.error(`telegram ${method} error`, err);
    return null;
  }
}

export function forwardChatMessageToTelegram(params: {
  userName: string;
  userEmail: string;
  text?: string | null;
  hasImage?: boolean;
}): Promise<void> {
  if (!CHAT_ID) return Promise.resolve();
  const lines = [
    `💬 Tin nhắn hỗ trợ mới`,
    `Từ: ${params.userName || 'Khách'} (${params.userEmail || 'chưa rõ email'})`,
    params.text ? params.text : params.hasImage ? '[Khách gửi kèm hình ảnh]' : '',
  ].filter(Boolean);
  return callTelegramApi('sendMessage', {
    chat_id: CHAT_ID,
    message_thread_id: TELEGRAM_TOPICS.SUPPORT,
    text: lines.join('\n'),
  }).then(() => undefined);
}

type TelegramMessageRef = { chatId: string; messageId: number };

const DIVIDER = '━━━━━━━━━━━━━━━━━━━';

export type WithdrawalMessageFields = {
  requesterName: string;
  requesterEmail: string;
  bank: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
  amountLabel: string;
  requestId: string;
};

export type WithdrawalTelegramStatus = 'pending' | 'paid' | 'rejected';

const STATUS_HEADER: Record<WithdrawalTelegramStatus, string> = {
  pending: `🚨 <b>YÊU CẦU RÚT TIỀN MỚI</b>`,
  paid: `✅ <b>YÊU CẦU RÚT TIỀN</b>`,
  rejected: `❌ <b>YÊU CẦU RÚT TIỀN</b>`,
};
const STATUS_LINE: Record<WithdrawalTelegramStatus, string> = {
  pending: `⏳ <b>Trạng thái:</b> Chờ thanh toán`,
  paid: `✅ <b>Trạng thái:</b> Đã thanh toán`,
  rejected: `❌ <b>Trạng thái:</b> Đã từ chối`,
};

// `<code>` (monospace) is Telegram's real tap-to-copy mechanism — tapping a
// code span copies it client-side immediately, no button/round-trip needed.
// It also renders in an accent color (purple/blue, theme-dependent) instead
// of plain body text; tried dropping it for plain black text, then tried a
// copy_text button per field instead, but that button type turned out to be
// a no-op on this user's Telegram client — so this is back to <code>,
// trading the plain-black look for working copy.
function withdrawalMessageText(fields: WithdrawalMessageFields, status: WithdrawalTelegramStatus): string {
  const lines = [
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
  ];
  return lines.join('\n');
}

type InlineButton = { text: string; url?: string; callback_data?: string };

function withdrawalKeyboard(fields: WithdrawalMessageFields, status: WithdrawalTelegramStatus): InlineButton[][] {
  // Telegram has no real "disabled button" — every inline button must have
  // a url or callback_data. These *_noop callbacks (see
  // workers/telegram-bot) are deliberate no-ops: tapping again just shows
  // a toast, never touches Firestore — safe to leave visible as a
  // locked-looking label instead of vanishing entirely.
  if (status === 'paid') {
    return [[{ text: '🔒 Đã thanh toán (Không thể bấm)', callback_data: `paid_noop:${fields.requestId}` }]];
  }
  if (status === 'rejected') {
    return [[{ text: '🔒 Đã từ chối (Không thể bấm)', callback_data: `rejected_noop:${fields.requestId}` }]];
  }
  // Deliberately no "❌ Từ chối" button here — rejecting only ever happens
  // from the web UI (/manager/withdrawals, which also asks for a reason).
  // This message still reflects that decision once made — see the
  // 'rejected' branch above — it just can't be the thing that TRIGGERS it.
  const qrImageUrl = buildVietQrImageUrl({
    bankLabel: fields.bank,
    accountNumber: fields.accountNumber,
    accountHolder: fields.accountHolder,
    amount: fields.amount,
    note: `Hoan tien ${fields.requestId}`,
  });
  const payButton: InlineButton = { text: '✅ Xác nhận đã thanh toán', callback_data: `pay:${fields.requestId}` };
  // Opens the QR as its own page (not embedded as a photo in the chat) —
  // tried dl.vietqr.io/pay's app-launch link first, but that now hard-
  // requires naming one specific bank app (verified live), which would
  // lock this button to a guessed bank. img.vietqr.io's QR image has no
  // such requirement: whatever page/app opens it, the admin scans or saves
  // it with whichever banking app they actually have.
  if (qrImageUrl) return [[{ text: '🔗 Mã QR chuyển khoản', url: qrImageUrl }, payButton]];
  return [[payButton]];
}

/**
 * Sends the withdrawal notification with a "✅ Xác nhận đã thanh toán"
 * button — rejecting is web-only (needs a reason, entered on
 * /manager/withdrawals), so there's no reject button here. When the bank is
 * VietQR-known, a second button opens the transfer's QR code as its own
 * page (see withdrawalKeyboard). Returns the sent message's chat/message id
 * so the caller can save it onto the withdrawalRequests doc — needed later
 * to edit this same message from the web UI (see
 * syncWithdrawalStatusToTelegram) or, in the other direction, for the "✅"
 * button's callback_data to name which request it acts on. Returns null if
 * Telegram isn't configured or the send failed — callers must treat that
 * as normal and never block withdrawal creation on it.
 */
export async function notifyWithdrawalRequestToTelegram(fields: WithdrawalMessageFields): Promise<TelegramMessageRef | null> {
  if (!CHAT_ID) return null;

  const result = await callTelegramApi<{ message_id: number; chat: { id: number } }>('sendMessage', {
    chat_id: CHAT_ID,
    message_thread_id: TELEGRAM_TOPICS.WITHDRAWAL,
    parse_mode: 'HTML',
    text: withdrawalMessageText(fields, 'pending'),
    reply_markup: { inline_keyboard: withdrawalKeyboard(fields, 'pending') },
  });
  if (!result) return null;
  return { chatId: String(result.chat.id), messageId: result.message_id };
}

/**
 * Called after admin marks a request paid/rejected FROM THE WEB UI — edits
 * the original Telegram message to show that state and swaps the buttons
 * for the matching locked label, so tapping the old buttons in Telegram
 * afterwards can't re-process (re-clicking a stale keyboard) an
 * already-settled request. The mirror case (settled via a Telegram button
 * first) is handled inside workers/telegram-bot itself, not here.
 */
export function syncWithdrawalStatusToTelegram(
  ref: TelegramMessageRef,
  fields: WithdrawalMessageFields,
  status: 'paid' | 'rejected',
): Promise<void> {
  return callTelegramApi('editMessageText', {
    chat_id: ref.chatId,
    message_id: ref.messageId,
    parse_mode: 'HTML',
    text: withdrawalMessageText(fields, status),
    reply_markup: { inline_keyboard: withdrawalKeyboard(fields, status) },
  }).then(() => undefined);
}

// ---------------------------------------------------------------------
// Cashback approval (order confirmed -> release held commission to the
// customer's wallet) — same pattern as the withdrawal flow above, just a
// different topic (TELEGRAM_TOPICS.CASHBACK) and a different Firestore
// target (cashbackLedger, not withdrawalRequests). Tapping "✅ Duyệt hoàn
// tiền" is handled by the SAME workers/telegram-bot Worker, distinguished
// by its own callback_data prefixes (cb_approve/cb_reject) so it can't be
// confused with the withdrawal bot's pay:/reject flow.
// ---------------------------------------------------------------------

export type CashbackMessageFields = {
  requesterName: string;
  requesterEmail: string;
  orderId: string;
  amount: number;
  amountLabel: string;
  ledgerId: string;
};

export type CashbackTelegramStatus = 'pending' | 'approved' | 'rejected';

const CASHBACK_STATUS_HEADER: Record<CashbackTelegramStatus, string> = {
  pending: `🎉 <b>ĐƠN HÀNG ĐÃ XÁC NHẬN — CHỜ HOÀN TIỀN</b>`,
  approved: `✅ <b>HOÀN TIỀN</b>`,
  rejected: `❌ <b>HOÀN TIỀN</b>`,
};
const CASHBACK_STATUS_LINE: Record<CashbackTelegramStatus, string> = {
  pending: `⏳ <b>Trạng thái:</b> Chờ duyệt`,
  approved: `✅ <b>Trạng thái:</b> Đã duyệt`,
  rejected: `❌ <b>Trạng thái:</b> Đã từ chối`,
};

function cashbackMessageText(fields: CashbackMessageFields, status: CashbackTelegramStatus): string {
  const lines = [
    CASHBACK_STATUS_HEADER[status],
    DIVIDER,
    `👤 <b>Khách hàng:</b> <code>${escapeHtml(fields.requesterName)}</code>`,
    `📧 <b>Email:</b> <code>${escapeHtml(fields.requesterEmail)}</code>`,
    `🆔 <b>Mã đơn hàng:</b> <code>${escapeHtml(fields.orderId)}</code>`,
    `💵 <b>Số tiền:</b> <code>${escapeHtml(fields.amountLabel)}</code>`,
    DIVIDER,
    CASHBACK_STATUS_LINE[status],
  ];
  return lines.join('\n');
}

function cashbackKeyboard(fields: CashbackMessageFields, status: CashbackTelegramStatus): InlineButton[][] {
  if (status === 'approved') {
    return [[{ text: '🔒 Đã duyệt (Không thể bấm)', callback_data: `cb_approved_noop:${fields.ledgerId}` }]];
  }
  if (status === 'rejected') {
    return [[{ text: '🔒 Đã từ chối (Không thể bấm)', callback_data: `cb_rejected_noop:${fields.ledgerId}` }]];
  }
  return [[
    { text: '✅ Duyệt hoàn tiền', callback_data: `cb_approve:${fields.ledgerId}` },
    { text: '❌ Từ chối hoàn tiền', callback_data: `cb_reject:${fields.ledgerId}` },
  ]];
}

/**
 * Sent once per order, right when the admin confirms it (orders/{id}
 * PENDING -> CONFIRMED, the moment a FROZEN cashbackLedger entry is
 * created for the customer's share — see lib/orderEntry.ts). Returns the
 * sent message's chat/message id so the caller can save it onto that same
 * cashbackLedger doc — needed later to edit this message from the web UI
 * (see syncCashbackStatusToTelegram) or, in the other direction, for the
 * Telegram buttons' callback_data to name which ledger entry they act on.
 * Returns null if Telegram isn't configured or the send failed — callers
 * must treat that as normal and never block order confirmation on it.
 */
export async function notifyCashbackApprovalToTelegram(fields: CashbackMessageFields): Promise<TelegramMessageRef | null> {
  if (!CHAT_ID) return null;

  const result = await callTelegramApi<{ message_id: number; chat: { id: number } }>('sendMessage', {
    chat_id: CHAT_ID,
    message_thread_id: TELEGRAM_TOPICS.CASHBACK,
    parse_mode: 'HTML',
    text: cashbackMessageText(fields, 'pending'),
    reply_markup: { inline_keyboard: cashbackKeyboard(fields, 'pending') },
  });
  if (!result) return null;
  return { chatId: String(result.chat.id), messageId: result.message_id };
}

/**
 * Called after admin approves/rejects the release FROM THE WEB UI
 * (/manager/payouts) — edits the original Telegram message the same way
 * syncWithdrawalStatusToTelegram does for withdrawals. The mirror case
 * (settled via a Telegram button first) is handled inside
 * workers/telegram-bot itself, not here.
 */
export function syncCashbackStatusToTelegram(
  ref: TelegramMessageRef,
  fields: CashbackMessageFields,
  status: 'approved' | 'rejected',
): Promise<void> {
  return callTelegramApi('editMessageText', {
    chat_id: ref.chatId,
    message_id: ref.messageId,
    parse_mode: 'HTML',
    text: cashbackMessageText(fields, status),
    reply_markup: { inline_keyboard: cashbackKeyboard(fields, status) },
  }).then(() => undefined);
}

// ---------------------------------------------------------------------
// Order approval (PENDING -> CONFIRMED, the step that creates the FROZEN
// ledger entry above) — same TELEGRAM_TOPICS.CASHBACK topic as the
// cashback-release messages, since from the admin's point of view both are
// steps in the same "duyệt hoàn tiền" pipeline: this fires the moment an
// order is entered as PENDING (see lib/orderEntry.ts's upsertOrder), so
// approving never has to start on the web — tapping "✅ Duyệt đơn hàng"
// here does the full PENDING->CONFIRMED transition (referrer lookup,
// commission split, FROZEN ledger entries — see workers/telegram-bot's
// handleOrderDecision) and, on success, that same Worker sends the
// cashback-release message above as a follow-up. Deliberately still two
// separate approvals, not one: confirming an order and releasing money to
// a wallet are different decisions with different stakes, and collapsing
// them would remove the "hold, then decide when to release" step the rest
// of this app is built around (see /manager/payouts).
// ---------------------------------------------------------------------

export type OrderApprovalMessageFields = {
  requesterName: string;
  requesterEmail: string;
  productName: string;
  platformLabel: string;
  orderValue: number;
  orderValueLabel: string;
  commissionAmount: number;
  commissionAmountLabel: string;
  orderId: string;
};

export type OrderApprovalTelegramStatus = 'pending' | 'confirmed' | 'cancelled';

const ORDER_STATUS_HEADER: Record<OrderApprovalTelegramStatus, string> = {
  pending: `🆕 <b>ĐƠN HÀNG MỚI</b>`,
  confirmed: `✅ <b>ĐƠN HÀNG</b>`,
  cancelled: `❌ <b>ĐƠN HÀNG</b>`,
};
const ORDER_STATUS_LINE: Record<OrderApprovalTelegramStatus, string> = {
  pending: `⏳ <b>Trạng thái:</b> Chờ duyệt`,
  confirmed: `✅ <b>Trạng thái:</b> Đã duyệt`,
  cancelled: `❌ <b>Trạng thái:</b> Đã từ chối`,
};

function orderApprovalMessageText(fields: OrderApprovalMessageFields, status: OrderApprovalTelegramStatus): string {
  const lines = [
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
  ];
  return lines.join('\n');
}

function orderApprovalKeyboard(fields: OrderApprovalMessageFields, status: OrderApprovalTelegramStatus): InlineButton[][] {
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

/**
 * Sent once, right when a new order is entered as PENDING (see
 * lib/orderEntry.ts's upsertOrder — never for an order created directly as
 * CONFIRMED/something else, since that skips approval by the admin's own
 * explicit choice at entry time). Returns the sent message's chat/message
 * id so the caller can save it onto that same orders doc — needed later to
 * edit this message from the web UI (see syncOrderStatusToTelegram) or,
 * from the other direction, for the Telegram buttons' callback_data to
 * name which order they act on. Returns null if Telegram isn't configured
 * or the send failed — callers must treat that as normal and never block
 * order creation on it.
 */
export async function notifyOrderApprovalToTelegram(fields: OrderApprovalMessageFields): Promise<TelegramMessageRef | null> {
  if (!CHAT_ID) return null;

  const result = await callTelegramApi<{ message_id: number; chat: { id: number } }>('sendMessage', {
    chat_id: CHAT_ID,
    message_thread_id: TELEGRAM_TOPICS.CASHBACK,
    parse_mode: 'HTML',
    text: orderApprovalMessageText(fields, 'pending'),
    reply_markup: { inline_keyboard: orderApprovalKeyboard(fields, 'pending') },
  });
  if (!result) return null;
  return { chatId: String(result.chat.id), messageId: result.message_id };
}

/**
 * Called after admin approves/rejects the order FROM THE WEB UI
 * (/manager/orders) — edits the original Telegram message the same way
 * the other sync* functions in this file do. The mirror case (settled via
 * a Telegram button first) is handled inside workers/telegram-bot itself.
 */
export function syncOrderStatusToTelegram(
  ref: TelegramMessageRef,
  fields: OrderApprovalMessageFields,
  status: 'confirmed' | 'cancelled',
): Promise<void> {
  return callTelegramApi('editMessageText', {
    chat_id: ref.chatId,
    message_id: ref.messageId,
    parse_mode: 'HTML',
    text: orderApprovalMessageText(fields, status),
    reply_markup: { inline_keyboard: orderApprovalKeyboard(fields, status) },
  }).then(() => undefined);
}
