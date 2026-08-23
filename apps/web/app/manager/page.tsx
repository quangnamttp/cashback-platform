import { mockAdminStats, mockFraudSignals } from '../../lib/mock-data';
import { AdminShell } from '../../components/layout/AdminShell';

export default function AdminPage() {
  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Tổng quan</span>
          <h1>Admin dashboard</h1>
        </div>
        <button className="button button-primary">Xuất báo cáo</button>
      </div>

      <div className="stats-grid admin-grid">
        {mockAdminStats.map((stat) => (
          <div key={stat.label} className="stat-card compact">
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
          </div>
        ))}
      </div>

      <div className="panel admin-table-panel">
        <div className="panel-header">
          <h3>Cảnh báo gian lận gần đây</h3>
          <span className="badge badge-danger">{mockFraudSignals.length} cảnh báo</span>
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Người dùng</th>
                <th>Lý do</th>
                <th>Mức rủi ro</th>
              </tr>
            </thead>
            <tbody>
              {mockFraudSignals.map((signal) => (
                <tr key={signal.user}>
                  <td>{signal.user}</td>
                  <td>{signal.reason}</td>
                  <td>
                    <span className={`badge badge-${signal.risk === 'HIGH' ? 'danger' : 'warning'}`}>
                      {signal.risk}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
