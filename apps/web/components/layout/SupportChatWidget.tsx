'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { loadAutoReplyMessage } from '../../lib/auto-reply-store';

type ChatMessage = {
  from: 'user' | 'admin';
  text?: string;
  imageDataUrl?: string;
  time: number;
};

const THREAD_KEY = 'cb_my_chat_thread';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function loadThread(): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(THREAD_KEY);
    const all: ChatMessage[] = raw ? JSON.parse(raw) : [];
    const cutoff = Date.now() - THREE_DAYS_MS;
    return all.filter((m) => m.time >= cutoff);
  } catch {
    return [];
  }
}

function saveThread(thread: ChatMessage[]) {
  try {
    window.localStorage.setItem(THREAD_KEY, JSON.stringify(thread));
  } catch {
    // ignore storage errors
  }
}

export function SupportChatWidget() {
  const { t } = useLanguage();
  const { isLoggedIn, userName, userEmail } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [errorState, setErrorState] = useState<'not_configured' | 'error' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setThread(loadThread());
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread]);

  if (!isLoggedIn) {
    return null;
  }

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSend = async () => {
    if (!message.trim() && !imagePreview) return;
    setSending(true);
    setErrorState(null);

    const isFirstMessage = thread.length === 0;
    const userMsg: ChatMessage = {
      from: 'user',
      text: message.trim() || undefined,
      imageDataUrl: imagePreview || undefined,
      time: Date.now(),
    };

    try {
      const res = await fetch('/api/support-chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userName,
          contact: userEmail,
          message: message.trim(),
          imageBase64: imagePreview || undefined,
        }),
      });

      if (res.ok) {
        let nextThread = [...thread, userMsg];
        setThread(nextThread);
        saveThread(nextThread);
        setMessage('');
        setImagePreview(null);

        if (isFirstMessage) {
          setTimeout(() => {
            const autoReply: ChatMessage = {
              from: 'admin',
              text: loadAutoReplyMessage(),
              time: Date.now(),
            };
            setThread((prev) => {
              const updated = [...prev, autoReply];
              saveThread(updated);
              return updated;
            });
          }, 1200);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorState(data.error === 'telegram_not_configured' ? 'not_configured' : 'error');
      }
    } catch {
      setErrorState('error');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="support-chat-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label={t('chat_widget_title')}
      >
        {open ? '✕' : '💬'}
      </button>

      {open && (
        <div className="support-chat-panel">
          <div className="support-chat-header">
            <strong>💬 {t('chat_widget_title')}</strong>
            <button className="support-chat-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
          </div>

          {thread.length === 0 && <p className="support-chat-desc">{t('chat_widget_desc')}</p>}

          <div className="support-chat-messages" ref={scrollRef}>
            {thread.map((msg, index) => (
              <div key={index} className={`support-chat-bubble ${msg.from === 'user' ? 'admin' : 'customer'}`}>
                {msg.imageDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={msg.imageDataUrl} alt="attachment" className="support-chat-bubble-image" />
                )}
                {msg.text && <p>{msg.text}</p>}
                <span>{new Date(msg.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            ))}
          </div>

          {imagePreview && (
            <div className="support-chat-image-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagePreview} alt="preview" />
              <button onClick={() => setImagePreview(null)} aria-label="Remove image">✕</button>
            </div>
          )}

          {errorState === 'not_configured' && (
            <p className="admin-gate-error">{t('chat_widget_not_configured')}</p>
          )}
          {errorState === 'error' && (
            <p className="admin-gate-error">{t('chat_widget_error')}</p>
          )}

          <div className="support-chat-input-row">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleImagePick}
            />
            <button
              type="button"
              className="support-chat-attach-btn"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach image"
            >
              🖼️
            </button>
            <textarea
              className="support-chat-textarea"
              placeholder={t('chat_widget_message_placeholder')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={1}
            />
            <button
              className="support-chat-send-btn"
              onClick={handleSend}
              disabled={(!message.trim() && !imagePreview) || sending}
              aria-label="Send"
            >
              {sending ? '…' : '➤'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
