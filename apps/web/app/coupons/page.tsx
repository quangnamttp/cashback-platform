import { mockCoupons } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';

export default function CouponsPage() {
  return (
    <AppShell>
    <div className="page-shell">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Coupons</span>
          <h1>Marketplace vouchers</h1>
        </div>
      </div>

      <section className="coupon-grid">
        {mockCoupons.map((coupon) => (
          <div key={coupon.code} className="coupon-card">
            <div className="coupon-meta">{coupon.marketplace}</div>
            <h3>{coupon.code}</h3>
            <p>{coupon.discount}</p>
            <ul>
              <li>Min order: {coupon.minOrder}</li>
              <li>Status: {coupon.status}</li>
            </ul>
          </div>
        ))}
      </section>
    </div>
    </AppShell>
  );
}
