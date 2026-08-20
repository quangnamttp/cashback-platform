'use client';

import { useLanguage } from '../../lib/i18n';

export function SiteFooter() {
  const { t } = useLanguage();

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand-name">Cashback Platform</div>
          <p className="footer-copy">{t('footer_desc')}</p>
        </div>

        <div>
          <h4>{t('footer_explore')}</h4>
          <ul className="footer-links">
            <li>{t('nav_home')}</li>
            <li>{t('footer_how_it_works')}</li>
            <li>{t('footer_supported_platforms')}</li>
          </ul>
        </div>

        <div>
          <h4>{t('footer_support')}</h4>
          <ul className="footer-links">
            <li>{t('panel_faq')}</li>
            <li>{t('footer_contact')}</li>
            <li>{t('footer_policy')}</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
