'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Timestamp,
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { AdminShell } from '../../../components/layout/AdminShell';
import { Modal } from '../../../components/ui/Modal';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { getFirebaseDb } from '../../../lib/firebase';
import { usePageTitle } from '../../../lib/use-page-title';

const CHAT_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unread', label: 'Chưa đọc' },
];

// Same cap as the customer-facing widget (lib note there: Firestore
// documents cap at 1MB and base64 inflates ~33%, so this leaves headroom).
const MAX_IMAGE_BYTES = 650 * 1024;

type ChatThread = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  lastMessagePreview: string;
  lastMessageAt?: Timestamp;
  hasUnreadForAdmin?: boolean;
};

type ChatMessage = {
  id: string;
  sender: 'user' | 'admin';
  text?: string | null;
  imageUrl?: string | null;
  createdAt?: Timestamp;
};

export default function AdminSupportChatPage() {
  usePageTitle('Tin nhắn hỗ trợ');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeMessages, setActiveMessages] = useState<ChatMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [readFilter, setReadFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(getFirebaseDb(), 'supportChats'), orderBy('lastMessageAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setThreads(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatThread));
      setLoaded(true);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!activeThreadId) {
      setActiveMessages([]);
      return undefined;
    }
    const q = query(
      collection(getFirebaseDb(), 'supportChats', activeThreadId, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setActiveMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatMessage));
    });
    return unsubscribe;
  }, [activeThreadId]);

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  const filteredThreads = useMemo(() => {
    return threads.filter((thread) => {
      if (readFilter === 'unread' && !thread.hasUnreadForAdmin) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        (thread.userName ?? '').toLowerCase().includes(q) ||
        (thread.userEmail ?? '').toLowerCase().includes(q) ||
        thread.id.toLowerCase().includes(q)
      );
    });
  }, [threads, searchQuery, readFilter]);

  const openThread = (thread: ChatThread) => {
    setActiveThreadId(thread.id);
    setReplyText('');
    setImagePreview(null);
    setImageError(false);
    if (thread.hasUnreadForAdmin) {
      updateDoc(doc(getFirebaseDb(), 'supportChats', thread.id), { hasUnreadForAdmin: false }).catch(() => undefined);
    }
  };

  const handleImagePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(true);
      return;
    }
    setImageError(false);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => setImagePreview(null);

  const sendReply = async () => {
    if (!activeThreadId || (!replyText.trim() && !imagePreview)) return;
    const text = replyText.trim();
    const preview = text || (imagePreview ? '📷 Hình ảnh' : '');
    setReplyText('');
    setImagePreview(null);
    const threadRef = doc(getFirebaseDb(), 'supportChats', activeThreadId);
    await addDoc(collection(threadRef, 'messages'), {
      sender: 'admin',
      text: text || null,
      imageUrl: imagePreview,
      createdAt: serverTimestamp(),
    });
    await updateDoc(threadRef, {
      lastMessageAt: serverTimestamp(),
      lastMessagePreview: preview,
      hasUnreadForUser: true,
    });
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Hỗ trợ khách hàng</span>
          <h1>Tin nhắn hỗ trợ</h1>
        </div>
      </div>

      <p className="mock-note" style={{ marginTop: -8 }}>
        Dữ liệu thật, thời gian thực từ Firestore (collection <code>supportChats</code>) — trả lời ở đây khách sẽ thấy
        ngay trên bóng chat của họ, không cần tải lại trang. Ảnh khách gửi được nhúng trực tiếp trong tin nhắn (không
        qua Google Drive, vì Drive cá nhân của khách không dùng chung được với Admin) — toàn bộ cuộc trò chuyện tự xoá
        sau 3 ngày để Firestore không phình to.
      </p>

      <AdminSearchToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Tìm theo tên hoặc email khách..."
        filterValue={readFilter}
        onFilterChange={setReadFilter}
        filterOptions={CHAT_FILTER_OPTIONS}
        resultCount={filteredThreads.length}
        resultLabel="cuộc trò chuyện"
      />

      <div className="panel admin-table-panel">
        {!loaded ? (
          <p className="muted-copy">Đang tải...</p>
        ) : (
          <div className="support-chat-inbox">
            {filteredThreads.map((thread) => (
              <button
                key={thread.id}
                className={`support-chat-inbox-row${thread.hasUnreadForAdmin ? ' unread' : ''}`}
                onClick={() => openThread(thread)}
              >
                <div className="support-chat-inbox-avatar">👤</div>
                <div className="support-chat-inbox-body">
                  <div className="support-chat-inbox-top">
                    <strong>{thread.userName || 'Người dùng'}</strong>
                    {thread.hasUnreadForAdmin && <span className="badge badge-danger">Mới</span>}
                  </div>
                  <span className="support-chat-inbox-email">{thread.userEmail}</span>
                  <p className="support-chat-inbox-message">{thread.lastMessagePreview}</p>
                  <span className="support-chat-inbox-time">
                    {thread.lastMessageAt ? thread.lastMessageAt.toDate().toLocaleString('vi-VN') : ''}
                  </span>
                </div>
              </button>
            ))}
            {filteredThreads.length === 0 && (
              <p className="muted-copy">
                {threads.length === 0 ? 'Chưa có tin nhắn hỗ trợ nào.' : 'Không tìm thấy cuộc trò chuyện phù hợp.'}
              </p>
            )}
          </div>
        )}
      </div>

      <Modal open={!!activeThread} onClose={() => setActiveThreadId(null)} panelClassName="support-chat-modal-panel">
        {activeThread && (
          <>
            <div className="support-chat-header">
              <div className="support-chat-header-info">
                <span className="support-chat-header-avatar">👤</span>
                <div>
                  <strong>{activeThread.userName || 'Người dùng'}</strong>
                  <span className="support-chat-header-email">{activeThread.userEmail}</span>
                </div>
              </div>
              <button className="support-chat-close" onClick={() => setActiveThreadId(null)} aria-label="Đóng">✕</button>
            </div>

            <div className="support-chat-body">
              {activeMessages.map((msg, idx) => {
                const prev = activeMessages[idx - 1];
                const showTail = !prev || prev.sender !== msg.sender;
                return (
                  <div
                    key={msg.id}
                    className={`support-chat-bubble ${msg.sender === 'admin' ? 'admin' : 'customer'}${showTail ? ' tail' : ''}`}
                  >
                    {msg.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={msg.imageUrl} alt="attachment" className="support-chat-bubble-image" />
                    )}
                    {msg.text && <p>{msg.text}</p>}
                    <span>
                      {msg.createdAt
                        ? msg.createdAt.toDate().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="support-chat-composer">
              {imagePreview && (
                <div className="support-chat-image-preview">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagePreview} alt="preview" />
                  <button onClick={clearImage} aria-label="Xóa ảnh">✕</button>
                </div>
              )}
              {imageError && <p className="admin-gate-error">Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn 650KB.</p>}

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
                  placeholder="Nhập nội dung trả lời..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  rows={1}
                />
                <button
                  className="support-chat-send-btn"
                  onClick={sendReply}
                  disabled={!replyText.trim() && !imagePreview}
                  aria-label="Gửi"
                >
                  ➤
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </AdminShell>
  );
}
