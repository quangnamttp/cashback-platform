'use client';

import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';

const withdrawalHistory = [
  { id: 'WD-3021', method: 'Chuyển khoản ngân hàng', amount: 500000, requestedAt: '19/08/2026', status: 'PENDING' },
  { id: 'WD-3015', method: 'MoMo', amount: 150000, requestedAt: '18/08/2026', status: 'PENDING' },
  { id: 'WD-3002', method: 'Chuyển khoản ngân hàng', amount: 300000, requestedAt: '15/08/2026', status: 'APPROVED' },
  { id: 'WD-2988', method: 'ZaloPay', amount: 200000, requestedAt: '10/08/2026', status: 'REJECTED' },
];

const statusKeyMap: Record<string, string> = {
  PENDING: 'status_pending',
  APPROVED: 'status_confirmed',
  REJECTED: 'status_rejected',
};

const statusPillClass: Record<string, string> = {
  PENDING: 'order-pill warning',
  APPROVED: 'order-pill success',
  REJECTED: 'order-pill danger',
};

export default function WithdrawalHistoryPage() {
  const { t, lang } = useLanguage();

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('sidebar_wallet')}</span>
            <h1>{t('sidebar_withdraw_history')}</h1>
          </div>
        </div>

        <div className="order-card-list">
          {withdrawalHistory.map((item) => (
            <div key={item.id} className="order-card">
              <div className="order-card-main">
                <div className="promo-icon-badge" style={{ width: 44, height: 44 }}>💸</div>
                <div className="order-card-info">
                  <div className="order-card-tags">
                    <span className="order-card-id">#{item.id}</span>
                  </div>
                  <h3>{item.method}</h3>
                </div>
              </div>

              <div className="order-card-side">
                <div className="order-card-cashback">{formatCurrency(item.amount, lang)}</div>
                <span className={statusPillClass[item.status] ?? 'order-pill'}>
                  ● {t(statusKeyMap[item.status] as any) || item.status}
                </span>
                <span className="order-card-date">{item.requestedAt}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="mock-note">{t('mock_notice')}</p>
      </div>
    </AppShell>
  );
}
