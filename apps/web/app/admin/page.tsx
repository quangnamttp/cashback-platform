import { mockAdminStats, mockFraudSignals } from '../../lib/mock-data';

export default function AdminPage() {
  return (
    <main className="container admin-page-shell">
      <aside className="admin-sidebar panel">
        <div className="brand-block compact">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">Cashback Platform</div>
            <div className="brand-subtitle">Admin console</div>
          </div>
        </div>

        <nav className="admin-nav">
          <a href="#">Dashboard</a>
          <a href="#">Users</a>
          <a href="#">Affiliate platforms</a>
          <a href="#">Products / links</a>
          <a href="#">Orders</a>
          <a href="#">Commissions</a>
          <a href="#">Cashback</a>
          <a href="#">Fraud signals</a>
        </nav>
      </aside>

      <section className="admin-content">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">Overview</span>
            <h1>Admin dashboard</h1>
          </div>
          <button className="button button-primary">Export report</button>
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
            <h3>Recent fraud signals</h3>
            <span className="badge badge-danger">3 flagged</span>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Reason</th>
                <th>Risk</th>
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
      </section>
    </main>
  );
}
