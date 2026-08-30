'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadSupportChats } from '../../lib/support-chat-store';
import { ChartIcon, UsersIcon, BoxIcon, WalletIcon, StoreIcon, TicketIcon, CashIcon, HeadsetIcon, WarningIcon, GearIcon, ScrollIcon } from '../ui/Icons';

const adminNavItems = [
  { icon: <ChartIcon size={16} />, color: '#0096ff', label: 'Tổng quan', href: '/manager' },
  { icon: <UsersIcon size={16} />, color: '#6366f1', label: 'Người dùng', href: '/manager/users' },
  { icon: <BoxIcon size={16} />, color: '#f59e0b', label: 'Đơn hàng', href: '/manager/orders' },
  { icon: <WalletIcon size={16} />, color: '#16a34a', label: 'Cashback / Hoa hồng', href: '/manager/cashback' },
  { icon: <StoreIcon size={16} />, color: '#ee4d2d', label: 'Affiliate', href: '/manager/affiliate' },
  { icon: <TicketIcon size={16} />, color: '#c13584', label: 'Voucher MXH', href: '/manager/social-vouchers' },
  { icon: <CashIcon size={16} />, color: '#059669', label: 'Rút tiền', href: '/manager/withdrawals' },
  { icon: <UsersIcon size={16} />, color: '#8b5cf6', label: 'Giới thiệu', href: '/manager/referrals' },
  { icon: <HeadsetIcon size={16} />, color: '#0ea5e9', label: 'Hỗ trợ khách hàng', href: '/manager/support-chat' },
  { icon: <WarningIcon size={16} />, color: '#dc2626', label: 'Fraud / Risk', href: '/manager/fraud' },
  { icon: <GearIcon size={16} />, color: '#64748b', label: 'Cấu hình', href: '/manager/settings' },
  { icon: <ScrollIcon size={16} />, color: '#78716c', label: 'Logs', href: '/manager/logs' },
];

function isActive(pathname: string, href: string) {
  if (href === '/manager') return pathname === '/manager';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    setUnreadCount(loadSupportChats().filter((c) => c.unread).length);
  }, [pathname]);

  return (
    <div className="admin-page-shell container">
      <aside className="admin-sidebar panel">
        <Link href="/manager" className="brand-block compact">
          <div className="brand-mark">H</div>
          <div>
            <div className="brand-name">Hoàn Tiền DV</div>
            <div className="brand-subtitle">Admin console</div>
          </div>
        </Link>

        <nav className="admin-nav">
          {adminNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={isActive(pathname, item.href) ? 'active' : ''}
            >
              <span className="sidebar-icon-tile" style={{ background: item.color }} aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.href === '/manager/support-chat' && unreadCount > 0 && (
                <span className="admin-nav-badge">{unreadCount}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <Link href="/" className="text-link">← Về trang người dùng</Link>
        </div>
      </aside>

      <section className="admin-content">{children}</section>
    </div>
  );
}
