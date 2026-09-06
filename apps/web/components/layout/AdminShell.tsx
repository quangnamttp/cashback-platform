'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '../../lib/firebase';
import { ChartIcon, UsersIcon, BoxIcon, WalletIcon, StoreIcon, CashIcon, HeadsetIcon, WarningIcon, GearIcon, ScrollIcon, ReceiptIcon, DevicesIcon } from '../ui/Icons';
import { BrandMark } from '../ui/BrandMark';

const adminNavTop = { icon: <ChartIcon size={16} />, color: '#0096ff', label: 'Tổng quan', href: '/manager' };

// Same 14 destinations as before (every href unchanged) — only grouped
// under section headers for a shorter scan, matching how the pages
// themselves are already grouped by concern (order approval vs cashback
// release vs money-out vs marketing vs risk vs system config).
const adminNavGroups: { label: string; items: { icon: React.ReactNode; color: string; label: string; href: string }[] }[] = [
  {
    label: '📦 Đơn hàng',
    items: [{ icon: <BoxIcon size={16} />, color: '#f59e0b', label: 'Đơn hàng', href: '/manager/orders' }],
  },
  {
    label: '💰 Cashback & hoa hồng',
    items: [
      { icon: <WalletIcon size={16} />, color: '#16a34a', label: 'Cashback / Hoa hồng', href: '/manager/cashback' },
      { icon: <ReceiptIcon size={16} />, color: '#0d9488', label: 'Duyệt hoàn tiền', href: '/manager/payouts' },
    ],
  },
  {
    label: '👛 Ví & tài chính',
    items: [
      { icon: <CashIcon size={16} />, color: '#7c3aed', label: 'Ví tổng Admin', href: '/manager/wallet' },
      { icon: <CashIcon size={16} />, color: '#059669', label: 'Rút tiền', href: '/manager/withdrawals' },
    ],
  },
  {
    label: '🎁 Marketing',
    items: [
      { icon: <StoreIcon size={16} />, color: '#ee4d2d', label: 'Tiếp thị liên kết & Voucher', href: '/manager/affiliate' },
      { icon: <UsersIcon size={16} />, color: '#8b5cf6', label: 'Giới thiệu', href: '/manager/referrals' },
    ],
  },
  {
    label: '👥 Người dùng',
    items: [
      { icon: <UsersIcon size={16} />, color: '#6366f1', label: 'Người dùng', href: '/manager/users' },
      { icon: <HeadsetIcon size={16} />, color: '#0ea5e9', label: 'Hỗ trợ khách hàng', href: '/manager/support-chat' },
    ],
  },
  {
    label: '🛡️ Kiểm soát',
    items: [
      { icon: <WarningIcon size={16} />, color: '#dc2626', label: 'Chống gian lận', href: '/manager/fraud' },
      { icon: <DevicesIcon size={16} />, color: '#2563eb', label: 'Phiên đăng nhập', href: '/manager/devices' },
    ],
  },
  {
    label: '⚙️ Hệ thống',
    items: [
      { icon: <GearIcon size={16} />, color: '#64748b', label: 'Cấu hình', href: '/manager/settings' },
      { icon: <ScrollIcon size={16} />, color: '#78716c', label: 'Nhật ký', href: '/manager/logs' },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/manager') return pathname === '/manager';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const q = query(collection(getFirebaseDb(), 'supportChats'), where('hasUnreadForAdmin', '==', true));
    const unsubscribe = onSnapshot(q, (snap) => setUnreadCount(snap.size), () => setUnreadCount(0));
    return unsubscribe;
  }, []);

  return (
    <div className="admin-page-shell container">
      <aside className="admin-sidebar panel">
        <Link href="/manager" className="brand-block compact">
          <div className="brand-mark"><BrandMark size={36} /></div>
          <div>
            <div className="brand-name">Hoàn Tiền DV</div>
            <div className="brand-subtitle">Bảng điều khiển quản trị</div>
          </div>
        </Link>

        <nav className="admin-nav">
          <Link href={adminNavTop.href} className={isActive(pathname, adminNavTop.href) ? 'active' : ''}>
            <span className="sidebar-icon-tile" style={{ background: adminNavTop.color }} aria-hidden="true">{adminNavTop.icon}</span>
            {adminNavTop.label}
          </Link>

          {adminNavGroups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <div className="admin-nav-group-label">{group.label}</div>
              {group.items.map((item) => (
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
            </div>
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
