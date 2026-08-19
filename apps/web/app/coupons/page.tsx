'use client';

import { AppShell } from '../../components/layout/AppShell';
import { CopyCodeButton } from '../../components/ui/CopyCodeButton';
import { useLanguage } from '../../lib/i18n';
import { mockCoupons } from '../../lib/mock-data';

export default function CouponsPage() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('nav_coupons')}</span>
            <h1>{t('offers_title')}</h1>
          </div>
        </div>

        <section className="coupon-grid">
          {mockCoupons.map((coupon) => (
            <div key={coupon.code} className="coupon-card">
              <div className="coupon-meta">{coupon.marketplace}</div>
              <h3>{coupon.discount}</h3>
              <p className="coupon-code">{coupon.code}</p>
              <ul className="coupon-details">
                <li>{t('offer_min_order')}: {coupon.minOrder}</li>
                <li>{t('offer_expiry')}: {coupon.expiry}</li>
              </ul>
              <div className="coupon-footer">
                <span className={`status-pill${coupon.status === 'Ending soon' ? ' warning' : ''}`}>{coupon.status}</span>
                <CopyCodeButton code={coupon.code} label={t('offer_get_code')} />
              </div>
            </div>
          ))}
        </section>

        <p className="mock-note">{t('mock_notice')}</p>
      </div>
    </AppShell>
  );
}
