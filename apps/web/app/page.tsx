const platforms = ['Shopee', 'TikTok Shop', 'Lazada'];

const metrics = [
  { label: 'Orders tracked', value: '12.4K' },
  { label: 'Active affiliates', value: '3.8K' },
  { label: 'Ready cashback', value: '₫82.2M' },
  { label: 'Fraud signals', value: '2.1%' },
];

const features = [
  { title: 'Link recognition', text: 'Detect marketplace automatically from product URLs and normalize each link before tracking.' },
  { title: 'Affiliate-first flow', text: 'Generate tracking links using adapter-driven flows prepared for official platform integrations.' },
  { title: 'Cashback logic', text: 'Only reward valid confirmed commissions and keep a clear status trail from order to payout.' },
];

const history = [
  { name: 'Laptop gaming', status: 'Confirmed', amount: '₫1,240,000', platform: 'Shopee' },
  { name: 'Smartwatch', status: 'Pending', amount: '₫420,000', platform: 'TikTok Shop' },
  { name: 'Soap kit', status: 'Paid', amount: '₫180,000', platform: 'Lazada' },
];

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <div className="container">
          <nav className="nav">
            <div className="logo">Cashback Platform</div>
            <div className="nav-links">
              <a href="#features">Cách hoạt động</a>
              <a href="#platforms">Sàn hỗ trợ</a>
              <a href="#history">Lịch sử</a>
              <a href="#account">Tài khoản</a>
            </div>
            <button className="secondary-btn">Đăng nhập</button>
          </nav>

          <div className="hero-grid">
            <div>
              <p style={{ textTransform: 'uppercase', letterSpacing: '0.12em', opacity: 0.8 }}>Affiliate cashback</p>
              <h1 style={{ fontSize: '3rem', lineHeight: 1.1, margin: '16px 0' }}>Nhận hoàn tiền từ sản phẩm bạn mua</h1>
              <p style={{ maxWidth: 560, opacity: 0.9 }}>
                Dán link sản phẩm từ Shopee, TikTok Shop hoặc Lazada. Hệ thống nhận diện sàn, chuẩn hóa link và tạo affiliate tracking flow theo adapter chuẩn sẵn cho tích hợp chính thức sau này.
              </p>

              <div className="input-row">
                <input placeholder="Dán link sản phẩm của bạn ở đây..." />
                <button className="primary-btn">Nhận hoàn tiền</button>
              </div>

              <div style={{ marginTop: 18, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {platforms.map((platform) => (
                  <span key={platform} className="platform-pill" style={{ background: 'rgba(255,255,255,0.12)', color: 'white' }}>
                    {platform}
                  </span>
                ))}
              </div>
            </div>

            <div className="hero-card">
              <h3 style={{ marginTop: 0 }}>Tổng quan nhanh</h3>
              <div className="metrics-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="metric" style={{ background: 'rgba(255,255,255,0.08)', color: 'white', borderColor: 'rgba(255,255,255,0.12)' }}>
                  <span>Commission</span>
                  <strong>₫4.2M</strong>
                </div>
                <div className="metric" style={{ background: 'rgba(255,255,255,0.08)', color: 'white', borderColor: 'rgba(255,255,255,0.12)' }}>
                  <span>Cashback</span>
                  <strong>₫1.6M</strong>
                </div>
              </div>
              <div style={{ marginTop: 18, padding: '16px 0 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Pending</span><strong>42%</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><span>Confirmed</span><strong>38%</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Refunded</span><strong>20%</strong></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="features">
        <div className="container">
          <h2 style={{ textAlign: 'center', fontSize: '2.25rem', marginBottom: 24 }}>Cách hoạt động</h2>
          <div className="features-grid">
            {features.map((feature) => (
              <div key={feature.title} className="card">
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="platforms">
        <div className="container">
          <h2 style={{ fontSize: '2.25rem', marginBottom: 20 }}>Sàn hỗ trợ</h2>
          <div className="platform-grid">
            {platforms.map((platform) => (
              <div key={platform} className="card">
                <h3>{platform}</h3>
                <p>Nhận diện link, chuẩn hóa URL và chuẩn bị flow affiliate theo adapter. Dữ liệu được tách biệt với logic payout.</p>
                <span className="platform-pill">Adapter ready</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="history">
        <div className="container">
          <div className="history-grid">
            <div className="panel">
              <h3>Lịch sử cashback</h3>
              {history.map((item) => (
                <div key={item.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}>
                  <div>
                    <strong>{item.name}</strong>
                    <div style={{ fontSize: '0.9rem', color: '#475467' }}>{item.platform}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div>{item.amount}</div>
                    <div style={{ color: '#0f766e', fontWeight: 700 }}>{item.status}</div>
                  </div>
                </div>
              ))}
            </div>

            <aside className="panel" id="account">
              <h3>Tài khoản</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><strong>Người dùng</strong><div>anhquang@example.com</div></div>
                <div><strong>Cashback khả dụng</strong><div>₫1,680,000</div></div>
                <div><strong>Hạng</strong><div>Affiliate Pro</div></div>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="metrics-grid">
            {metrics.map((metric) => (
              <div key={metric.label} className="metric">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
