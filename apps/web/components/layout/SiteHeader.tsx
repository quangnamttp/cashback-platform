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
  const [isScrolled, setIsScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navItems = [
    { label: t('nav_home'), href: '/' },
    { label: t('nav_stores'), href: '/#stores' },
    { label: t('nav_coupons'), href: '/coupons' },
    { label: t('nav_deals'), href: '/deals' },
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

          <button className="icon-btn" title={t('header_notifications')} aria-label={t('header_notifications')}>
            🔔
          </button>

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
                <Link href="/coupons" role="menuitem">{t('sidebar_my_vouchers')}</Link>
                <Link href="/referrals" role="menuitem">{t('sidebar_referrals')}</Link>
                <Link href="/cashback-wallet" role="menuitem">{t('sidebar_withdraw_history')}</Link>
                <Link href="/account" role="menuitem">{t('sidebar_support')}</Link>
                <Link href="/account" role="menuitem">{t('sidebar_settings')}</Link>
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
