'use client';

import { mockCashbackRows } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';

const statusKeyMap: Record<string, string> = {
  AVAILABLE: 'status_available',
  CONFIRMED: 'status_confirmed',
  PENDING: 'status_pending',
  REJECTED: 'status_rejected',
};

export default function CashbackPage() {
  const { t, lang } = useLanguage();

  return (
    <AppShell>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('cashback_eyebrow')}</span>
            <h1>{t('cashback_title')}</h1>
          </div>
        </div>

        <section className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('tbl_id')}</th>
                  <th>{t('tbl_platform')}</th>
                  <th>{t('tbl_amount')}</th>
                  <th>{t('tbl_status')}</th>
                  <th>{t('tbl_date')}</th>
                </tr>
              </thead>
              <tbody>
                {mockCashbackRows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.platform}</td>
                    <td>{formatCurrency(item.amount, lang)}</td>
                    <td>
                      <span className={`badge ${item.status === 'AVAILABLE' || item.status === 'CONFIRMED' ? 'badge-success' : item.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>
                        {t(statusKeyMap[item.status] as any) || item.status}
                      </span>
                    </td>
                    <td>{item.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
