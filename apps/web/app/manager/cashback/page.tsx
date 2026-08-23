'use client';

import { useState } from 'react';
import { mockCashbackRows } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';

const statusBadge: Record<string, string> = {
  AVAILABLE: 'badge-success',
  CONFIRMED: 'badge-success',
  PENDING: 'badge-warning',
  WITHDRAWN: 'badge-neutral',
  REJECTED: 'badge-danger',
};

export default function AdminCashbackPage() {
  const { lang } = useLanguage();
  const [rows, setRows] = useState(mockCashbackRows);

  const setStatus = (id: string, status: 'CONFIRMED' | 'REJECTED') => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Cashback / Hoa hồng</span>
          <h1>Quản lý cashback toàn hệ thống</h1>
        </div>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Nền tảng</th>
                <th>Số tiền</th>
                <th>Trạng thái</th>
                <th>Ngày</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.platform}</td>
                  <td>{formatCurrency(item.amount, lang)}</td>
                  <td><span className={`badge ${statusBadge[item.status] ?? 'badge-neutral'}`}>{item.status}</span></td>
                  <td>{item.date}</td>
                  <td>
                    {item.status === 'PENDING' ? (
                      <div className="admin-action-row">
                        <button className="btn-approve" onClick={() => setStatus(item.id, 'CONFIRMED')}>Xác nhận</button>
                        <button className="btn-reject" onClick={() => setStatus(item.id, 'REJECTED')}>Từ chối</button>
                      </div>
                    ) : (
                      <span className="muted-copy">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock) — trạng thái cập nhật client-side, chưa nối API affiliate/commission thật.</p>
    </AdminShell>
  );
}
