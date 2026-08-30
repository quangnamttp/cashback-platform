'use client';

import { AppShell } from '../../components/layout/AppShell';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { ShipmentTracker } from '../../components/ui/ShipmentTracker';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { mockOrderRows } from '../../lib/mock-data';

const shippingStatusKeyMap: Record<number, string> = {
  0: 'ship_stage_ordered',
  1: 'ship_stage_preparing',
  2: 'ship_stage_shipping',
  3: 'ship_stage_delivered',
};

const shippingStatusPillClass: Record<number, string> = {
  0: 'order-pill warning',
  1: 'order-pill warning',
  2: 'order-pill warning',
  3: 'order-pill success',
};

export default function CashbackPage() {
  const { t, lang } = useLanguage();

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
        <div className="page-shell">
          <div className="page-header">
            <div>
              <span className="eyebrow dark">{t('cashback_eyebrow')}</span>
              <h1>{t('sidebar_order_status')}</h1>
            </div>
          </div>

          <div className="ship-order-list">
            {mockOrderRows.map((item) => {
              const stage = item.shippingStage ?? 0;
              return (
                <div key={item.id} className="ship-order-card">
                  <div className="order-card-main">
                    <PlatformBadge name={item.platform} size={44} />
                    <div className="order-card-info">
                      <div className="order-card-tags">
                        <span className="order-card-platform">{item.platform}</span>
                        <span className="order-card-id">#{item.id}</span>
                        <span className="order-card-date">{item.date}</span>
                      </div>
                      <h3>{item.product}</h3>
                    </div>
                    <div className="ship-order-cashback-block">
                      <div className="order-card-cashback">{formatCurrency(item.cashback, lang)}</div>
                      <span className={shippingStatusPillClass[stage] ?? 'order-pill'}>
                        ● {t(shippingStatusKeyMap[stage] as any)}
                      </span>
                    </div>
                  </div>

                  <ShipmentTracker stage={stage} t={t} />
                </div>
              );
            })}
          </div>

          <p className="mock-note">{t('mock_notice')}</p>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
