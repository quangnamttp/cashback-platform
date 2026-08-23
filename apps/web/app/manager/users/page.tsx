'use client';

import { useState } from 'react';
import { mockAdminUsers } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';

const statusBadge: Record<string, string> = {
  ACTIVE: 'badge-success',
  SUSPENDED: 'badge-warning',
  LOCKED: 'badge-danger',
};

export default function AdminUsersPage() {
  const { lang } = useLanguage();
  const [users, setUsers] = useState(mockAdminUsers);
  const [query, setQuery] = useState('');

  const toggleLock = (id: string) => {
    setUsers((prev) =>
      prev.map((user) =>
        user.id === id ? { ...user, status: user.status === 'LOCKED' ? 'ACTIVE' : 'LOCKED' } : user
      )
    );
  };

  const filtered = users.filter(
    (user) =>
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Quản lý người dùng</span>
          <h1>Người dùng</h1>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          className="admin-search-input"
          placeholder="Tìm theo tên hoặc email..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="badge badge-neutral">{filtered.length} người dùng</span>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Số dư</th>
                <th>Tổng hoàn tiền</th>
                <th>Ngày tham gia</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>{user.id}</td>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{formatCurrency(user.balance, lang)}</td>
                  <td>{formatCurrency(user.totalCashback, lang)}</td>
                  <td>{user.joined}</td>
                  <td><span className={`badge ${statusBadge[user.status]}`}>{user.status}</span></td>
                  <td>
                    <div className="admin-action-row">
                      {user.status === 'LOCKED' ? (
                        <button className="btn-approve" onClick={() => toggleLock(user.id)}>Mở khóa</button>
                      ) : (
                        <button className="btn-reject" onClick={() => toggleLock(user.id)}>Khóa</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock) — khóa/mở khóa cập nhật client-side, chưa nối cơ sở dữ liệu thật.</p>
    </AdminShell>
  );
}
