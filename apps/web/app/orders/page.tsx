import { mockOrderRows } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';

export default function OrdersPage() {
  return (
    <AppShell>
    <div className="page-shell">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Orders</span>
          <h1>Lịch sử đơn hàng</h1>
        </div>
      </div>

      <section className="panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Sản phẩm</th>
              <th>Sàn</th>
              <th>Ngày</th>
              <th>Giá trị</th>
              <th>Commission</th>
              <th>Cashback</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {mockOrderRows.map((item) => (
              <tr key={item.id}>
                <td>{item.id}</td>
                <td>{item.product}</td>
                <td>{item.platform}</td>
                <td>{item.date}</td>
                <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.value)}</td>
                <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(item.commission)}</td>
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
    </div>
    </AppShell>
  );
}
