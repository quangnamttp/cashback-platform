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
            <h1>Save money when you shop online</h1>
            <p>Get cashback from your favorite stores. Paste a product link and earn cashback on every purchase.</p>

            <div className="hero-cta">
              <input placeholder="https://shopee.vn/..." />
              <button className="button button-primary">🔗 Nhận hoàn tiền</button>
            </div>

            <div style={{ marginTop: '20px' }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Supported stores:</span>
              <div className="flow-badges">
                {mockPlatforms.map((platform) => (
                  <span key={platform.name} className="platform-pill light" style={{ borderColor: `${platform.accent}55` }}>
                    {platform.name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="hero-summary">
            <div className="summary-card">
              <div className="summary-header">
                <span>Your cashback</span>
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
              <div className="summary-meta">Paid after order confirmation</div>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="stores">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow dark">Popular stores</span>
            <h2>Shop and earn cashback</h2>
          </div>

          <div className="platform-grid">
            {mockPlatforms.map((platform, idx) => {
              const emojis = ['🛍️', '🎵', '📦'];
              const cashbacks = ['Up to 4%', 'Up to 3%', 'Up to 5%'];
              return (
                <div key={platform.name} className="platform-card">
                  <div style={{ fontSize: '1.5rem' }}>{emojis[idx]}</div>
                  <h3>{platform.name}</h3>
                  <p>{cashbacks[idx]}</p>
                  <button className="button button-secondary" style={{ marginTop: '12px' }}>Shop now</button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow dark">How it works</span>
            <h2>Simple, transparent, and rewarding</h2>
          </div>

          <div className="features-grid">
            <div className="feature-card">
              <span className="step-badge">1</span>
              <h3>Paste link</h3>
              <p>Share your product link from Shopee, TikTok Shop, or Lazada.</p>
            </div>
            <div className="feature-card">
              <span className="step-badge">2</span>
              <h3>Get cashback link</h3>
              <p>We generate an affiliate link to track your purchase.</p>
            </div>
            <div className="feature-card">
              <span className="step-badge">3</span>
              <h3>Shop and buy</h3>
              <p>Click and complete your purchase on the marketplace.</p>
            </div>
            <div className="feature-card">
              <span className="step-badge">4</span>
              <h3>Get cashback</h3>
              <p>Cashback is credited to your wallet after confirmation.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow dark">Featured offers</span>
            <h2>Current marketplace deals</h2>
          </div>

          <div className="coupon-grid">
            {mockCoupons.slice(0, 3).map((coupon) => (
              <div key={coupon.code} className="coupon-card">
                <div className="coupon-meta">{coupon.marketplace}</div>
                <h3>{coupon.discount}</h3>
                <p>{coupon.code}</p>
                <small>Min. order: {coupon.minOrder}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow dark">Flash sales</span>
            <h2>Limited-time offers</h2>
          </div>

          <div className="deal-grid">
            {mockDeals.slice(0, 3).map((deal) => (
              <div key={deal.title} className="deal-card">
                <div className="deal-tag">{deal.marketplace}</div>
                <h3>{deal.title}</h3>
                <small>{deal.time}</small>
                <strong>{deal.discount}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-header center-header">
            <span className="eyebrow dark">Why cashback platform?</span>
            <h2>Trustworthy cashback, every time</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', marginTop: '32px' }}>
            <div className="info-block">
              <h3>✓ Secure</h3>
              <p>Official affiliate links from verified marketplace partners.</p>
            </div>
            <div className="info-block">
              <h3>✓ Transparent</h3>
              <p>Real-time tracking of your orders and cashback status.</p>
            </div>
            <div className="info-block">
              <h3>✓ Fast payouts</h3>
              <p>Quick withdrawal to your bank or e-wallet.</p>
            </div>
            <div className="info-block">
              <h3>✓ Easy to use</h3>
              <p>No complex steps, just paste, buy, and earn.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow dark">Social media vouchers</span>
            <h2>Verified creator and brand offers</h2>
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
        <div className="container">
          <div className="section-header">
            <span className="eyebrow dark">Cashback wallet</span>
            <h2>Clear transaction tracking</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginTop: '24px' }}>
            <div className="info-block">
              <h3>Simple states</h3>
              <p>PENDING, CONFIRMED, AVAILABLE, and WITHDRAWN are tracked separately so you know what&apos;s pending versus what&apos;s payable.</p>
            </div>
            <div className="stats-panel">
              <div className="stat-stack">
                <div className="mini-stat">
                  <span>Available</span>
                  <strong>₫890K</strong>
                </div>
                <div className="mini-stat">
                  <span>Pending</span>
                  <strong>₫790K</strong>
                </div>
                <div className="mini-stat">
                  <span>Withdrawn</span>
                  <strong>₫320K</strong>
                </div>
              </div>
            </div>
          </div>

          <Link href="/cashback-wallet" className="button button-primary" style={{ marginTop: '24px' }}>Open wallet</Link>
        </div>
      </section>

      <section id="faq" className="section section-alt">
        <div className="container">
          <div className="section-header center-header">
            <span className="eyebrow dark">FAQ</span>
            <h2>Common questions</h2>
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
