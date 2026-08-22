'use client';

import Link from 'next/link';
import { useState } from 'react';
import { mockPlatforms } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { useLanguage } from '../../lib/i18n';

export default function GetCashbackLinkPage() {
  const { t } = useLanguage();
  const [link, setLink] = useState('');

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
    } catch {
      // clipboard access may be blocked; user can paste manually
    }
  };

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <section className="get-link-card">
          <div className="get-link-card-head">
            <div className="promo-icon-badge">🔗</div>
            <div>
              <h1>{t('get_link_title')}</h1>
              <p>{t('get_link_subtitle')}</p>
            </div>
          </div>

          <div className="get-link-platform-grid">
            {mockPlatforms.map((platform) => (
              <span key={platform.name} className="get-link-platform-chip">
                <PlatformBadge name={platform.name} size={22} />
                {platform.name}
              </span>
            ))}
          </div>

          <div className="get-link-input-block">
            <label className="field-label" htmlFor="product-link">{t('paste_label')}</label>
            <div className="get-link-input-row">
              <span className="get-link-input-icon">🔗</span>
              <input
                id="product-link"
                placeholder={t('get_link_input_placeholder')}
                value={link}
                onChange={(event) => setLink(event.target.value)}
              />
              <button type="button" className="get-link-paste-btn" onClick={handlePaste}>📋 {t('get_link_paste')}</button>
            </div>
          </div>

          <button className="button button-primary get-link-cta">✨ {t('get_link_btn')}</button>

          <div className="get-link-helper-row">
            <Link href="/account">▶ {t('get_link_how_to')}</Link>
            <Link href="/account">⚠ {t('get_link_note')}</Link>
          </div>
        </section>

        <div className="get-link-quicklinks">
          <Link href="/social-vouchers" className="quick-utility-item">
            <span>📱</span>{t('sidebar_social_vouchers')}
          </Link>
          <Link href="/get-cashback-link" className="quick-utility-item">
            <span>🕐</span>{t('get_link_history')}
          </Link>
          <Link href="/referrals" className="quick-utility-item">
            <span>👥</span>{t('sidebar_referrals')}
          </Link>
        </div>

        <section className="two-column-grid">
          <div className="panel">
            <h3>{t('how_it_works')}</h3>
            <ol className="ordered-list">
              <li>{t('step1')}</li>
              <li>{t('step2')}</li>
              <li>{t('step3')}</li>
              <li>{t('step4')}</li>
            </ol>
          </div>

          <div className="panel">
            <h3>{t('important_rule')}</h3>
            <p className="muted-copy">{t('important_rule_desc')}</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
