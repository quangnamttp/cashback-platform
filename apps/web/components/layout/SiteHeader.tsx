'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { LANGS, useLanguage } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export function SiteHeader({ onMenuToggle }: { onMenuToggle?: () => void }) {
  const { lang, setLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  const notifications = [
    { id: 1, text: 'Đơn hàng ORD-2401 đã được xác nhận hoàn tiền 93.000đ', time: '2 giờ trước' },
    { id: 2, text: 'Ví của bạn vừa nhận thêm 45.000đ hoàn tiền', time: '5 giờ trước' },
    { id: 3, text: 'Yêu cầu rút tiền ₫300.000 đã hoàn tất', time: '1 ngày trước' },
  ];

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navItems = [
    { label: t('nav_home'), href: '/' },
    { label: t('nav_stores'), href: '/#stores' },
    { label: t('sidebar_social_vouchers'), href: '/social-vouchers' },
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
          <div className="brand-mark">C</div>
          <div className="brand-name">Cashback Platform</div>
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
              className="icon-btn"
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
                {notifications.map((item) => (
                  <div key={item.id} className="notif-item">
                    <p>{item.text}</p>
                    <span>{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

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
              👤
            </button>

            {isAccountMenuOpen && (
              <div className="account-menu-dropdown active" role="menu">
                <Link href="/account" role="menuitem">{t('account_profile')}</Link>
                <Link href="/cashback-wallet" role="menuitem">{t('sidebar_wallet')}</Link>
                <Link href="/orders" role="menuitem">{t('sidebar_orders')}</Link>
                <Link href="/social-vouchers" role="menuitem">{t('sidebar_social_vouchers')}</Link>
                <Link href="/referrals" role="menuitem">{t('sidebar_referrals')}</Link>
                <Link href="/withdrawal-history" role="menuitem">{t('sidebar_withdraw_history')}</Link>
                <Link href="/support" role="menuitem">{t('sidebar_support')}</Link>
                <Link href="/settings" role="menuitem">{t('sidebar_settings')}</Link>
                <div className="account-menu-dropdown-divider" />
                <button role="menuitem">{t('account_sign_out')}</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
