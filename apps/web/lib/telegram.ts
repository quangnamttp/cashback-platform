// One-way notification relay: web chat message -> Telegram. There is no
// backend on this project (Firebase Spark / static export only), so this
// calls Telegram's Bot API directly from the customer's browser. That is
// the only way to reach Telegram without a server, but it also means the
// bot token ships inside the public JS bundle — anyone can read it from
// devtools. Mitigate by using a bot that ONLY posts to one fixed group
// (no other privileges) and rotating the token from @BotFather if it's
// ever abused. Leave the env vars empty to disable this feature entirely.
//
// The reverse direction (a Telegram reply auto-appearing on the web chat)
// is NOT implemented and cannot be done for free: receiving messages from
// Telegram requires either a webhook endpoint or continuous polling, both
// of which need always-on server compute that doesn't exist on the Spark
// plan. Admins should reply from the web Support Chat panel — that already
// reaches the customer instantly.

const BOT_TOKEN = process.env.NEXT_PUBLIC_TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.NEXT_PUBLIC_TELEGRAM_CHAT_ID;

export function isTelegramRelayConfigured(): boolean {
  return !!BOT_TOKEN && !!CHAT_ID;
}

async function sendTelegramMessage(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text }),
    });
  } catch {
    // Best-effort only — never block the caller's UX if Telegram is
    // unreachable or misconfigured.
  }
}

export function forwardChatMessageToTelegram(params: {
  userName: string;
  userEmail: string;
  text?: string | null;
  hasImage?: boolean;
}): Promise<void> {
  const lines = [
    `💬 Tin nhắn hỗ trợ mới`,
    `Từ: ${params.userName || 'Khách'} (${params.userEmail || 'chưa rõ email'})`,
    params.text ? params.text : params.hasImage ? '[Khách gửi kèm hình ảnh]' : '',
  ].filter(Boolean);
  return sendTelegramMessage(lines.join('\n'));
}

export function notifyWithdrawalRequestToTelegram(params: {
  requesterLabel: string;
  amountLabel: string;
  method: string;
}): Promise<void> {
  const lines = [
    `💸 Lệnh rút tiền mới cần duyệt`,
    `Người rút: ${params.requesterLabel}`,
    `Số tiền: ${params.amountLabel}`,
    `Phương thức: ${params.method}`,
    `Vào trang /manager/withdrawals để duyệt.`,
  ];
  return sendTelegramMessage(lines.join('\n'));
}
