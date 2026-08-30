'use client';

import { useState } from 'react';
import { mockFraudSignals } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';
import { usePageTitle } from '../../../lib/use-page-title';

export default function AdminFraudPage() {
  usePageTitle('Cảnh báo gian lận');
  const [signals, setSignals] = useState(mockFraudSignals.map((s) => ({ ...s, resolved: false })));

  const resolve = (user: string) => {
    setSignals((prev) => prev.map((s) => (s.user === user ? { ...s, resolved: true } : s)));
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Fraud / Risk</span>
          <h1>Cảnh báo gian lận</h1>
        </div>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Lý do</th>
                <th>Mức rủi ro</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => (
                <tr key={signal.user}>
                  <td>{signal.user}</td>
                  <td>{signal.reason}</td>
                  <td>
                    <span className={`badge badge-${signal.risk === 'HIGH' ? 'danger' : 'warning'}`}>{signal.risk}</span>
                  </td>
                  <td>
                    {signal.resolved ? (
                      <span className="badge badge-neutral">Đã xử lý</span>
                    ) : (
                      <span className="badge badge-warning">Chờ xử lý</span>
                    )}
                  </td>
                  <td>
                    {!signal.resolved && (
                      <div className="admin-action-row">
                        <button className="btn-reject" onClick={() => resolve(signal.user)}>Khóa tài khoản</button>
                        <button className="btn-approve" onClick={() => resolve(signal.user)}>Bỏ qua</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock) — hệ thống phát hiện gian lận thật sẽ triển khai ở phase sau.</p>
    </AdminShell>
  );
}
