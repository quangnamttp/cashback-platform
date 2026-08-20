'use client';

import { mockDeals } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';

export default function DealsPage() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('deals_eyebrow')}</span>
            <h1>{t('deals_title')}</h1>
          </div>
        </div>

        <section className="deal-grid">
          {mockDeals.map((deal) => (
            <div key={deal.title} className="deal-card">
              <div className="deal-tag">{deal.marketplace}</div>
              <h3>{deal.title}</h3>
              <p>{deal.time}</p>
              <strong>{deal.discount}</strong>
            </div>
          ))}
        </section>

        <p className="mock-note">{t('mock_notice')}</p>
      </div>
    </AppShell>
  );
}
