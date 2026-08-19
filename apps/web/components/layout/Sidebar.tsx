'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage, type DictKey } from '../../lib/i18n';

type SidebarItem = {
  icon: string;
  labelKey: DictKey;
  href: string;
};

const topItems: SidebarItem[] = [
  { icon: '🏠', labelKey: 'sidebar_home', href: '/' },
  { icon: '🏪', labelKey: 'sidebar_stores', href: '/#stores' },
  { icon: '🎟', labelKey: 'sidebar_coupons', href: '/coupons' },
  { icon: '🔥', labelKey: 'sidebar_deals', href: '/deals' },
  { icon: '🔗', labelKey: 'sidebar_get_link', href: '/get-cashback-link' },
];

const bottomItems: SidebarItem[] = [
  { icon: '💰', labelKey: 'sidebar_wallet', href: '/cashback-wallet' },
  { icon: '📦', labelKey: 'sidebar_orders', href: '/orders' },
  { icon: '📋', labelKey: 'sidebar_order_status', href: '/cashback' },
  { icon: '🎟', labelKey: 'sidebar_my_vouchers', href: '/coupons' },
  { icon: '📱', labelKey: 'sidebar_social_vouchers', href: '/social-vouchers' },
  { icon: '👥', labelKey: 'sidebar_referrals', href: '/referrals' },
  { icon: '💸', labelKey: 'sidebar_withdraw_history', href: '/cashback-wallet' },
  { icon: '❓', labelKey: 'sidebar_support', href: '/account' },
  { icon: '⚙', labelKey: 'sidebar_settings', href: '/account' },
];

function isActive(pathname: string, href: string) {
  const cleanHref = href.split('#')[0] || '/';
  if (cleanHref === '/') return pathname === '/';
  return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <nav className="sidebar-nav" aria-label="Primary">
      <div className="sidebar-group">
        {topItems.map((item) => (
          <Link
            key={item.labelKey}
            href={item.href}
            onClick={onNavigate}
            className={`sidebar-link${isActive(pathname, item.href) ? ' active' : ''}`}
          >
            <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
            <span>{t(item.labelKey)}</span>
          </Link>
        ))}
      </div>

      <div className="sidebar-divider" />

      <div className="sidebar-group">
        {bottomItems.map((item) => (
          <Link
            key={item.labelKey}
            href={item.href}
            onClick={onNavigate}
            className={`sidebar-link${isActive(pathname, item.href) ? ' active' : ''}`}
          >
            <span className="sidebar-icon" aria-hidden="true">{item.icon}</span>
            <span>{t(item.labelKey)}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="app-sidebar">
      <SidebarNav />
    </aside>
  );
}
