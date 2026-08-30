'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '../../lib/i18n';
import { HomeIcon, BoxIcon, LinkIcon, WalletIcon, TicketIcon } from '../ui/Icons';

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();

  return (
    <nav className="mobile-bottom-nav" aria-label="Bottom navigation">
      <Link href="/" className={`mbn-item${isActive(pathname, '/') ? ' active' : ''}`} style={{ ['--mbn-color' as any]: '#0096ff' }}>
        <span className="mbn-icon"><HomeIcon size={18} /></span>
        <span>{t('sidebar_home')}</span>
      </Link>

      <Link href="/orders" className={`mbn-item${isActive(pathname, '/orders') ? ' active' : ''}`} style={{ ['--mbn-color' as any]: '#f59e0b' }}>
        <span className="mbn-icon"><BoxIcon size={18} /></span>
        <span>{t('sidebar_orders')}</span>
      </Link>

      <Link href="/get-cashback-link" className="mbn-item mbn-center">
        <span className="mbn-center-btn"><LinkIcon size={20} /></span>
        <span>{t('sidebar_get_link')}</span>
      </Link>

      <Link href="/cashback-wallet" className={`mbn-item${isActive(pathname, '/cashback-wallet') ? ' active' : ''}`} style={{ ['--mbn-color' as any]: '#16a34a' }}>
        <span className="mbn-icon"><WalletIcon size={18} /></span>
        <span>{t('sidebar_wallet')}</span>
      </Link>

      <Link href="/social-vouchers" className={`mbn-item${isActive(pathname, '/social-vouchers') ? ' active' : ''}`} style={{ ['--mbn-color' as any]: '#c13584' }}>
        <span className="mbn-icon"><TicketIcon size={18} /></span>
        <span>{t('sidebar_social_vouchers')}</span>
      </Link>
    </nav>
  );
}
