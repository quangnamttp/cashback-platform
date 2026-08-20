import { mockAdminLogs } from '../../../lib/mock-data';
import { AdminShell } from '../../../components/layout/AdminShell';

export default function AdminLogsPage() {
  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Logs</span>
          <h1>Nhật ký hoạt động</h1>
        </div>
      </div>

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã log</th>
                <th>Người thực hiện</th>
                <th>Hành động</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {mockAdminLogs.map((log) => (
                <tr key={log.id}>
                  <td>{log.id}</td>
                  <td>{log.actor}</td>
                  <td>{log.action}</td>
                  <td>{log.time}</td>
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
