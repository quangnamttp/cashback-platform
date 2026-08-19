'use client';

import { AppShell } from '../components/layout/AppShell';
import { useLanguage } from '../lib/i18n';
import { mockCoupons, mockPlatforms } from '../lib/mock-data';

const platformMeta: Record<string, { emoji: string; cashback: string }> = {
  Shopee: { emoji: '🛍', cashback: 'Up to 4%' },
  Lazada: { emoji: '🟧', cashback: 'Up to 5%' },
  'TikTok Shop': { emoji: '🎵', cashback: 'Up to 3%' },
};

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <section className="hero">
        <h1>{t('hero_title')}</h1>
        <p className="hero-highlight">{t('hero_highlight')}</p>
        <p className="hero-desc">{t('hero_desc')}</p>

        <div className="hero-search-row">
          <input placeholder={t('hero_placeholder')} />
          <button className="button button-primary">🔗 {t('hero_cta')}</button>
        </div>

        <div className="hero-platform-row">
          {mockPlatforms.map((platform) => (
            <span key={platform.name} className="hero-platform-pill">
              {platformMeta[platform.name]?.emoji} {platform.name}
            </span>
          ))}
        </div>
      </section>

      <section id="stores" className="home-section">
        <div className="section-header">
          <h2>{t('stores_title')}</h2>
        </div>

        <div className="platform-grid">
          {mockPlatforms.map((platform) => {
            const meta = platformMeta[platform.name] ?? { emoji: '🛍', cashback: 'Up to 4%' };
            return (
              <div key={platform.name} className="platform-card">
                <div className="platform-card-emoji">{meta.emoji}</div>
                <h3>{platform.name}</h3>
                <p>{t('stores_cashback_upto')} {meta.cashback.replace('Up to ', '')}</p>
                <button className="button button-secondary">{t('stores_cta')}</button>
              </div>
            );
          })}
        </div>
        <p className="mock-note">{t('mock_notice')}</p>
      </section>

      <section className="home-section">
        <div className="section-header">
          <h2>{t('offers_title')}</h2>
        </div>

        <div className="coupon-grid">
          {mockCoupons.map((coupon) => (
            <div key={coupon.code} className="coupon-card">
              <div className="coupon-meta">{coupon.marketplace}</div>
              <h3>{coupon.discount}</h3>
              <p className="coupon-code">{coupon.code}</p>
              <small>{t('offer_min_order')}: {coupon.minOrder}</small>
              <div className="coupon-footer">
                <span className={`status-pill${coupon.status === 'Ending soon' ? ' warning' : ''}`}>{coupon.status}</span>
                <button className="button button-secondary coupon-btn">{t('offer_get_code')}</button>
              </div>
            </div>
          ))}
        </div>
        <p className="mock-note">{t('mock_notice')}</p>
      </section>
    </AppShell>
  );
}
