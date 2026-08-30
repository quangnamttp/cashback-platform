'use client';

import Link from 'next/link';
import { useLanguage } from '../../lib/i18n';

export function SiteFooter() {
  const { t } = useLanguage();

  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand-name">Hoàn Tiền DV</div>
          <p className="footer-copy">{t('footer_desc')}</p>
        </div>

        <div>
          <h4>{t('footer_explore')}</h4>
          <ul className="footer-links">
            <li><Link href="/">{t('nav_home')}</Link></li>
            <li><Link href="/#guide">{t('footer_how_it_works')}</Link></li>
            <li><Link href="/#stores">{t('footer_supported_platforms')}</Link></li>
          </ul>
        </div>

        <div>
          <h4>{t('footer_support')}</h4>
          <ul className="footer-links">
            <li><Link href="/support">{t('panel_faq')}</Link></li>
            <li><Link href="/support">{t('footer_contact')}</Link></li>
            <li><Link href="/support">{t('footer_policy')}</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
