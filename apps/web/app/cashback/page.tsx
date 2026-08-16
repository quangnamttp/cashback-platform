import { mockCashbackRows } from '../../lib/mock-data';

export default function CashbackPage() {
  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Cashback</span>
          <h1>Quản lý cashback</h1>
        </div>
      </div>

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Platform</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {mockCashbackRows.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.platform}</td>
                <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.amount)}</td>
                <td>
                  <span className={`badge ${item.status === 'AVAILABLE' || item.status === 'CONFIRMED' ? 'badge-success' : item.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>
                    {item.status}
                  </span>
                </td>
                <td>{item.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
