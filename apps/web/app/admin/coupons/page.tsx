import { mockCoupons } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';

export default function AdminCouponsPage() {
  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Coupon</span>
          <h1>Quản lý coupon</h1>
        </div>
        <button className="button button-primary">+ Thêm coupon</button>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Sàn</th>
                <th>Mã</th>
                <th>Ưu đãi</th>
                <th>Đơn tối thiểu</th>
                <th>HSD</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {mockCoupons.map((coupon) => (
                <tr key={coupon.code}>
                  <td>{coupon.marketplace}</td>
                  <td>{coupon.code}</td>
                  <td>{coupon.discount}</td>
                  <td>{coupon.minOrder}</td>
                  <td>{coupon.expiry}</td>
                  <td><span className={`badge ${coupon.status === 'Ending soon' ? 'badge-warning' : 'badge-success'}`}>{coupon.status}</span></td>
                  <td>
                    <div className="admin-action-row">
                      <button className="btn-approve">Sửa</button>
                      <button className="btn-reject">Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock) — chưa nối API coupon thật.</p>
    </AdminShell>
  );
}
