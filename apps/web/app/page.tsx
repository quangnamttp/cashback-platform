import Link from 'next/link';
import { SiteFooter } from '../components/layout/SiteFooter';
import { SiteHeader } from '../components/layout/SiteHeader';
import { mockCoupons, mockDeals, mockFlashSales, mockFaq, mockPlatforms, mockSocialVouchers } from '../lib/mock-data';

export default function HomePage() {
  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">BUY → SAVE → GET CASHBACK</span>
            <h1>Paste your Shopee / TikTok Shop / Lazada product link</h1>
            <p>
              We detect the marketplace, process the affiliate/deep link through a marketplace adapter, and help you get a usable shopping link before purchase. Cashback becomes available only after order and commission confirmation.
            </p>

            <div className="hero-cta">
              <input placeholder="Paste your Shopee / TikTok Shop / Lazada product link" />
              <button className="button button-primary">GET CASHBACK LINK</button>
            </div>

            <div className="flow-badges">
              {mockPlatforms.map((platform) => (
                <span key={platform.name} className="platform-pill light" style={{ borderColor: `${platform.accent}55` }}>
                  {platform.name}
                </span>
              ))}
            </div>

            <div className="info-strip">
              <span>Secure checkout</span>
              <span>Order tracking</span>
              <span>Commission confirmation</span>
              <span>Cashback wallet</span>
            </div>
          </div>

          <div className="hero-summary">
            <div className="summary-card">
              <div className="summary-header">
                <span>Eligible cashback</span>
                <span className="badge badge-success">Confirmed only</span>
              </div>
              <div className="summary-value">₫1.68M</div>
              <div className="summary-grid">
                <div>
                  <span>Available</span>
                  <strong>₫890K</strong>
                </div>
                <div>
                  <span>Pending</span>
                  <strong>₫790K</strong>
                </div>
              </div>
              <div className="summary-progress"><span style={{ width: '52%' }} /></div>
              <div className="summary-meta">Cashback is only paid after commission confirmation.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow dark">How it works</span>
            <h2>Simple and transparent product flow.</h2>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <span className="step-badge">01</span>
              <h3>Paste product link</h3>
              <p>User pastes a Shopee, TikTok Shop, or Lazada product URL for marketplace detection.</p>
            </div>
            <div className="feature-card">
              <span className="step-badge">02</span>
              <h3>Generate affiliate link</h3>
              <p>System identifies the source marketplace and processes the link via an adapter-first flow.</p>
            </div>
            <div className="feature-card">
              <span className="step-badge">03</span>
              <h3>Track order and commission</h3>
              <p>Orders and commission details are tracked separately until the status is confirmed.</p>
            </div>
            <div className="feature-card">
              <span className="step-badge">04</span>
              <h3>Cashback becomes available</h3>
              <p>Only confirmed commission becomes eligible cashback, then it appears in the wallet.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section muted-section">
        <div className="container">
          <div className="section-header left-header">
            <span className="eyebrow dark">Current coupons</span>
            <h2>Fresh marketplace offers.</h2>
          </div>

          <div className="coupon-grid">
            {mockCoupons.map((coupon) => (
              <div key={coupon.code} className="coupon-card">
                <div className="coupon-meta">{coupon.marketplace}</div>
                <h3>{coupon.code}</h3>
                <p>{coupon.discount}</p>
                <ul>
                  <li>Min. order: {coupon.minOrder}</li>
                  <li>Status: {coupon.status}</li>
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header left-header">
            <span className="eyebrow dark">Deals / Flash sales</span>
            <h2>Time-based offers and limited windows.</h2>
          </div>

          <div className="deal-grid">
            {mockDeals.map((deal) => (
              <div key={deal.title} className="deal-card">
                <div className="deal-tag">{deal.marketplace}</div>
                <h3>{deal.title}</h3>
                <p>{deal.time}</p>
                <strong>{deal.discount}</strong>
              </div>
            ))}
          </div>

          <div className="flash-sale-grid">
            {mockFlashSales.map((sale) => (
              <div key={sale.marketplace} className="flash-card">
                <span>{sale.marketplace}</span>
                <strong>{sale.window}</strong>
                <small>{sale.label}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section muted-section">
        <div className="container">
          <div className="section-header left-header">
            <span className="eyebrow dark">Social media vouchers</span>
            <h2>Verified sources from creator and brand channels.</h2>
          </div>

          <div className="social-grid">
            {mockSocialVouchers.map((voucher) => (
              <div key={`${voucher.platform}-${voucher.title}`} className="social-card">
                <div className="social-platform">{voucher.platform}</div>
                <h3>{voucher.title}</h3>
                <p>{voucher.discount}</p>
                <small>{voucher.source}</small>
                <span className="status-pill">{voucher.status}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container benefits-layout">
          <div className="info-block">
            <span className="eyebrow dark">Cashback wallet</span>
            <h2>Clear transaction states.</h2>
            <p>
              PENDING, CONFIRMED, AVAILABLE, WITHDRAWN, CANCELLED, REFUNDED, and REJECTED are tracked separately so users understand what is pending versus what is actually payable.
            </p>
            <div className="status-list">
              <span>PENDING</span>
              <span>CONFIRMED</span>
              <span>AVAILABLE</span>
              <span>WITHDRAWN</span>
              <span>CANCELLED</span>
              <span>REFUNDED</span>
              <span>REJECTED</span>
            </div>
            <Link href="/cashback-wallet" className="button button-primary">Open wallet</Link>
          </div>

          <div className="stats-panel">
            <div className="stat-stack">
              <div className="mini-stat">
                <span>Eligible cashback</span>
                <strong>₫890K</strong>
              </div>
              <div className="mini-stat">
                <span>Orders tracked</span>
                <strong>12.4K</strong>
              </div>
              <div className="mini-stat">
                <span>Referral rewards</span>
                <strong>₫120K</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="section muted-section">
        <div className="container">
          <div className="section-header center-header">
            <span className="eyebrow dark">FAQ</span>
            <h2>Questions first-time users ask.</h2>
          </div>

          <div className="faq-list">
            {mockFaq.map((faq) => (
              <details key={faq.question} open>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
