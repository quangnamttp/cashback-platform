'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage, type DictKey } from '../../lib/i18n';
import { HomeIcon, LinkIcon, WalletIcon, BoxIcon, ReceiptIcon, UsersIcon, HeadsetIcon, GearIcon } from '../ui/Icons';

type SidebarItem = {
  icon: React.ReactNode;
  color: string;
  labelKey: DictKey;
  href: string;
};

const topItems: SidebarItem[] = [
  { icon: <HomeIcon size={16} />, color: '#0096ff', labelKey: 'sidebar_home', href: '/' },
  { icon: <LinkIcon size={16} />, color: '#38bdf8', labelKey: 'sidebar_get_link', href: '/get-cashback-link' },
];

const bottomItems: SidebarItem[] = [
  { icon: <WalletIcon size={16} />, color: '#16a34a', labelKey: 'sidebar_wallet', href: '/cashback-wallet' },
  { icon: <BoxIcon size={16} />, color: '#f59e0b', labelKey: 'sidebar_orders', href: '/orders' },
  { icon: <ReceiptIcon size={16} />, color: '#8b5cf6', labelKey: 'sidebar_order_status', href: '/cashback' },
  { icon: <UsersIcon size={16} />, color: '#6366f1', labelKey: 'sidebar_referrals', href: '/referrals' },
  { icon: <HeadsetIcon size={16} />, color: '#0ea5e9', labelKey: 'sidebar_support', href: '/support' },
  { icon: <GearIcon size={16} />, color: '#64748b', labelKey: 'sidebar_settings', href: '/settings' },
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
            <span className="sidebar-icon-tile" style={{ background: item.color }} aria-hidden="true">{item.icon}</span>
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
            <span className="sidebar-icon-tile" style={{ background: item.color }} aria-hidden="true">{item.icon}</span>
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
