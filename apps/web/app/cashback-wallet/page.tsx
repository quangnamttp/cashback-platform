'use client';

import { useState } from 'react';
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

const statusPillClass: Record<string, string> = {
  AVAILABLE: 'order-pill success',
  CONFIRMED: 'order-pill success',
  PENDING: 'order-pill warning',
  REJECTED: 'order-pill danger',
};

export default function CashbackWalletPage() {
  const { t, lang } = useLanguage();
  const [showAddBank, setShowAddBank] = useState(false);

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        {/* Premium wallet hero card, matching homepage style */}
        <section className="welcome-card-v2">
          <div className="welcome-card-v2-glow" />
          <div className="welcome-card-v2-head">
            <span className="promo-badge light">💰 {t('wallet_eyebrow')}</span>
          </div>

          <div className="welcome-balance-row-v2">
            <div>
              <div className="wc-label">{t('wallet_available')}</div>
              <div className="wc-value-v2">{formatCurrency(890000, lang)}</div>
            </div>
            <div className="wc-divider" />
            <div>
              <div className="wc-label">{t('wallet_pending')}</div>
              <div className="wc-value-v2 secondary">{formatCurrency(790000, lang)}</div>
            </div>
          </div>

          <div className="welcome-actions">
            <button className="button button-primary wc-btn">💵 {t('panel_withdraw_btn')}</button>
            <a href="/withdrawal-history" className="button button-secondary wc-btn">🕐 {t('sidebar_withdraw_history')}</a>
          </div>
        </section>

        <section className="mini-stats-row">
          <div className="mini-stat-card">
            <span className="mini-stat-icon">✅</span>
            <div className="mini-stat-value">{formatCurrency(320000, lang)}</div>
            <div className="mini-stat-label">{t('wallet_withdrawn')}</div>
          </div>
          <div className="mini-stat-card">
            <span className="mini-stat-icon">❌</span>
            <div className="mini-stat-value">{formatCurrency(60000, lang)}</div>
            <div className="mini-stat-label">{t('wallet_rejected')}</div>
          </div>
          <div className="mini-stat-card">
            <span className="mini-stat-icon">📦</span>
            <div className="mini-stat-value">4</div>
            <div className="mini-stat-label">{t('panel_orders')}</div>
          </div>
        </section>

        {/* Bank accounts management */}
        <section className="panel">
          <div className="panel-header">
            <h3>{t('bank_accounts_title')}</h3>
          </div>

          <div className="bank-account-empty">
            <span className="promo-icon-badge">🏦</span>
            <p className="muted-copy">{t('bank_accounts_empty')}</p>
            <button className="button button-primary" onClick={() => setShowAddBank((v) => !v)}>
              ➕ {t('bank_accounts_add')}
            </button>
          </div>

          {showAddBank && (
            <div className="bank-add-form">
              <div className="field-group-row">
                <label>
                  <span className="field-label">{t('bank_field_bank_name')}</span>
                  <input placeholder="Vietcombank, Techcombank..." />
                </label>
                <label>
                  <span className="field-label">{t('bank_field_account_number')}</span>
                  <input placeholder="0123456789" />
                </label>
              </div>
              <label>
                <span className="field-label">{t('bank_field_account_holder')}</span>
                <input placeholder="NGUYEN VAN A" />
              </label>
              <p className="mock-note">{t('bank_accounts_note')}</p>
              <button className="button button-primary">{t('bank_accounts_save')}</button>
            </div>
          )}
        </section>

        <section className="panel">
          <h3>{t('wallet_history_title')}</h3>
          <div className="order-card-list" style={{ marginTop: 14 }}>
            {mockCashbackRows.map((item) => (
              <div key={item.id} className="order-card">
                <div className="order-card-main">
                  <div className="promo-icon-badge" style={{ width: 40, height: 40 }}>💰</div>
                  <div className="order-card-info">
                    <div className="order-card-tags">
                      <span className="order-card-platform">{item.platform}</span>
                      <span className="order-card-id">#{item.id}</span>
                    </div>
                  </div>
                </div>
                <div className="order-card-side">
                  <div className="order-card-cashback">{formatCurrency(item.amount, lang)}</div>
                  <span className={statusPillClass[item.status] ?? 'order-pill'}>
                    ● {t(statusKeyMap[item.status] as any) || item.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
