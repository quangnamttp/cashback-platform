'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '../../../components/layout/AdminShell';
import { Modal } from '../../../components/ui/Modal';
import { loadSupportChats, saveSupportChats, type SupportChatEntry } from '../../../lib/support-chat-store';

export default function AdminSupportChatPage() {
  const [chats, setChats] = useState<SupportChatEntry[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setChats(loadSupportChats());
    setLoaded(true);
  }, []);

  const sorted = useMemo(
    () => [...chats].sort((a, b) => b.createdAt - a.createdAt),
    [chats]
  );

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  const persist = (next: SupportChatEntry[]) => {
    setChats(next);
    saveSupportChats(next);
  };

  const openChat = (chat: SupportChatEntry) => {
    persist(chats.map((c) => (c.id === chat.id ? { ...c, unread: false } : c)));
    setActiveChatId(chat.id);
    setReplyText('');
  };

  const sendReply = () => {
    if (!activeChat || !replyText.trim()) return;
    const next = chats.map((c) =>
      c.id === activeChat.id
        ? { ...c, replies: [...c.replies, { text: replyText.trim(), createdAt: Date.now() }] }
        : c
    );
    persist(next);
    setReplyText('');
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
        Tin nhắn được lưu trên trình duyệt này (tự động xoá sau 3 ngày). Trả lời ở đây hiện <strong>chỉ lưu lại
        làm nhật ký trên trình duyệt của bạn</strong> — chưa đồng bộ tới thiết bị khách hàng theo thời gian thực,
        vì việc đó cần cơ sở dữ liệu thật (sẽ hoạt động đầy đủ khi kết nối Firebase). Tin nhắn khách gửi vẫn
        được đẩy thông báo qua Telegram song song như hiện tại.
      </p>

      <div className="panel admin-table-panel">
        {!loaded ? (
          <p className="muted-copy">Đang tải...</p>
        ) : (
          <div className="support-chat-inbox">
            {sorted.map((chat) => (
              <button
                key={chat.id}
                className={`support-chat-inbox-row${chat.unread ? ' unread' : ''}`}
                onClick={() => openChat(chat)}
              >
                <div className="support-chat-inbox-avatar">👤</div>
                <div className="support-chat-inbox-body">
                  <div className="support-chat-inbox-top">
                    <strong>{chat.name}</strong>
                    {chat.unread && <span className="badge badge-danger">Mới</span>}
                    {chat.replies.length > 0 && (
                      <span className="badge badge-success">Đã trả lời</span>
                    )}
                  </div>
                  <span className="support-chat-inbox-email">{chat.email}</span>
                  <p className="support-chat-inbox-message">{chat.message}</p>
                  <span className="support-chat-inbox-time">{chat.time}</span>
                </div>
              </button>
            ))}
            {sorted.length === 0 && <p className="muted-copy">Chưa có tin nhắn hỗ trợ nào.</p>}
          </div>
        )}
      </div>

      <Modal open={!!activeChat} onClose={() => setActiveChatId(null)}>
        {activeChat && (
          <>
            <div className="modal-header-row">
              <div className="support-chat-inbox-avatar">👤</div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{activeChat.name}</h3>
                <span className="modal-code-row-small">{activeChat.email}</span>
              </div>
            </div>

            <div className="support-chat-thread">
              <div className="support-chat-bubble customer">
                <p>{activeChat.message}</p>
                <span>{activeChat.time}</span>
              </div>
              {activeChat.replies.map((reply, index) => (
                <div key={index} className="support-chat-bubble admin">
                  <p>{reply.text}</p>
                  <span>{new Date(reply.createdAt).toLocaleString('vi-VN')}</span>
                </div>
              ))}
            </div>

            <textarea
              className="support-chat-textarea"
              placeholder="Nhập nội dung trả lời..."
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              rows={3}
              style={{ marginTop: 12 }}
            />
            <button
              className="button button-primary modal-cta"
              onClick={sendReply}
              disabled={!replyText.trim()}
            >
              📨 Gửi trả lời
            </button>
          </>
        )}
      </Modal>
    </AdminShell>
  );
}
