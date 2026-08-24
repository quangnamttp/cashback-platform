'use client';

import { AppShell } from '../../components/layout/AppShell';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { ShipmentTracker } from '../../components/ui/ShipmentTracker';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { mockCashbackRows } from '../../lib/mock-data';

const statusKeyMap: Record<string, string> = {
  AVAILABLE: 'status_available',
  CONFIRMED: 'status_confirmed',
  PENDING: 'status_pending',
  REJECTED: 'status_rejected',
  WITHDRAWN: 'wallet_withdrawn',
};

const statusPillClass: Record<string, string> = {
  AVAILABLE: 'order-pill success',
  CONFIRMED: 'order-pill success',
  PENDING: 'order-pill warning',
  REJECTED: 'order-pill danger',
  WITHDRAWN: 'order-pill neutral',
};

export default function CashbackPage() {
  const { t, lang } = useLanguage();

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('cashback_eyebrow')}</span>
            <h1>{t('sidebar_order_status')}</h1>
          </div>
        </div>

        <div className="ship-order-list">
          {mockCashbackRows.map((item) => (
            <div key={item.id} className="ship-order-card">
              <div className="order-card-main">
                <PlatformBadge name={item.platform} size={44} />
                <div className="order-card-info">
                  <div className="order-card-tags">
                    <span className="order-card-platform">{item.platform}</span>
                    <span className="order-card-id">#{item.id}</span>
                    <span className="order-card-date">{item.date}</span>
                  </div>
                </div>
                <div className="ship-order-cashback-block">
                  <div className="order-card-cashback">{formatCurrency(item.amount, lang)}</div>
                  <span className={statusPillClass[item.status] ?? 'order-pill'}>
                    ● {t(statusKeyMap[item.status] as any) || item.status}
                  </span>
                </div>
              </div>

              <ShipmentTracker stage={item.shippingStage ?? 0} t={t} />
            </div>
          ))}
        </div>

        <p className="mock-note">{t('mock_notice')}</p>
      </div>
    </AppShell>
  );
}
