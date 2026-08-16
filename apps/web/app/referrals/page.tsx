import { mockCashbackRows } from '../../lib/mock-data';

export default function ReferralsPage() {
  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Refer Friends</span>
          <h1>Referral tracking</h1>
        </div>
      </div>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Referral code</div>
          <div className="stat-value">REF-MINH-2026</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Referred users</div>
          <div className="stat-value">128</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Eligible purchases</div>
          <div className="stat-value">24</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Referral rewards</div>
          <div className="stat-value">₫120K</div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h3>Referral activity</h3>
          <span className="badge badge-warning">Only confirmed rewards</span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Purchase</th>
              <th>Commission</th>
              <th>Status</th>
              <th>Reward</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>lan.hoa</td>
              <td>Beauty kit</td>
              <td>₫680K</td>
              <td><span className="badge badge-success">CONFIRMED</span></td>
              <td>₫34K</td>
            </tr>
            <tr>
              <td>thu.mai</td>
              <td>Speaker</td>
              <td>₫420K</td>
              <td><span className="badge badge-warning">PENDING</span></td>
              <td>₫0</td>
            </tr>
            <tr>
              <td>bao.tran</td>
              <td>Headphone</td>
              <td>₫930K</td>
              <td><span className="badge badge-danger">REJECTED</span></td>
              <td>₫0</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
