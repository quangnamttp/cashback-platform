'use client';

import { useMemo, useState } from 'react';
import { AdminShell } from '../../../components/layout/AdminShell';
import { Modal } from '../../../components/ui/Modal';
import { mockSupportChats } from '../../../lib/mock-data';

// Parses "DD/MM/YYYY HH:mm" into a real timestamp so sorting is always
// chronologically correct (plain string comparison breaks across month
// boundaries, e.g. "01/09" would incorrectly sort before "30/08").
function parseVnDateTime(value: string): number {
  const [datePart, timePart] = value.split(' ');
  const [day, month, year] = datePart.split('/').map(Number);
  const [hour, minute] = (timePart ?? '00:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
}

export default function AdminSupportChatPage() {
  const [chats, setChats] = useState(mockSupportChats);
  const [activeChat, setActiveChat] = useState<(typeof mockSupportChats)[number] | null>(null);

  const sorted = useMemo(
    () => [...chats].sort((a, b) => parseVnDateTime(b.time) - parseVnDateTime(a.time)),
    [chats]
  );

  const openChat = (chat: (typeof mockSupportChats)[number]) => {
    setChats((prev) => prev.map((c) => (c.id === chat.id ? { ...c, unread: false } : c)));
    setActiveChat(chat);
  };

  const replyMailto = activeChat
    ? `mailto:${activeChat.email}?subject=${encodeURIComponent('Hỗ trợ Cashback Platform')}&body=${encodeURIComponent(
        `Chào ${activeChat.name},\n\nVề nội dung bạn gửi: "${activeChat.message}"\n\n`
      )}`
    : '#';

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Hỗ trợ khách hàng</span>
          <h1>Tin nhắn hỗ trợ</h1>
        </div>
      </div>

      <p className="mock-note" style={{ marginTop: -8 }}>
        Dữ liệu minh họa (mock) — đây là giao diện nền tảng cho hộp thư hỗ trợ. Khi kết nối cơ sở dữ liệu thật
        (ví dụ Firebase), tin nhắn khách gửi qua bong bóng chat trên web sẽ hiện tại đây theo thời gian thực,
        đồng thời vẫn được đẩy thông báo qua Telegram như hiện tại.
      </p>

      <div className="panel admin-table-panel">
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
                </div>
                <span className="support-chat-inbox-email">{chat.email}</span>
                <p className="support-chat-inbox-message">{chat.message}</p>
                <span className="support-chat-inbox-time">{chat.time}</span>
              </div>
            </button>
          ))}
          {sorted.length === 0 && <p className="muted-copy">Chưa có tin nhắn hỗ trợ nào.</p>}
        </div>
      </div>

      <Modal open={!!activeChat} onClose={() => setActiveChat(null)}>
        {activeChat && (
          <>
            <div className="modal-header-row">
              <div className="support-chat-inbox-avatar">👤</div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{activeChat.name}</h3>
                <span className="modal-code-row-small">{activeChat.email}</span>
              </div>
            </div>

            <div className="modal-field-list">
              <div className="modal-field-row">
                <span>Thời gian</span>
                <span>{activeChat.time}</span>
              </div>
            </div>

            <p className="support-chat-detail-message">{activeChat.message}</p>

            <a href={replyMailto} className="button button-primary modal-cta">
              ✉️ Trả lời qua Email
            </a>
            <p className="mock-note" style={{ marginTop: 10 }}>
              Mở ứng dụng email mặc định của bạn với sẵn địa chỉ khách hàng để trả lời trực tiếp.
            </p>
          </>
        )}
      </Modal>
    </AdminShell>
  );
}
