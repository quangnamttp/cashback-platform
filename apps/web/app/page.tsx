'use client';

import Link from 'next/link';
import { AppShell } from '../components/layout/AppShell';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { useLanguage } from '../lib/i18n';
import { mockPlatforms } from '../lib/mock-data';

const MOCK_LOGGED_IN = true;

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <AppShell showRightPanel={false}>
      {/* Promo banner */}
      <section className="promo-banner">
        <div className="promo-banner-text">
          <span className="promo-badge">✓ {t('promo_commit')}</span>
          <h2>{t('promo_title')}</h2>
          <p>{t('promo_desc')}</p>
        </div>
        <div className="promo-platform-strip">
          {mockPlatforms.map((platform) => (
            <span key={platform.name} className="promo-platform-pill">
              <PlatformBadge name={platform.name} size={18} />
              {platform.name}
            </span>
          ))}
        </div>
      </section>

      {/* Balance / welcome card */}
      <section className="welcome-card">
        <span className="promo-badge light">✨ {t('welcome_hi')}</span>

        {MOCK_LOGGED_IN ? (
          <>
            <div className="welcome-balance-row">
              <div>
                <div className="wc-label">{t('panel_balance_title')}</div>
                <div className="wc-value">24.693đ</div>
              </div>
              <div>
                <div className="wc-label">{t('welcome_saved')}</div>
                <div className="wc-value wc-value-secondary">21.218đ</div>
              </div>
            </div>

            <div className="welcome-actions">
              <Link href="/get-cashback-link" className="button button-primary wc-btn">🔗 {t('welcome_create_link')}</Link>
              <Link href="/orders" className="button button-secondary wc-btn">🕐 {t('welcome_order_history')}</Link>
            </div>
          </>
        ) : (
          <p className="rp-login-hint">{t('panel_balance_login_hint')}</p>
        )}
      </section>

      <section className="mini-stats-row">
        <div className="mini-stat-card">
          <span className="mini-stat-icon">🛍️</span>
          <div className="mini-stat-value">40.335đ</div>
          <div className="mini-stat-label">{t('welcome_total_orders')}</div>
        </div>
        <div className="mini-stat-card">
          <span className="mini-stat-icon">⏳</span>
          <div className="mini-stat-value">19.118đ</div>
          <div className="mini-stat-label">{t('panel_pending')}</div>
        </div>
        <div className="mini-stat-card">
          <span className="mini-stat-icon">✅</span>
          <div className="mini-stat-value">21.218đ</div>
          <div className="mini-stat-label">{t('panel_received')}</div>
        </div>
      </section>

      {/* Quick utility icons */}
      <section className="quick-utility-section">
        <div className="section-header">
          <h2>{t('quick_utilities')}</h2>
        </div>
        <div className="quick-utility-grid">
          <Link href="/get-cashback-link" className="quick-utility-item">
            <span>🔗</span>{t('sidebar_get_link')}
          </Link>
          <Link href="/orders" className="quick-utility-item">
            <span>📦</span>{t('sidebar_orders')}
          </Link>
          <Link href="/cashback-wallet" className="quick-utility-item">
            <span>💰</span>{t('sidebar_wallet')}
          </Link>
          <Link href="/social-vouchers" className="quick-utility-item">
            <span>📱</span>{t('sidebar_social_vouchers')}
          </Link>
          <Link href="/referrals" className="quick-utility-item">
            <span>👥</span>{t('sidebar_referrals')}
          </Link>
          <Link href="/account" className="quick-utility-item">
            <span>⚙️</span>{t('sidebar_settings')}
          </Link>
        </div>
      </section>

      {/* Stores */}
      <section id="stores" className="home-section">
        <div className="section-header">
          <h2>{t('stores_title')}</h2>
        </div>
        <div className="platform-grid">
          {mockPlatforms.map((platform) => (
            <div key={platform.name} className="platform-card">
              <PlatformBadge name={platform.name} size={40} />
              <h3>{platform.name}</h3>
              <p>{t('stores_cashback_upto')} {platform.name === 'Lazada' ? '5%' : platform.name === 'TikTok Shop' ? '3%' : '4%'}</p>
              <button className="button button-secondary">{t('stores_cta')}</button>
            </div>
          ))}
        </div>
        <p className="mock-note">{t('mock_notice')}</p>
      </section>

      {/* Process steps */}
      <section className="process-section">
        <div className="section-header">
          <h2>{t('process_title')}</h2>
          <p className="muted-copy">{t('process_desc')}</p>
        </div>

        <div className="process-timeline">
          <div className="process-step">
            <div className="process-icon">🛒</div>
            <div className="process-body">
              <span className="process-step-label">{t('process_step1_label')}</span>
              <h3>{t('process_step1_title')}</h3>
              <span className="process-chip">{t('process_step1_chip')}</span>
              <p>{t('process_step1_desc')}</p>
            </div>
          </div>

          <div className="process-connector" />

          <div className="process-step">
            <div className="process-icon">🔄</div>
            <div className="process-body">
              <span className="process-step-label">{t('process_step2_label')}</span>
              <h3>{t('process_step2_title')}</h3>
              <span className="process-chip warning">{t('process_step2_chip')}</span>
              <p>{t('process_step2_desc')}</p>
            </div>
          </div>

          <div className="process-connector" />

          <div className="process-step">
            <div className="process-icon">💳</div>
            <div className="process-body">
              <span className="process-step-label">{t('process_step3_label')}</span>
              <h3>{t('process_step3_title')}</h3>
              <span className="process-chip">{t('process_step3_chip')}</span>
              <p>{t('process_step3_desc')}</p>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
