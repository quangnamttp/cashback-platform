'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '../components/layout/AppShell';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { EventCarousel } from '../components/ui/EventCarousel';
import { useLanguage } from '../lib/i18n';
import { formatCurrency } from '../lib/currency';
import { mockHomeEvents, mockPlatforms } from '../lib/mock-data';

const MOCK_LOGGED_IN = true;

const guideSteps = {
  mobile: [
    { title: 'guide_mobile_step1_title', desc: 'guide_mobile_step1_desc' },
    { title: 'guide_mobile_step2_title', desc: 'guide_mobile_step2_desc' },
    { title: 'guide_mobile_step3_title', desc: 'guide_mobile_step3_desc' },
  ],
  desktop: [
    { title: 'guide_desktop_step1_title', desc: 'guide_desktop_step1_desc' },
    { title: 'guide_desktop_step2_title', desc: 'guide_desktop_step2_desc' },
    { title: 'guide_desktop_step3_title', desc: 'guide_desktop_step3_desc' },
  ],
};

export default function HomePage() {
  const { t, lang } = useLanguage();
  const [guideTab, setGuideTab] = useState<'mobile' | 'desktop'>('mobile');

  return (
    <AppShell showRightPanel={false}>
      {/* Live events carousel — auto-rotating, not a static banner */}
      <EventCarousel events={mockHomeEvents} />

      {/* Balance / welcome card — premium styling */}
      <section className="welcome-card-v2">
        <div className="welcome-card-v2-glow" />
        <div className="welcome-card-v2-head">
          <span className="promo-badge light">✨ {t('welcome_hi')}</span>
          <Link href="/account" className="welcome-card-v2-avatar">👤</Link>
        </div>

        {MOCK_LOGGED_IN ? (
          <>
            <div className="welcome-balance-row-v2">
              <div>
                <div className="wc-label">{t('panel_balance_title')}</div>
                <div className="wc-value-v2">{formatCurrency(24693, lang)}</div>
              </div>
              <div className="wc-divider" />
              <div>
                <div className="wc-label">{t('welcome_saved')}</div>
                <div className="wc-value-v2 secondary">{formatCurrency(21218, lang)}</div>
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
          <div className="mini-stat-value">{formatCurrency(40335, lang)}</div>
          <div className="mini-stat-label">{t('welcome_total_orders')}</div>
        </div>
        <div className="mini-stat-card">
          <span className="mini-stat-icon">⏳</span>
          <div className="mini-stat-value">{formatCurrency(19118, lang)}</div>
          <div className="mini-stat-label">{t('panel_pending')}</div>
        </div>
        <div className="mini-stat-card">
          <span className="mini-stat-icon">✅</span>
          <div className="mini-stat-value">{formatCurrency(21218, lang)}</div>
          <div className="mini-stat-label">{t('panel_received')}</div>
        </div>
      </section>

      {/* Quick utility icons */}
      <section className="quick-utility-section">
        <div className="section-header">
          <h2>{t('quick_utilities')}</h2>
        </div>
        <div className="quick-utility-grid">
          <Link href="/#stores" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#ee4d2d' }}>🛍️</span>
            Shopee
          </Link>
          <Link href="/#stores" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#111827' }}>🎵</span>
            TikTok Shop
          </Link>
          <Link href="/#stores" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#0f146d' }}>🛒</span>
            Lazada
          </Link>
          <Link href="/get-cashback-link" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#0096ff' }}>🔗</span>
            {t('sidebar_get_link')}
          </Link>
          <Link href="/orders" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#f59e0b' }}>📦</span>
            {t('sidebar_orders')}
          </Link>
          <Link href="/cashback-wallet" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#16a34a' }}>💰</span>
            {t('sidebar_wallet')}
          </Link>
          <Link href="/social-vouchers" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#c13584' }}>📱</span>
            {t('sidebar_social_vouchers')}
          </Link>
          <Link href="/referrals" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#8b5cf6' }}>👥</span>
            {t('sidebar_referrals')}
          </Link>
          <Link href="/support" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#0ea5e9' }}>💬</span>
            {t('sidebar_support')}
          </Link>
          <Link href="/#guide" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#ef4444' }}>📖</span>
            {t('guide_title').split(' ').slice(0, 2).join(' ')}
          </Link>
          <Link href="/settings" className="quick-utility-item">
            <span className="quick-utility-icon" style={{ background: '#64748b' }}>⚙️</span>
            {t('sidebar_settings')}
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
              <div className="platform-card-top">
                <PlatformBadge name={platform.name} size={40} />
                <span className="platform-rate-badge">
                  {platform.name === 'Lazada' ? '5%' : platform.name === 'TikTok Shop' ? '3%' : '4%'} {t('stores_cashback_label')}
                </span>
              </div>
              <h3>{platform.name}</h3>
              <p className="platform-card-desc">{platform.description}</p>
              <Link href="/get-cashback-link" className="button button-secondary wide-button">{t('stores_cta')}</Link>
            </div>
          ))}
        </div>
        <p className="mock-note">{t('mock_notice')}</p>
      </section>

      {/* How to get the link — desktop vs mobile */}
      <section id="guide" className="home-section">
        <div className="section-header">
          <h2>{t('guide_title')}</h2>
          <p className="muted-copy">{t('guide_desc')}</p>
        </div>

        <div className="sv-platform-tabs guide-tabs">
          <button className={guideTab === 'mobile' ? 'active' : ''} onClick={() => setGuideTab('mobile')}>
            📱 {t('guide_tab_mobile')}
          </button>
          <button className={guideTab === 'desktop' ? 'active' : ''} onClick={() => setGuideTab('desktop')}>
            💻 {t('guide_tab_desktop')}
          </button>
        </div>

        <div className="guide-steps">
          {guideSteps[guideTab].map((step, i) => (
            <div key={step.title} className="guide-step">
              <div className="guide-step-number">{i + 1}</div>
              <div>
                <h3>{t(step.title as any)}</h3>
                <p>{t(step.desc as any)}</p>
              </div>
            </div>
          ))}
        </div>
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
