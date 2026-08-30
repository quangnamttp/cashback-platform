import { NextRequest, NextResponse } from 'next/server';

// Relays a support message to a Telegram chat via the Telegram Bot API.
//
// This is intentionally a ONE-WAY notification, not a live two-way chat:
// there is no database/session infra in this project yet to route a reply
// back into a specific user's browser session. The realistic workflow is:
// customer sends a message (with their contact info) -> admin gets pinged
// on Telegram immediately, even while away from the /manager dashboard ->
// admin replies to the customer directly via email/phone/Zalo, outside
// this app. Building a true live chat widget would need a real backend
// (database + websockets/polling) which is out of scope while backend
// work is paused.
//
// Setup required (does nothing until these are set on the host):
//   1. Create a bot via @BotFather on Telegram, copy its token.
//   2. Message the bot (or add it to a group) and find the chat id
//      (e.g. via https://api.telegram.org/bot<TOKEN>/getUpdates).
//   3. Set env vars on your hosting provider:
//        SUPPORT_TELEGRAM_BOT_TOKEN
//        SUPPORT_TELEGRAM_CHAT_ID

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  const hasText = body && typeof body.message === 'string' && body.message.trim();
  const hasImage = body && typeof body.imageBase64 === 'string' && body.imageBase64.length > 0;

  if (!body || (!hasText && !hasImage)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const botToken = process.env.SUPPORT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.SUPPORT_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return NextResponse.json({ error: 'telegram_not_configured' }, { status: 503 });
  }

  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Khách (chưa rõ tên)';
  const contact = typeof body.contact === 'string' && body.contact.trim() ? body.contact.trim() : 'Không cung cấp';
  const message = hasText ? body.message.trim() : '(gửi kèm ảnh, không có nội dung chữ)';

  const text = [
    '🆘 Tin nhắn hỗ trợ mới — Hoàn Tiền DV',
    `Từ: ${name}`,
    `Liên hệ: ${contact}`,
    '',
    message,
  ].join('\n');

  try {
    if (hasImage) {
      // imageBase64 is expected as a data URL, e.g. "data:image/png;base64,...."
      const commaIndex = body.imageBase64.indexOf(',');
      const base64Data = commaIndex >= 0 ? body.imageBase64.slice(commaIndex + 1) : body.imageBase64;
      const buffer = Buffer.from(base64Data, 'base64');

      if (buffer.byteLength > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'image_too_large' }, { status: 413 });
      }

      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('caption', text.slice(0, 1024));
      form.append('photo', new Blob([buffer]), 'support-image.jpg');

      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
        method: 'POST',
        body: form,
      });

      if (!res.ok) {
        return NextResponse.json({ error: 'telegram_send_failed' }, { status: 502 });
      }
    } else {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
      });

      if (!res.ok) {
        return NextResponse.json({ error: 'telegram_send_failed' }, { status: 502 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'telegram_send_failed' }, { status: 502 });
  }
}

export const runtime = 'nodejs';
