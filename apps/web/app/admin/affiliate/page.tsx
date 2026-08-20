import { mockPlatforms } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';

export default function AdminAffiliatePage() {
  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Affiliate</span>
          <h1>Nền tảng affiliate</h1>
        </div>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nền tảng</th>
                <th>Mô tả</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {mockPlatforms.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.description}</td>
                  <td><span className="badge badge-success">ACTIVE</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">Dữ liệu minh họa (mock) — cấu hình API key/affiliate ID thật sẽ triển khai ở phase sau.</p>
    </AdminShell>
  );
}
