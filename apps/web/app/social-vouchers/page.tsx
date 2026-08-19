'use client';

import { AppShell } from '../../components/layout/AppShell';
import { CopyCodeButton } from '../../components/ui/CopyCodeButton';
import { useLanguage } from '../../lib/i18n';
import { mockSocialVouchers } from '../../lib/mock-data';

export default function SocialVouchersPage() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('sidebar_social_vouchers')}</span>
            <h1>{t('sidebar_social_vouchers')}</h1>
          </div>
        </div>

        <section className="social-grid">
          {mockSocialVouchers.map((voucher) => (
            <div key={`${voucher.platform}-${voucher.title}`} className="social-card">
              <div className="social-platform">{voucher.platform}</div>
              <h3>{voucher.title}</h3>
              <p>{voucher.discount}</p>
              <ul className="coupon-details">
                <li>{voucher.condition}</li>
                <li>{t('offer_expiry')}: {voucher.expiry}</li>
              </ul>
              <p className="coupon-code">{voucher.code}</p>
              <div className="coupon-footer">
                <span className="status-pill">{voucher.status}</span>
                <CopyCodeButton code={voucher.code} label={t('offer_get_code')} />
              </div>
            </div>
          ))}
        </section>

        <p className="mock-note">{t('mock_notice')}</p>
      </div>
    </AppShell>
  );
}
