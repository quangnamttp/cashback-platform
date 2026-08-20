import { mockFraudSignals } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';

export default function AdminFraudPage() {
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
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {mockFraudSignals.map((signal) => (
                <tr key={signal.user}>
                  <td>{signal.user}</td>
                  <td>{signal.reason}</td>
                  <td>
                    <span className={`badge badge-${signal.risk === 'HIGH' ? 'danger' : 'warning'}`}>{signal.risk}</span>
                  </td>
                  <td>
                    <div className="admin-action-row">
                      <button className="btn-reject">Khóa tài khoản</button>
                      <button className="btn-approve">Bỏ qua</button>
                    </div>
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
