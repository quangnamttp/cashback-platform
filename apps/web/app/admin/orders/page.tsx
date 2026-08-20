import { mockOrderRows } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';

const statusBadge: Record<string, string> = {
  CONFIRMED: 'badge-success',
  PENDING: 'badge-warning',
  REFUNDED: 'badge-danger',
  CANCELLED: 'badge-danger',
};

export default function AdminOrdersPage() {
  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Đơn hàng</span>
          <h1>Tất cả đơn hàng</h1>
        </div>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Sản phẩm</th>
                <th>Sàn</th>
                <th>Ngày</th>
                <th>Giá trị</th>
                <th>Hoa hồng</th>
                <th>Hoàn tiền</th>
                <th>Trạng thái</th>
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
                  <td><span className={`badge ${statusBadge[item.status] ?? 'badge-neutral'}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
