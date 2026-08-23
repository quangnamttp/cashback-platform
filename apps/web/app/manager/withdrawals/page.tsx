'use client';

import { useState } from 'react';
import { mockWithdrawalRequests } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';

const statusBadge: Record<string, string> = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
};

export default function AdminWithdrawalsPage() {
  const { lang } = useLanguage();
  const [rows, setRows] = useState(mockWithdrawalRequests);
  const pendingCount = rows.filter((row) => row.status === 'PENDING').length;

  const setStatus = (id: string, status: 'APPROVED' | 'REJECTED') => {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, status } : row)));
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Duyệt rút tiền</span>
          <h1>Yêu cầu rút tiền</h1>
        </div>
        <span className="badge badge-warning">{pendingCount} đang chờ duyệt</span>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã yêu cầu</th>
                <th>Người dùng</th>
                <th>Số tiền</th>
                <th>Phương thức</th>
                <th>Ngày yêu cầu</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.user}</td>
                  <td>{formatCurrency(row.amount, lang)}</td>
                  <td>{row.method}</td>
                  <td>{row.requestedAt}</td>
                  <td><span className={`badge ${statusBadge[row.status]}`}>{row.status}</span></td>
                  <td>
                    {row.status === 'PENDING' ? (
                      <div className="admin-action-row">
                        <button className="btn-approve" onClick={() => setStatus(row.id, 'APPROVED')}>Duyệt</button>
                        <button className="btn-reject" onClick={() => setStatus(row.id, 'REJECTED')}>Từ chối</button>
                      </div>
                    ) : (
                      <span className="muted-copy">Đã xử lý</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock) — trạng thái cập nhật ngay trên giao diện (client-side), chưa lưu vào cơ sở dữ liệu thật. Khi tải lại trang sẽ về trạng thái ban đầu.</p>
    </AdminShell>
  );
}
