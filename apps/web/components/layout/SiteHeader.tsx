'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { LANGS, useLanguage } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { usePwaInstall } from '../../lib/pwaInstall';
import { getFirebaseDb } from '../../lib/firebase';
import { formatCurrency } from '../../lib/currency';
import { BrandMark } from '../ui/BrandMark';
import { Modal } from '../ui/Modal';

type LedgerRow = { id: string; orderId?: string; amount: number; status: string; releasedAt?: { toDate: () => Date } };
type WithdrawalRow = { id: string; amount: number; status: string; decidedAt?: { toDate: () => Date } };

function timeAgo(date: Date): string {
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export function SiteHeader({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { lang, setLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { isLoggedIn, userName, userEmail, avatarUrl, uid, logout } = useAuth();
  const { canInstall, promptInstall } = usePwaInstall();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // beforeinstallprompt only ever exists on Chromium (Chrome/Edge, Android
  // + desktop) — Safari has no such event at all, so iOS users clicking
  // "Tải về" always need the manual Add-to-Home-Screen steps instead.
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  const handleInstallClick = async () => {
    setIsAccountMenuOpen(false);
    if (canInstall) {
      await promptInstall();
    } else {
      setShowInstallHelp(true);
    }
  };

  // Real recent-activity feed — released cashback + paid withdrawals for
  // THIS user, same source data/fields as the wallet page's transaction
  // history (cashbackLedger.releasedAt, withdrawalRequests.decidedAt).
  // Replaces a hardcoded 3-row example array that used to show every user
  // the exact same fake order/withdrawal regardless of their real activity.
  const [recentLedger, setRecentLedger] = useState<LedgerRow[]>([]);
  const [recentWithdrawals, setRecentWithdrawals] = useState<WithdrawalRow[]>([]);

  useEffect(() => {
    if (!uid) {
      setRecentLedger([]);
      setRecentWithdrawals([]);
      return undefined;
    }
    const db = getFirebaseDb();
    const unsubLedger = onSnapshot(
      query(collection(db, 'cashbackLedger'), where('userId', '==', uid)),
      (snap) => setRecentLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerRow))),
    );
    const unsubWithdrawals = onSnapshot(
      query(collection(db, 'withdrawalRequests'), where('userId', '==', uid), orderBy('requestedAt', 'desc')),
      (snap) => setRecentWithdrawals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WithdrawalRow))),
    );
    return () => {
      unsubLedger();
      unsubWithdrawals();
    };
  }, [uid]);

  const notifications = useMemo(() => {
    type Row = { id: string; text: string; time: Date };
    const rows: Row[] = [];
    recentLedger
      .filter((e) => e.status === 'RELEASED' && e.releasedAt)
      .forEach((e) => {
        rows.push({
          id: `ledger-${e.id}`,
          text: `Đơn hàng${e.orderId ? ` ${e.orderId}` : ''} đã được xác nhận hoàn tiền ${formatCurrency(e.amount, lang)}`,
          time: e.releasedAt!.toDate(),
        });
      });
    recentWithdrawals
      .filter((w) => w.status === 'PAID' && w.decidedAt)
      .forEach((w) => {
        rows.push({
          id: `wd-${w.id}`,
          text: `Yêu cầu rút tiền ${formatCurrency(w.amount, lang)} đã hoàn tất`,
          time: w.decidedAt!.toDate(),
        });
      });
    return rows
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 5)
      .map((row) => ({ id: row.id, text: row.text, time: timeAgo(row.time) }));
  }, [recentLedger, recentWithdrawals, lang]);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navItems = [
    { label: t('nav_home'), href: '/' },
    { label: t('nav_stores'), href: '/#stores' },
    { label: t('sidebar_get_link'), href: '/get-cashback-link' },
    { label: t('sidebar_referrals'), href: '/referrals' },
  ];

  const currentLang = LANGS.find((item) => item.code === lang) ?? LANGS[0];

  return (
    <header ref={headerRef} className={`site-header${isScrolled ? ' scrolled' : ''}`}>
      <div className="container header-inner">
        <button className="mobile-menu-btn" onClick={onMenuToggle} aria-label="Menu">
          ☰
        </button>

        <Link href="/" className="brand-block">
          <div className="brand-mark"><BrandMark size={46} /></div>
          <div className="brand-name">Hoàn Tiền DV</div>
        </Link>

        <nav className="main-nav" aria-label="Main navigation">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href}>{item.label}</Link>
          ))}
        </nav>

        <div className="header-actions">
          <Link href="/cashback-wallet" className="icon-btn mobile-wallet-btn" title={t('sidebar_wallet')} aria-label={t('sidebar_wallet')}>
            💰
          </Link>

          <button
            className="icon-btn theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Chuyển sang nền tối' : 'Chuyển sang nền sáng'}
            aria-label="Toggle theme"
          >
            {theme === 'light' ? '🌙' : '☀️'}
          </button>

          <div className="account-menu-container hide-on-mobile">
            <button
              className="language-selector"
              onClick={() => {
                setIsLangMenuOpen((open) => !open);
                setIsAccountMenuOpen(false);
              }}
              title={t('header_language')}
              aria-haspopup="menu"
              aria-expanded={isLangMenuOpen}
            >
              🌐 {currentLang.short} ▾
            </button>

            {isLangMenuOpen && (
              <div className="account-menu-dropdown active lang-dropdown" role="menu">
                {LANGS.map((item) => (
                  <button
                    key={item.code}
                    role="menuitem"
                    className={item.code === lang ? 'lang-option active' : 'lang-option'}
                    onClick={() => {
                      setLang(item.code);
                      setIsLangMenuOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="account-menu-container">
            <button
              className="icon-btn notif-btn"
              onClick={() => {
                setIsNotifOpen((open) => !open);
                setIsAccountMenuOpen(false);
                setIsLangMenuOpen(false);
              }}
              title={t('header_notifications')}
              aria-label={t('header_notifications')}
              aria-haspopup="menu"
              aria-expanded={isNotifOpen}
            >
              🔔
            </button>

            {isNotifOpen && (
              <div className="account-menu-dropdown active notif-dropdown" role="menu">
                <div className="notif-dropdown-title">{t('header_notifications')}</div>
                {notifications.length === 0 ? (
                  <p className="notif-empty">{t('header_notifications_empty')}</p>
                ) : (
                  notifications.map((item) => (
                    <div key={item.id} className="notif-item">
                      <p>{item.text}</p>
                      <span>{item.time}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {isLoggedIn ? (
            <div className="account-menu-container">
              <button
                className="account-menu-button"
                onClick={() => {
                  setIsAccountMenuOpen((open) => !open);
                  setIsLangMenuOpen(false);
                }}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                title={t('header_account')}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt={userName} className="account-menu-button-avatar" />
                ) : (
                  '👤'
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
                        '👤'
                      )}
                    </span>
                    <div>
                      <strong>{userName}</strong>
                      <span>{userEmail}</span>
                    </div>
                  </div>
                  <Link href="/account" role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>
                    👤 {t('account_profile')}
                  </Link>
                  <button role="menuitem" onClick={handleInstallClick}>
                    📲 {t('account_download_app')}
                  </button>
                  <button
                    role="menuitem"
                    className="account-dropdown-logout"
                    onClick={() => {
                      logout();
                      setIsAccountMenuOpen(false);
                    }}
                  >
                    🚪 {t('account_sign_out')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="account-menu-container">
              <button
                className="account-menu-button"
                onClick={() => {
                  setIsAccountMenuOpen((open) => !open);
                  setIsLangMenuOpen(false);
                }}
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                title={t('header_login')}
              >
                👤
              </button>

              {isAccountMenuOpen && (
                <div className="account-menu-dropdown active account-dropdown-v2" role="menu">
                  <Link href="/login" role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>
                    ➡️ {t('header_login')}
                  </Link>
                  <Link href="/login" role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>
                    👤➕ {t('login_register')}
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Modal open={showInstallHelp} onClose={() => setShowInstallHelp(false)}>
        <h3 style={{ marginTop: 0 }}>{t('download_install_title')}</h3>
        {isIOS ? (
          <ol className="ordered-list download-steps">
            <li>{t('download_ios_step1')}</li>
            <li>{t('download_ios_step2')}</li>
            <li>{t('download_ios_step3')}</li>
            <li>{t('download_ios_step4')}</li>
          </ol>
        ) : (
          <p className="muted-copy">{t('download_unsupported_desc')}</p>
        )}
      </Modal>
    </header>
  );
}
