import Link from 'next/link';

const navItems = [
  { label: 'Home', href: '/' },
  { label: 'Get Cashback Link', href: '/get-cashback-link' },
  { label: 'Coupons', href: '/coupons' },
  { label: 'Deals / Flash Sales', href: '/deals' },
  { label: 'Social Media Vouchers', href: '/social-vouchers' },
  { label: 'Orders', href: '/orders' },
  { label: 'Cashback Wallet', href: '/cashback-wallet' },
  { label: 'Refer Friends', href: '/referrals' },
  { label: 'Account', href: '/account' },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <div className="brand-block">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">Cashback Platform</div>
            <div className="brand-subtitle">Smart affiliate savings</div>
          </div>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href}>{item.label}</Link>
          ))}
        </nav>

        <div className="header-actions">
          <button className="button button-ghost">Google Login</button>
          <button className="button button-primary">Sign up</button>
        </div>
      </div>
    </header>
  );
}
