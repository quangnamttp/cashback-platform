'use client';

import Link from 'next/link';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';

const MOCK_LOGGED_IN = true;
const MOCK_BALANCE_XU = 20206;

export function RightPanel() {
  const { t, lang } = useLanguage();

  return (
    <aside className="app-right-panel">
      <div className="rp-card rp-balance">
        <div className="rp-card-title">{t('panel_balance_title')}</div>

        {MOCK_LOGGED_IN ? (
          <>
            <div className="rp-balance-value">{MOCK_BALANCE_XU.toLocaleString('vi-VN')} xu</div>
            <div className="rp-balance-sub">≈ {formatCurrency(MOCK_BALANCE_XU, lang)}</div>
            <div className="rp-balance-actions">
              <Link href="/cashback-wallet" className="button button-secondary rp-btn">{t('panel_wallet_btn')}</Link>
              <Link href="/cashback-wallet" className="button button-primary rp-btn">{t('panel_withdraw_btn')}</Link>
            </div>
          </>
        ) : (
          <p className="rp-login-hint">{t('panel_balance_login_hint')}</p>
        )}
      </div>

      <div className="rp-card">
        <div className="rp-card-title">{t('panel_quick_stats')}</div>
        <div className="rp-stat-list">
          <div className="rp-stat-row">
            <span>{t('panel_saved')}</span>
            <strong>{formatCurrency(420000, lang)}</strong>
          </div>
          <div className="rp-stat-row">
            <span>{t('panel_pending')}</span>
            <strong>{formatCurrency(156000, lang)}</strong>
          </div>
          <div className="rp-stat-row">
            <span>{t('panel_received')}</span>
            <strong>{formatCurrency(234000, lang)}</strong>
          </div>
          <div className="rp-stat-row">
            <span>{t('panel_orders')}</span>
            <strong>4</strong>
          </div>
        </div>
      </div>

      <div className="rp-card">
        <div className="rp-card-title">{t('panel_referral_title')}</div>
        <p className="rp-referral-desc">{t('panel_referral_desc')}</p>
        <Link href="/referrals" className="button button-secondary rp-btn-full">{t('panel_referral_btn')}</Link>
      </div>

      <div className="rp-card rp-support">
        <div className="rp-card-title">{t('panel_support_title')}</div>
        <ul className="rp-support-list">
          <li><Link href="/account">{t('panel_faq')}</Link></li>
          <li><Link href="/get-cashback-link">{t('panel_guide')}</Link></li>
          <li><Link href="/account">{t('panel_contact')}</Link></li>
        </ul>
      </div>
    </aside>
  );
}
