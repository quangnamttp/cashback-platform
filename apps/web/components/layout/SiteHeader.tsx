import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="brand-block">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">Cashback Platform</div>
            <div className="brand-subtitle">Affiliate marketplace</div>
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <Link href="#how-it-works">Cách hoạt động</Link>
          <Link href="#platforms">Sàn hỗ trợ</Link>
          <Link href="#benefits">Lợi ích</Link>
          <Link href="#faq">FAQ</Link>
        </nav>

        <div className="header-actions">
          <button className="button button-ghost">Đăng nhập</button>
          <button className="button button-primary">Đăng ký</button>
        </div>
      </div>
    </header>
  );
}
