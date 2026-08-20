import { AdminShell } from '../../../components/layout/AdminShell';

const rows = [
  { referrer: 'minh.nguyen@gmail.com', referred: 'lan.hoa', purchase: 680000, commission: 34000, status: 'CONFIRMED' },
  { referrer: 'thuylinh@gmail.com', referred: 'thu.mai', purchase: 420000, commission: 0, status: 'PENDING' },
  { referrer: 'bao.tran@example.com', referred: 'bao.tran2', purchase: 930000, commission: 0, status: 'REJECTED' },
];

const statusBadge: Record<string, string> = {
  CONFIRMED: 'badge-success',
  PENDING: 'badge-warning',
  REJECTED: 'badge-danger',
};

export default function AdminReferralsPage() {
  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Giới thiệu</span>
          <h1>Theo dõi giới thiệu bạn bè</h1>
        </div>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Người giới thiệu</th>
                <th>Người được giới thiệu</th>
                <th>Giá trị đơn</th>
                <th>Thưởng</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.referrer}-${row.referred}`}>
                  <td>{row.referrer}</td>
                  <td>{row.referred}</td>
                  <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.purchase)}</td>
                  <td>{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(row.commission)}</td>
                  <td><span className={`badge ${statusBadge[row.status]}`}>{row.status}</span></td>
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
