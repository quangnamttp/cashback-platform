'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const adminNavItems = [
  { icon: '📊', label: 'Tổng quan', href: '/admin' },
  { icon: '👥', label: 'Người dùng', href: '/admin/users' },
  { icon: '📦', label: 'Đơn hàng', href: '/admin/orders' },
  { icon: '💰', label: 'Cashback / Hoa hồng', href: '/admin/cashback' },
  { icon: '🏪', label: 'Affiliate', href: '/admin/affiliate' },
  { icon: '🎟', label: 'Coupon', href: '/admin/coupons' },
  { icon: '📱', label: 'Voucher MXH', href: '/admin/social-vouchers' },
  { icon: '💸', label: 'Rút tiền', href: '/admin/withdrawals' },
  { icon: '👥', label: 'Giới thiệu', href: '/admin/referrals' },
  { icon: '⚠️', label: 'Fraud / Risk', href: '/admin/fraud' },
  { icon: '⚙️', label: 'Cấu hình', href: '/admin/settings' },
  { icon: '📜', label: 'Logs', href: '/admin/logs' },
];

function isActive(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="admin-page-shell container">
      <aside className="admin-sidebar panel">
        <Link href="/admin" className="brand-block compact">
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
              <span className="admin-nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
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
