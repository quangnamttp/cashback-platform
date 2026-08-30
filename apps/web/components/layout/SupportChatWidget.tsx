'use client';

import { useState } from 'react';
import { useLanguage } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';

type SendState = 'idle' | 'sending' | 'sent' | 'not_configured' | 'error';

export function SupportChatWidget() {
  const { t } = useLanguage();
  const { isLoggedIn, userName, userEmail } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SendState>('idle');

  if (!isLoggedIn) {
    return null;
  }

  const handleSend = async () => {
    if (!message.trim()) return;
    setState('sending');
    try {
      const res = await fetch('/api/support-chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userName,
          contact: userEmail,
          message,
        }),
      });

      if (res.ok) {
        setState('sent');
        setMessage('');
      } else {
        const data = await res.json().catch(() => ({}));
        setState(data.error === 'telegram_not_configured' ? 'not_configured' : 'error');
      }
    } catch {
      setState('error');
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

          <p className="support-chat-desc">{t('chat_widget_desc')}</p>

          {state === 'sent' ? (
            <div className="support-chat-success">
              <span style={{ fontSize: '1.8rem' }}>✅</span>
              <p>{t('chat_widget_sent')}</p>
              <button className="button button-secondary" onClick={() => setState('idle')}>{t('chat_widget_send_another')}</button>
            </div>
          ) : (
            <>
              <textarea
                className="support-chat-textarea"
                placeholder={t('chat_widget_message_placeholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />

              {state === 'not_configured' && (
                <p className="admin-gate-error">{t('chat_widget_not_configured')}</p>
              )}
              {state === 'error' && (
                <p className="admin-gate-error">{t('chat_widget_error')}</p>
              )}

              <button
                className="button button-primary wide-button"
                onClick={handleSend}
                disabled={!message.trim() || state === 'sending'}
              >
                {state === 'sending' ? t('chat_widget_sending') : `📨 ${t('chat_widget_send')}`}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
