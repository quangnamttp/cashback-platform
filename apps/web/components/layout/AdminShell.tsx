'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { getFirebaseDb } from '../../lib/firebase';
import { useAuth } from '../../lib/auth';
import { usePwaInstall } from '../../lib/pwaInstall';
import { ChartIcon, UsersIcon, BoxIcon, WalletIcon, StoreIcon, CashIcon, HeadsetIcon, WarningIcon, GearIcon, ScrollIcon, ReceiptIcon, DevicesIcon, UserIcon, DownloadIcon, LogoutIcon } from '../ui/Icons';
import { BrandMark } from '../ui/BrandMark';
import { Modal } from '../ui/Modal';

const adminNavTop = { icon: <ChartIcon size={16} />, color: '#0096ff', label: 'Tổng quan', href: '/manager' };

// Same 14 destinations as before (every href unchanged) — regrouped from
// 7 small (mostly 1-2 item) sections down to 5 more substantial ones, each
// still with a clear name for what it's for — the old finer split (order
// approval / cashback release / money-out / marketing / users / risk /
// system, each its own header) added more header-row overhead than it saved
// in scan time for only ~2 items per group.
const adminNavGroups: { label: string; items: { icon: React.ReactNode; color: string; label: string; href: string }[] }[] = [
  {
    label: '📦 Đơn hàng & Cashback',
    items: [
      { icon: <BoxIcon size={16} />, color: '#f59e0b', label: 'Đơn hàng', href: '/manager/orders' },
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
    label: '🎁 Marketing & người dùng',
    items: [
      { icon: <StoreIcon size={16} />, color: '#ee4d2d', label: 'Tiếp thị liên kết & Voucher', href: '/manager/affiliate' },
      { icon: <UsersIcon size={16} />, color: '#8b5cf6', label: 'Giới thiệu', href: '/manager/referrals' },
      { icon: <UsersIcon size={16} />, color: '#6366f1', label: 'Người dùng', href: '/manager/users' },
      { icon: <HeadsetIcon size={16} />, color: '#0ea5e9', label: 'Hỗ trợ khách hàng', href: '/manager/support-chat' },
    ],
  },
  {
    label: '🛡️ Kiểm soát & hệ thống',
    items: [
      { icon: <WarningIcon size={16} />, color: '#dc2626', label: 'Chống gian lận', href: '/manager/fraud' },
      { icon: <DevicesIcon size={16} />, color: '#2563eb', label: 'Phiên đăng nhập', href: '/manager/devices' },
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
  const { userName, userEmail, avatarUrl, logout } = useAuth();
  const { canInstall, promptInstall } = usePwaInstall();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  useEffect(() => {
    const q = query(collection(getFirebaseDb(), 'supportChats'), where('hasUnreadForAdmin', '==', true));
    const unsubscribe = onSnapshot(q, (snap) => setUnreadCount(snap.size), () => setUnreadCount(0));
    return unsubscribe;
  }, []);

  // Same "Tải về" logic as the customer header (lib/pwaInstall.tsx) —
  // Chrome/Edge get the native install prompt, everything else (mainly
  // iOS Safari, which has no such prompt at all) falls back to the same
  // manual-steps modal.
  const handleInstallClick = async () => {
    setIsAccountMenuOpen(false);
    if (canInstall) {
      await promptInstall();
    } else {
      setShowInstallHelp(true);
    }
  };

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

      <section className="admin-content">
        <div className="admin-topbar">
          <div className="account-menu-container">
            <button
              className="account-menu-button"
              onClick={() => setIsAccountMenuOpen((open) => !open)}
              aria-expanded={isAccountMenuOpen}
              aria-haspopup="menu"
              title="Tài khoản"
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={userName} className="account-menu-button-avatar" />
              ) : (
                <UserIcon size={18} />
              )}
            </button>

            {isAccountMenuOpen && (
              <div className="account-menu-dropdown active account-dropdown-v2" role="menu">
                <div className="account-dropdown-user">
                  <span className="account-dropdown-avatar">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarUrl} alt={userName} />
                    ) : (
                      <UserIcon size={18} />
                    )}
                  </span>
                  <div>
                    <strong>{userName}</strong>
                    <span>{userEmail}</span>
                  </div>
                </div>
                <button role="menuitem" onClick={handleInstallClick}>
                  <DownloadIcon size={16} /> Tải về
                </button>
                <button
                  role="menuitem"
                  className="account-dropdown-logout"
                  onClick={() => {
                    logout();
                    setIsAccountMenuOpen(false);
                  }}
                >
                  <LogoutIcon size={16} /> Đăng xuất
                </button>
              </div>
            )}
          </div>
        </div>
        {children}
      </section>

      <Modal open={showInstallHelp} onClose={() => setShowInstallHelp(false)}>
        <h3 style={{ marginTop: 0 }}>Cài đặt web app</h3>
        {isIOS ? (
          <ol className="ordered-list download-steps">
            <li>Mở menu Chia sẻ (Share) trên Safari.</li>
            <li>Chọn &quot;Thêm vào Màn hình chính&quot; (Add to Home Screen).</li>
            <li>Bấm &quot;Thêm&quot; ở góc trên bên phải.</li>
            <li>Mở lại từ màn hình chính như một app bình thường.</li>
          </ol>
        ) : (
          <p className="muted-copy">
            Trình duyệt này chưa hỗ trợ cài đặt trực tiếp — bạn vẫn có thể dùng web bình thường qua trình duyệt.
          </p>
        )}
      </Modal>
    </div>
  );
}
