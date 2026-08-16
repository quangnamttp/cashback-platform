'use client';

import Link from 'next/link';
import { useState } from 'react';

const navItems = [
  { label: 'Home', href: '/' },
  { label: 'Stores', href: '/#stores' },
  { label: 'Coupons', href: '/coupons' },
  { label: 'Deals', href: '/deals' },
];

export function SiteHeader() {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="container header-inner">
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
          <button className="language-selector" title="Language selector">
            🌐 VI ▾
          </button>

          <div className="account-menu-container">
            <button 
              className="account-menu-button"
              onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
              aria-expanded={isAccountMenuOpen}
              aria-haspopup="menu"
            >
              👤 Account
            </button>

            {isAccountMenuOpen && (
              <div className="account-menu-dropdown active" role="menu">
                <Link href="/account" role="menuitem">My Profile</Link>
                <Link href="/orders" role="menuitem">My Orders</Link>
                <Link href="/cashback-wallet" role="menuitem">Cashback Wallet</Link>
                <Link href="/referrals" role="menuitem">Refer Friends</Link>
                <Link href="/social-vouchers" role="menuitem">My Vouchers</Link>
                <Link href="/account" role="menuitem">Settings</Link>
                <div className="account-menu-dropdown-divider"></div>
                <button className="account-menu-dropdown" role="menuitem">Sign out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
