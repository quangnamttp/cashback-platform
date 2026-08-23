'use client';

import Link from 'next/link';
import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';

export default function AccountPage() {
  const { t } = useLanguage();

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('account_eyebrow')}</span>
            <h1>{t('account_title')}</h1>
          </div>
        </div>

        <section className="profile-header-card">
          <div className="profile-avatar">👤</div>
          <div className="profile-header-info">
            <h2>Nguyen Minh</h2>
            <span>minh.nguyen@gmail.com</span>
          </div>
          <span className="badge badge-success">{t('active_status')}</span>
        </section>

        <section className="two-column-grid">
          <div className="panel auth-panel">
            <h3>{t('google_login_title')}</h3>
            <p className="muted-copy">{t('google_login_desc')}</p>
            <button className="button button-primary wide-button">{t('continue_google')}</button>
          </div>

          <div className="panel">
            <h3>{t('user_profile')}</h3>
            <div className="profile-grid">
              <div><span className="field-label">{t('field_name')}</span><strong>Nguyen Minh</strong></div>
              <div><span className="field-label">{t('field_email')}</span><strong>minh.nguyen@gmail.com</strong></div>
              <div><span className="field-label">{t('field_referral_code')}</span><strong>REF-MINH-2026</strong></div>
              <div><span className="field-label">{t('field_account_status')}</span><strong>{t('active_status')}</strong></div>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>{t('referral_foundation')}</h3>
            <Link href="/referrals" className="text-link">{t('view_referrals')}</Link>
          </div>
          <p className="muted-copy">{t('referral_foundation_desc')}</p>
        </section>
      </div>
    </AppShell>
  );
}
