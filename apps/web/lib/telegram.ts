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
  return callTelegramApi('sendMessage', { chat_id: CHAT_ID, text: lines.join('\n') }).then(() => undefined);
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
