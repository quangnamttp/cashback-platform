'use client';

import { AppShell } from '../../components/layout/AppShell';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { mockCashbackRows } from '../../lib/mock-data';

const statusKeyMap: Record<string, string> = {
  AVAILABLE: 'status_available',
  CONFIRMED: 'status_confirmed',
  PENDING: 'status_pending',
  REJECTED: 'status_rejected',
};

const statusPillClass: Record<string, string> = {
  AVAILABLE: 'order-pill success',
  CONFIRMED: 'order-pill success',
  PENDING: 'order-pill warning',
  REJECTED: 'order-pill danger',
};

export default function CashbackPage() {
  const { t, lang } = useLanguage();

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('cashback_eyebrow')}</span>
            <h1>{t('cashback_title')}</h1>
          </div>
        </div>

        <div className="order-card-list">
          {mockCashbackRows.map((item) => (
            <div key={item.id} className="order-card">
              <div className="order-card-main">
                <PlatformBadge name={item.platform} size={44} />
                <div className="order-card-info">
                  <div className="order-card-tags">
                    <span className="order-card-platform">{item.platform}</span>
                    <span className="order-card-id">#{item.id}</span>
                  </div>
                  <h3>{t('cashback_title')}</h3>
                </div>
              </div>

              <div className="order-card-side">
                <div className="order-card-cashback">{formatCurrency(item.amount, lang)}</div>
                <span className={statusPillClass[item.status] ?? 'order-pill'}>
                  ● {t(statusKeyMap[item.status] as any) || item.status}
                </span>
                <span className="order-card-date">{item.date}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
