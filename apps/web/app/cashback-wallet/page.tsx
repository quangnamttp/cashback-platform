import { mockCashbackRows } from '../../lib/mock-data';

export default function CashbackWalletPage() {
  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Cashback Wallet</span>
          <h1>Balance and withdrawals</h1>
        </div>
      </div>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Available</div>
          <div className="stat-value">₫890K</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value">₫790K</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Withdrawn</div>
          <div className="stat-value">₫320K</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Rejected</div>
          <div className="stat-value">₫60K</div>
        </div>
      </section>

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Platform</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mockCashbackRows.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.platform}</td>
                <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.amount)}</td>
                <td><span className={`badge ${item.status === 'AVAILABLE' || item.status === 'CONFIRMED' ? 'badge-success' : item.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>{item.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
