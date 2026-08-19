import { mockDeals } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';

export default function DealsPage() {
  return (
    <AppShell>
    <div className="page-shell">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Deals / Flash Sales</span>
          <h1>Time-based shopping deals</h1>
        </div>
      </div>

      <section className="deal-grid">
        {mockDeals.map((deal) => (
          <div key={deal.title} className="deal-card">
            <div className="deal-tag">{deal.marketplace}</div>
            <h3>{deal.title}</h3>
            <p>{deal.time}</p>
            <strong>{deal.discount}</strong>
          </div>
        ))}
      </section>
    </div>
    </AppShell>
  );
}
