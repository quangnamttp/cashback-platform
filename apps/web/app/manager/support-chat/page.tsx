'use client';

import { useMemo, useState } from 'react';
import { AdminShell } from '../../../components/layout/AdminShell';
import { mockSupportChats } from '../../../lib/mock-data';

export default function AdminSupportChatPage() {
  const [chats, setChats] = useState(mockSupportChats);

  const sorted = useMemo(
    () => [...chats].sort((a, b) => (a.time < b.time ? 1 : -1)),
    [chats]
  );

  const markRead = (id: string) => {
    setChats((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)));
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
        Dữ liệu minh họa (mock) — đây là giao diện nền tảng cho hộp thư hỗ trợ. Khi kết nối cơ sở dữ liệu thật
        (ví dụ Firebase), tin nhắn khách gửi qua bong bóng chat trên web sẽ hiện tại đây theo thời gian thực,
        đồng thời vẫn được đẩy thông báo qua Telegram như hiện tại.
      </p>

      <div className="panel admin-table-panel">
        <div className="support-chat-inbox scrollable-list">
          {sorted.map((chat) => (
            <button
              key={chat.id}
              className={`support-chat-inbox-row${chat.unread ? ' unread' : ''}`}
              onClick={() => markRead(chat.id)}
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
    </AdminShell>
  );
}
