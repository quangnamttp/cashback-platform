'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useLanguage } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { getFirebaseDb } from '../../lib/firebase';
import { loadAutoReplyMessage } from '../../lib/auto-reply-store';
import { forwardChatMessageToTelegram } from '../../lib/telegram';
import { compressImageForChat } from '../../lib/imageCompress';
import { ImageLightbox } from '../ui/ImageLightbox';

type ChatMessage = {
  id: string;
  sender: 'user' | 'admin';
  text?: string | null;
  imageUrl?: string | null;
  createdAt?: Timestamp;
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function SupportChatWidget() {
  const { t } = useLanguage();
  const { isLoggedIn, userName, userEmail, uid } = useAuth();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [clearedAtMs, setClearedAtMs] = useState(0);
  const [hasUnread, setHasUnread] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorState, setErrorState] = useState<'error' | 'too_large' | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sweepDoneRef = useRef(false);

  // Watches the unread flag regardless of open/closed so the FAB can carry
  // a notification dot the moment an admin reply lands (Telegram-style),
  // not only after the customer happens to reopen the widget.
  useEffect(() => {
    if (!uid) return undefined;
    const unsubscribe = onSnapshot(doc(getFirebaseDb(), 'supportChats', uid), (snap) => {
      setHasUnread(!!snap.data()?.hasUnreadForUser);
      const clearedAt = snap.data()?.clearedAt as Timestamp | undefined;
      setClearedAtMs(clearedAt?.toMillis?.() ?? 0);
    });
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    if (!open || !uid) return undefined;

    const messagesQuery = query(
      collection(getFirebaseDb(), 'supportChats', uid, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    const unsubscribe = onSnapshot(messagesQuery, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage);
      // Admin's "Xóa lịch sử chat" sets supportChats/{uid}.clearedAt — a
      // soft clear, not a real delete: messages before that moment simply
      // stop rendering here (and in the admin's own view), nothing is
      // removed from Firestore.
      setMessages(clearedAtMs ? all.filter((m) => (m.createdAt?.toMillis?.() ?? 0) > clearedAtMs) : all);
    });

    updateDoc(doc(getFirebaseDb(), 'supportChats', uid), { hasUnreadForUser: false }).catch(() => undefined);

    // No shared server-side storage anymore (each person's Google Drive is
    // personal to them, not visible to the admin) — chat images always ride
    // inline in Firestore, so history always self-prunes after 3 days.
    if (!sweepDoneRef.current) {
      sweepDoneRef.current = true;
      const cutoff = Timestamp.fromMillis(Date.now() - THREE_DAYS_MS);
      getDocs(query(collection(getFirebaseDb(), 'supportChats', uid, 'messages'), where('createdAt', '<', cutoff)))
        .then((snap) => Promise.all(snap.docs.map((d) => deleteDoc(d.ref))))
        .catch(() => undefined);
    }

    return unsubscribe;
  }, [open, uid, clearedAtMs]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  if (!isLoggedIn || !uid) {
    return null;
  }

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorState(null);
    const compressed = await compressImageForChat(file).catch(() => null);
    if (!compressed) {
      setErrorState('too_large');
      return;
    }
    setImagePreview(compressed);
  };

  const clearImage = () => setImagePreview(null);

  const handleSend = async () => {
    if ((!message.trim() && !imagePreview) || sending) return;
    setSending(true);
    setErrorState(null);

    try {
      const db = getFirebaseDb();
      const threadRef = doc(db, 'supportChats', uid);
      const isFirstMessage = messages.length === 0;
      const trimmedText = message.trim();

      await addDoc(collection(threadRef, 'messages'), {
        sender: 'user',
        text: trimmedText || null,
        imageUrl: imagePreview,
        createdAt: serverTimestamp(),
      });

      const preview = trimmedText || (imagePreview ? '📷 Hình ảnh' : '');
      const threadSnap = await getDoc(threadRef);
      if (threadSnap.exists()) {
        await updateDoc(threadRef, {
          userName,
          userEmail,
          lastMessageAt: serverTimestamp(),
          lastMessagePreview: preview,
          hasUnreadForAdmin: true,
        });
      } else {
        await setDoc(threadRef, {
          userId: uid,
          userName,
          userEmail,
          createdAt: serverTimestamp(),
          lastMessageAt: serverTimestamp(),
          lastMessagePreview: preview,
          hasUnreadForAdmin: true,
          hasUnreadForUser: false,
        });
      }

      // Awaited (not fire-and-forget) so the send action doesn't finish
      // (and this component doesn't move on to clearing the composer /
      // re-rendering) until the Telegram forward has actually completed —
      // a dangling unawaited promise here is vulnerable to the user
      // closing the widget or navigating away a moment later, which can
      // abort an in-flight fetch before the request ever leaves the
      // browser.
      await forwardChatMessageToTelegram({
        userName,
        userEmail,
        text: trimmedText,
        hasImage: !!imagePreview,
      });

      setMessage('');
      clearImage();

      if (isFirstMessage) {
        setTimeout(() => {
          addDoc(collection(threadRef, 'messages'), {
            sender: 'admin',
            text: loadAutoReplyMessage(),
            imageUrl: null,
            createdAt: serverTimestamp(),
          }).catch(() => undefined);
        }, 1200);
      }
    } catch (err) {
      console.error('send chat message failed', err);
      setErrorState('error');
    } finally {
      setSending(false);
    }
  };

  // Only ever called on the customer's own messages (see the trash button
  // below — never rendered on an admin reply) — firestore.rules' isOwner
  // check on supportChats/{uid}/messages would in fact allow deleting the
  // whole thread's messages, but the UI deliberately narrows that to "your
  // own" only, matching what this feature is meant to let a customer do.
  const deleteMyMessage = async (messageId: string) => {
    if (!uid) return;
    if (!window.confirm('Xóa tin nhắn này? Không thể hoàn tác.')) return;
    try {
      await deleteDoc(doc(getFirebaseDb(), 'supportChats', uid, 'messages', messageId));
    } catch (err) {
      console.error('delete message failed', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
        {!open && hasUnread && <span className="support-chat-fab-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="support-chat-panel">
          <div className="support-chat-header">
            <div className="support-chat-header-info">
              <span className="support-chat-header-avatar">🎧</span>
              <div>
                <strong>{t('chat_widget_title')}</strong>
                <span className="support-chat-header-status">● {t('chat_widget_online')}</span>
              </div>
            </div>
            <button className="support-chat-close" onClick={() => setOpen(false)} aria-label="Đóng">✕</button>
          </div>

          <div className="support-chat-body" ref={scrollRef}>
            {messages.length === 0 && <p className="support-chat-desc">{t('chat_widget_desc')}</p>}

            {messages.map((msg, idx) => {
              const prev = messages[idx - 1];
              const showTail = !prev || prev.sender !== msg.sender;
              const side = msg.sender === 'user' ? 'admin' : 'customer';
              const isMine = msg.sender === 'user';
              return (
                <div key={msg.id} className={`support-chat-bubble-row ${side}`}>
                  <div className={`support-chat-bubble ${side}${showTail ? ' tail' : ''}`}>
                    {msg.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={msg.imageUrl}
                        alt="attachment"
                        className="support-chat-bubble-image"
                        onClick={() => setLightboxUrl(msg.imageUrl!)}
                      />
                    )}
                    {msg.text && <p>{msg.text}</p>}
                    <span>
                      {msg.createdAt
                        ? msg.createdAt.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                  </div>
                  {isMine && (
                    <button
                      type="button"
                      className="support-chat-msg-delete"
                      onClick={() => deleteMyMessage(msg.id)}
                      aria-label="Xóa tin nhắn này"
                      title="Xóa tin nhắn này"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

          <div className="support-chat-composer">
            {imagePreview && (
              <div className="support-chat-image-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreview} alt="preview" />
                <button onClick={clearImage} aria-label="Xóa ảnh">✕</button>
              </div>
            )}

            {errorState === 'error' && <p className="admin-gate-error">{t('chat_widget_error')}</p>}
            {errorState === 'too_large' && <p className="admin-gate-error">{t('chat_widget_image_too_large')}</p>}

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
                aria-label="Đính kèm ảnh"
                title="Đính kèm ảnh"
              >
                +
              </button>
              <textarea
                className="support-chat-textarea"
                placeholder={t('chat_widget_message_placeholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
              />
              <button
                className="support-chat-send-btn"
                onClick={handleSend}
                disabled={(!message.trim() && !imagePreview) || sending}
                aria-label="Gửi"
              >
                {sending ? '…' : '➤'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
