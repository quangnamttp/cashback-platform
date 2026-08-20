'use client';

import Link from 'next/link';
import { mockPlatforms } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';

export default function GetCashbackLinkPage() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('get_link_eyebrow')}</span>
            <h1>{t('get_link_title')}</h1>
          </div>
          <Link href="/" className="button button-primary">{t('back_home')}</Link>
        </div>

        <section className="panel form-panel">
          <label className="field-label" htmlFor="product-link">{t('paste_label')}</label>
          <div className="hero-search-row compact-cta">
            <input id="product-link" placeholder="https://shopee.vn/..." />
            <button className="button button-primary">{t('get_link_btn')}</button>
          </div>

          <div className="platform-row">
            {mockPlatforms.map((platform) => (
              <span key={platform.name} className="hero-platform-pill" style={{ borderColor: `${platform.accent}55` }}>
                {platform.name}
              </span>
            ))}
          </div>
        </section>

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
