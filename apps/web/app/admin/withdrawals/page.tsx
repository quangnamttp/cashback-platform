import { mockWithdrawalRequests } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';

const statusBadge: Record<string, string> = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
};

export default function AdminWithdrawalsPage() {
  const pendingCount = mockWithdrawalRequests.filter((row) => row.status === 'PENDING').length;

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Duyệt rút tiền</span>
          <h1>Yêu cầu rút tiền</h1>
        </div>
        <span className="badge badge-warning">{pendingCount} đang chờ duyệt</span>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã yêu cầu</th>
                <th>Người dùng</th>
                <th>Số tiền</th>
                <th>Phương thức</th>
                <th>Ngày yêu cầu</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {mockWithdrawalRequests.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.user}</td>
                  <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.amount)}</td>
                  <td>{row.method}</td>
                  <td>{row.requestedAt}</td>
                  <td><span className={`badge ${statusBadge[row.status]}`}>{row.status}</span></td>
                  <td>
                    {row.status === 'PENDING' ? (
                      <div className="admin-action-row">
                        <button className="btn-approve">Duyệt</button>
                        <button className="btn-reject">Từ chối</button>
                      </div>
                    ) : (
                      <span className="muted-copy">Đã xử lý</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock) — thao tác Duyệt/Từ chối chưa nối logic backend thật, chỉ là giao diện.</p>
    </AdminShell>
  );
}
