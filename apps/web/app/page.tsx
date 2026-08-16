import Link from 'next/link';
import { SiteFooter } from '../components/layout/SiteFooter';
import { SiteHeader } from '../components/layout/SiteHeader';
import { LinkChecker } from '../components/affiliate/LinkChecker';
import { mockBenefits, mockFaq, mockPlatforms } from '../lib/mock-data';

export default function HomePage() {
  return (
    <main className="landing-page">
      <SiteHeader />

      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Affiliate cashback</span>
            <h1>Nhận cashback từ những link sản phẩm bạn mua.</h1>
            <p>
              Dán link từ Shopee, TikTok Shop hay Lazada. Hệ thống xác định sàn, chuẩn hóa URL và giúp bạn theo dõi commission, cashback và trạng thái giao dịch rõ ràng.
            </p>

            <LinkChecker />

            <div className="platform-row" aria-label="Supported platforms">
              {mockPlatforms.map((platform) => (
                <span key={platform.name} className="platform-pill light" style={{ borderColor: `${platform.accent}55` }}>
                  {platform.name}
                </span>
              ))}
            </div>
          </div>

          <div className="hero-summary">
            <div className="summary-card card-glass">
              <div className="summary-header">
                <span>Cashback khả dụng</span>
                <span className="badge badge-success">+12.5%</span>
              </div>
              <div className="summary-value">₫1.68M</div>
              <div className="summary-grid">
                <div>
                  <span>Đã xác nhận</span>
                  <strong>₫1.02M</strong>
                </div>
                <div>
                  <span>Đang chờ</span>
                  <strong>₫660K</strong>
                </div>
              </div>
              <div className="summary-progress">
                <span style={{ width: '68%' }} />
              </div>
              <div className="summary-meta">68% các giao dịch đang ở trạng thái hợp lệ</div>
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="section">
        <div className="container">
          <div className="section-header">
            <span className="eyebrow dark">Cách hoạt động</span>
            <h2>Luồng đơn giản, rõ ràng, dễ kiểm tra.</h2>
          </div>

          <div className="features-grid">
            {mockBenefits.map((item, index) => (
              <div key={item.title} className="feature-card">
                <span className="step-badge">0{index + 1}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platforms" className="section muted-section">
        <div className="container">
          <div className="section-header left-header">
            <span className="eyebrow dark">Sàn hỗ trợ</span>
            <h2>Chuẩn hóa ngay cho 3 marketplace chính.</h2>
          </div>

          <div className="platform-grid">
            {mockPlatforms.map((platform) => (
              <div key={platform.name} className="platform-card">
                <div className="platform-title-row">
                  <span className="dot" style={{ background: platform.accent }} />
                  <h3>{platform.name}</h3>
                </div>
                <p>{platform.description}</p>
                <span className="platform-pill">Adapter-ready</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="benefits" className="section">
        <div className="container benefits-layout">
          <div className="info-block">
            <span className="eyebrow dark">Tại sao chọn chúng tôi</span>
            <h2>Cashback rõ ràng từ link đến payout.</h2>
            <p>
              Mỗi giao dịch đều có lịch sử trạng thái, từ link nhập, nhận diện sàn, xác nhận commission đến khi cashback được tính và rút. Không có sự mơ hồ trong hành trình của người dùng.
            </p>
            <div className="bullet-list">
              <div>• Theo dõi multi-platform trong một dashboard</div>
              <div>• Tránh spam và order duplicated</div>
              <div>• Dễ mở rộng cho affiliate API thật sau này</div>
            </div>
            <Link href="/dashboard" className="button button-primary">Xem dashboard</Link>
          </div>

          <div className="stats-panel">
            <div className="stat-stack">
              <div className="mini-stat">
                <span>Orders tracked</span>
                <strong>12.4K</strong>
              </div>
              <div className="mini-stat">
                <span>Ready cashback</span>
                <strong>₫82.2M</strong>
              </div>
              <div className="mini-stat">
                <span>Fraud risk</span>
                <strong>2.1%</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="faq" className="section muted-section">
        <div className="container">
          <div className="section-header center-header">
            <span className="eyebrow dark">FAQ</span>
            <h2>Câu hỏi thường gặp.</h2>
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
