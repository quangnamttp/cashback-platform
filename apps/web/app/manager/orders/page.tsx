'use client';

import { mockOrderRows } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';
import { usePageTitle } from '../../../lib/use-page-title';

const statusBadge: Record<string, string> = {
  CONFIRMED: 'badge-success',
  PENDING: 'badge-warning',
  REFUNDED: 'badge-danger',
  CANCELLED: 'badge-danger',
};

export default function AdminOrdersPage() {
  usePageTitle('Tất cả đơn hàng');
  const { lang } = useLanguage();

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
                  <td>{formatCurrency(item.value, lang)}</td>
                  <td>{formatCurrency(item.commission, lang)}</td>
                  <td>{formatCurrency(item.cashback, lang)}</td>
                  <td><span className={`badge ${statusBadge[item.status] ?? 'badge-neutral'}`}>{item.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock).</p>
    </AdminShell>
  );
}
