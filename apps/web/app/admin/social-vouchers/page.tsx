import { mockSocialVouchers } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';

export default function AdminSocialVouchersPage() {
  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Voucher MXH</span>
          <h1>Quản lý voucher mạng xã hội</h1>
        </div>
        <button className="button button-primary">+ Thêm voucher</button>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nền tảng</th>
                <th>Nội dung</th>
                <th>Mã</th>
                <th>Điều kiện</th>
                <th>HSD</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {mockSocialVouchers.map((v) => (
                <tr key={v.code}>
                  <td>{v.platform}</td>
                  <td>{v.title} — {v.discount}</td>
                  <td>{v.code}</td>
                  <td>{v.condition}</td>
                  <td>{v.expiry}</td>
                  <td><span className={`badge ${v.status === 'Limited' ? 'badge-warning' : 'badge-success'}`}>{v.status}</span></td>
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

      <p className="mock-note">Dữ liệu minh họa (mock) — chưa nối API voucher MXH thật.</p>
    </AdminShell>
  );
}
