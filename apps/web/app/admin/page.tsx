const adminStats = [
  { label: 'Users', value: '1,284' },
  { label: 'Links', value: '2,436' },
  { label: 'Orders', value: '8,910' },
  { label: 'Commissions', value: '₫46.3M' },
  { label: 'Cashback', value: '₫18.7M' },
  { label: 'Fraud', value: '3.2%' },
];

export default function AdminPage() {
  return (
    <main className="container" style={{ padding: '32px 0' }}>
      <div className="admin-grid">
        <aside className="panel">
          <h3>Admin</h3>
          <div style={{ display: 'grid', gap: '12px' }}>
            <a href="#">Dashboard</a>
            <a href="#">Users</a>
            <a href="#">Affiliate platforms</a>
            <a href="#">Products / links</a>
            <a href="#">Orders</a>
            <a href="#">Commissions</a>
            <a href="#">Cashback</a>
            <a href="#">Fraud signals</a>
          </div>
        </aside>

        <section>
          <h1 style={{ marginTop: 0 }}>Dashboard</h1>
          <div className="metrics-grid">
            {adminStats.map((stat) => (
              <div key={stat.label} className="metric">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginTop: 24 }}>
            <h3>Recent fraud signals</h3>
            <ul>
              <li>Duplicate order pattern detected on Shopee</li>
              <li>Abnormal cashback ratio on TikTok Shop</li>
              <li>Self-referral risk flagged for one campaign</li>
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
