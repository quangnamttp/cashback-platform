'use client';

import { mockOrderRows } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';

const statusKeyMap: Record<string, string> = {
  CONFIRMED: 'status_confirmed',
  PENDING: 'status_pending',
  REFUNDED: 'status_rejected',
  CANCELLED: 'status_rejected',
};

export default function OrdersPage() {
  const { t, lang } = useLanguage();

  return (
    <AppShell>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('orders_eyebrow')}</span>
            <h1>{t('orders_title')}</h1>
          </div>
        </div>

        <section className="panel">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('tbl_id')}</th>
                  <th>{t('tbl_product')}</th>
                  <th>{t('tbl_platform')}</th>
                  <th>{t('tbl_date')}</th>
                  <th>{t('tbl_value')}</th>
                  <th>{t('tbl_commission')}</th>
                  <th>{t('tbl_cashback')}</th>
                  <th>{t('tbl_status')}</th>
                </tr>
              </thead>
              <tbody>
                {mockOrderRows.map((item) => (
                  <tr key={item.id}>
                    <td>{item.id}</td>
                    <td>{item.product}</td>
                    <td>{item.platform}</td>
                    <td>{item.date}</td>
                    <td>{formatCurrency(item.value, lang)}</td>
                    <td>{formatCurrency(item.commission, lang)}</td>
                    <td>{formatCurrency(item.cashback, lang)}</td>
                    <td>
                      <span className={`badge ${item.status === 'CONFIRMED' ? 'badge-success' : item.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>
                        {t(statusKeyMap[item.status] as any) || item.status}
                      </span>
                    </td>
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
