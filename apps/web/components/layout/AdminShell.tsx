'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadSupportChats } from '../../lib/support-chat-store';

const adminNavItems = [
  { icon: '📊', color: '#0096ff', label: 'Tổng quan', href: '/manager' },
  { icon: '👥', color: '#6366f1', label: 'Người dùng', href: '/manager/users' },
  { icon: '📦', color: '#f59e0b', label: 'Đơn hàng', href: '/manager/orders' },
  { icon: '💰', color: '#16a34a', label: 'Cashback / Hoa hồng', href: '/manager/cashback' },
  { icon: '🏪', color: '#ee4d2d', label: 'Affiliate', href: '/manager/affiliate' },
  { icon: '📱', color: '#c13584', label: 'Voucher MXH', href: '/manager/social-vouchers' },
  { icon: '💸', color: '#059669', label: 'Rút tiền', href: '/manager/withdrawals' },
  { icon: '👥', color: '#8b5cf6', label: 'Giới thiệu', href: '/manager/referrals' },
  { icon: '💬', color: '#0ea5e9', label: 'Hỗ trợ khách hàng', href: '/manager/support-chat' },
  { icon: '⚠️', color: '#dc2626', label: 'Fraud / Risk', href: '/manager/fraud' },
  { icon: '⚙️', color: '#64748b', label: 'Cấu hình', href: '/manager/settings' },
  { icon: '📜', color: '#78716c', label: 'Logs', href: '/manager/logs' },
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
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">Cashback Platform</div>
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
