import Link from 'next/link';
import { mockCashbackRows, mockDashboardStats, mockOrderRows } from '../../lib/mock-data';

export default function DashboardPage() {
  return (
    <main className="container dashboard-page">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Overview</span>
          <h1>Dashboard người dùng</h1>
        </div>
        <Link href="/orders" className="button button-primary">Xem đơn hàng</Link>
      </div>

      <div className="stats-grid">
        {mockDashboardStats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-delta">{stat.delta}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-panels">
        <section className="panel">
          <div className="panel-header">
            <h3>Đơn hàng gần đây</h3>
            <Link href="/orders" className="text-link">Xem tất cả</Link>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Product</th>
                <th>Platform</th>
                <th>Cashback</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {mockOrderRows.slice(0, 4).map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.product}</td>
                  <td>{item.platform}</td>
                  <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.cashback)}</td>
                  <td>
                    <span className={`badge ${item.status === 'CONFIRMED' ? 'badge-success' : item.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="panel">
          <div className="panel-header">
            <h3>Cashback sắp tới</h3>
            <Link href="/cashback" className="text-link">Chi tiết</Link>
          </div>

          <div className="stack-list">
            {mockCashbackRows.slice(0, 4).map((row) => (
              <div key={row.id} className="summary-row">
                <div>
                  <strong>{row.platform}</strong>
                  <span>{row.date}</span>
                </div>
                <div className="amount-box">
                  <strong>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.amount)}</strong>
                  <span>{row.status}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
