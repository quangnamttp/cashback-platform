import { mockSocialVouchers } from '../../lib/mock-data';

export default function SocialVouchersPage() {
  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Social Media Vouchers</span>
          <h1>Creator and brand vouchers</h1>
        </div>
      </div>

      <section className="social-grid">
        {mockSocialVouchers.map((voucher) => (
          <div key={`${voucher.platform}-${voucher.title}`} className="social-card">
            <div className="social-platform">{voucher.platform}</div>
            <h3>{voucher.title}</h3>
            <p>{voucher.discount}</p>
            <small>{voucher.source}</small>
            <span className="status-pill">{voucher.status}</span>
          </div>
        ))}
      </section>
    </main>
  );
}
