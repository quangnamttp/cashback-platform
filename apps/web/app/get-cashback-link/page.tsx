import Link from 'next/link';
import { mockPlatforms } from '../../lib/mock-data';

export default function GetCashbackLinkPage() {
  return (
    <main className="container page-shell">
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Get Cashback Link</span>
          <h1>Paste a product link</h1>
        </div>
        <Link href="/" className="button button-primary">Back home</Link>
      </div>

      <section className="panel form-panel">
        <label className="field-label" htmlFor="product-link">Paste your Shopee / TikTok Shop / Lazada product link</label>
        <div className="hero-cta compact-cta">
          <input id="product-link" placeholder="https://shopee.vn/..." />
          <button className="button button-primary">GET CASHBACK LINK</button>
        </div>

        <div className="platform-row">
          {mockPlatforms.map((platform) => (
            <span key={platform.name} className="platform-pill light" style={{ borderColor: `${platform.accent}55` }}>
              {platform.name}
            </span>
          ))}
        </div>
      </section>

      <section className="two-column-grid">
        <div className="panel">
          <h3>How the adapter flow works</h3>
          <ol className="ordered-list">
            <li>Detect the marketplace from the URL.</li>
            <li>Validate the link and normalize it.</li>
            <li>Prepare an affiliate or deep-link flow for the platform.</li>
            <li>Track commission and cashback after purchase and confirmation.</li>
          </ol>
        </div>

        <div className="panel">
          <h3>Important rule</h3>
          <p className="muted-copy">
            Cashback is never treated as guaranteed before commission confirmation. Pending commission remains pending until explicitly confirmed by the related order or platform process.
          </p>
        </div>
      </section>
    </main>
  );
}
