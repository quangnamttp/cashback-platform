'use client';

import Link from 'next/link';
import { mockCashbackRows, mockDashboardStats, mockOrderRows } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';

const statusKeyMap: Record<string, string> = {
  CONFIRMED: 'status_confirmed',
  PENDING: 'status_pending',
  REFUNDED: 'status_rejected',
  CANCELLED: 'status_rejected',
};

export default function DashboardPage() {
  const { t, lang } = useLanguage();

  return (
    <AppShell>
      <div className="dashboard-page">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('dashboard_eyebrow')}</span>
            <h1>{t('dashboard_title')}</h1>
          </div>
          <Link href="/orders" className="button button-primary">{t('dashboard_view_orders')}</Link>
        </div>

        <div className="stats-grid">
          {mockDashboardStats.map((stat) => (
            <div key={stat.label} className="stat-card">
              <div className="stat-label">{stat.label}</div>
              <div className="stat-value">{stat.value}</div>
              <div className="stat-delta">{stat.delta}</div>
            </div>
          ))}
        </div>

        <div className="dashboard-panels">
          <section className="panel">
            <div className="panel-header">
              <h3>{t('dashboard_recent_orders')}</h3>
              <Link href="/orders" className="text-link">{t('dashboard_view_all')}</Link>
            </div>

            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('tbl_order')}</th>
                    <th>{t('tbl_product')}</th>
                    <th>{t('tbl_platform')}</th>
                    <th>{t('tbl_cashback')}</th>
                    <th>{t('tbl_status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mockOrderRows.slice(0, 4).map((item) => (
                    <tr key={item.id}>
                      <td>{item.id}</td>
                      <td>{item.product}</td>
                      <td>{item.platform}</td>
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

          <aside className="panel">
            <div className="panel-header">
              <h3>{t('dashboard_upcoming_cashback')}</h3>
              <Link href="/cashback" className="text-link">{t('dashboard_details')}</Link>
            </div>

            <div className="stack-list">
              {mockCashbackRows.slice(0, 4).map((row) => (
                <div key={row.id} className="summary-row">
                  <div>
                    <strong>{row.platform}</strong>
                    <span>{row.date}</span>
                  </div>
                  <div className="amount-box">
                    <strong>{formatCurrency(row.amount, lang)}</strong>
                    <span>{row.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
