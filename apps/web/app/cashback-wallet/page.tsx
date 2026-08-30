'use client';

import { useMemo, useState } from 'react';
import { mockWithdrawalHistory, bankList } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';
import { Modal } from '../../components/ui/Modal';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { RequireAuth } from '../../components/layout/RequireAuth';

const MIN_WITHDRAW = 20000;

const wdStatusKeyMap: Record<string, string> = {
  DONE: 'wd_status_done',
  PENDING: 'wd_status_pending',
  CANCELLED: 'wd_status_cancelled',
};

const wdStatusPillClass: Record<string, string> = {
  DONE: 'order-pill success',
  PENDING: 'order-pill warning',
  CANCELLED: 'order-pill danger',
};

const filterTabs = [
  { key: 'all', labelKey: 'wd_filter_all' },
  { key: 'PENDING', labelKey: 'wd_filter_pending' },
  { key: 'DONE', labelKey: 'wd_filter_done' },
  { key: 'CANCELLED', labelKey: 'wd_filter_cancelled' },
];

type BankAccount = { id: string; bank: string; accountNumber: string; accountHolder: string };

export default function CashbackWalletPage() {
  const { t, lang } = useLanguage();

  // Bank accounts (mock, starts empty)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBank, setNewBank] = useState(bankList[0]);
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newAccHolder, setNewAccHolder] = useState('');

  // Withdraw request
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // History
  const [filter, setFilter] = useState('all');
  const [activeItem, setActiveItem] = useState<(typeof mockWithdrawalHistory)[number] | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    if (filter === 'all') return mockWithdrawalHistory;
    return mockWithdrawalHistory.filter((row) => row.status === filter);
  }, [filter]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const amountNum = Number(amount.replace(/\D/g, '')) || 0;
  const isValidAmount = amountNum >= MIN_WITHDRAW;

  const handleAddBank = () => {
    if (!newAccNumber || !newAccHolder) return;
    const acc: BankAccount = {
      id: `${Date.now()}`,
      bank: newBank,
      accountNumber: newAccNumber,
      accountHolder: newAccHolder.toUpperCase(),
    };
    setBankAccounts((prev) => [...prev, acc]);
    setSelectedAccountId(acc.id);
    setNewAccNumber('');
    setNewAccHolder('');
    setShowAddBank(false);
  };

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
      <div className="page-shell">
        {/* Premium wallet hero card */}
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

        <div className="wd-notice">
          ⚠️ {t('wd_notice_title')}
          <p>{t('wd_notice_desc').replace('{min}', formatCurrency(MIN_WITHDRAW, lang))}</p>
        </div>

        <div className="two-column-grid">
          {/* Withdraw request form */}
          <section className="panel">
            <div className="wd-form-header">
              <span className="promo-icon-badge" style={{ background: '#dcfce7', color: '#15803d' }}>⬇️</span>
              <div>
                <h3>{t('wd_create_title')}</h3>
                <p className="muted-copy">{t('wd_create_min').replace('{min}', formatCurrency(MIN_WITHDRAW, lang))}</p>
              </div>
            </div>

            <label className="field-label" htmlFor="wd-amount">{t('wd_amount_label')}</label>
            <div className="get-link-input-row" style={{ marginTop: 6 }}>
              <span className="get-link-input-icon">💵</span>
              <input
                id="wd-amount"
                inputMode="numeric"
                placeholder={t('wd_amount_placeholder')}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            {amount && !isValidAmount && (
              <p className="admin-gate-error" style={{ marginTop: 6 }}>{t('wd_min_error').replace('{min}', formatCurrency(MIN_WITHDRAW, lang))}</p>
            )}

            <label className="field-label" style={{ marginTop: 16, display: 'block' }}>{t('bank_accounts_title')}</label>
            {bankAccounts.length > 0 ? (
              <select
                className="admin-search-input"
                style={{ width: '100%', marginTop: 6 }}
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
              >
                {bankAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.bank} · {acc.accountNumber} · {acc.accountHolder}
                  </option>
                ))}
              </select>
            ) : (
              <p className="muted-copy" style={{ marginTop: 6, fontSize: '0.82rem' }}>{t('bank_accounts_empty')}</p>
            )}
            <button type="button" className="text-link" style={{ marginTop: 8 }} onClick={() => setShowAddBank((v) => !v)}>
              ➕ {t('bank_accounts_add')}
            </button>

            {showAddBank && (
              <div className="bank-add-form" style={{ marginTop: 12 }}>
                <label>
                  <span className="field-label">{t('bank_field_bank_name')}</span>
                  <select className="admin-search-input" style={{ width: '100%' }} value={newBank} onChange={(e) => setNewBank(e.target.value)}>
                    {bankList.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="field-label">{t('bank_field_account_number')}</span>
                  <input placeholder="0123456789" value={newAccNumber} onChange={(e) => setNewAccNumber(e.target.value)} />
                </label>
                <label>
                  <span className="field-label">{t('bank_field_account_holder')}</span>
                  <input placeholder="NGUYEN VAN A" value={newAccHolder} onChange={(e) => setNewAccHolder(e.target.value)} />
                </label>
                <p className="mock-note">{t('bank_accounts_note')}</p>
                <button type="button" className="button button-primary" onClick={handleAddBank}>{t('bank_accounts_save')}</button>
              </div>
            )}

            <button className="button button-primary get-link-cta" disabled={!isValidAmount || !selectedAccountId}>
              ⬇️ {t('wd_submit_btn')}
            </button>
          </section>

          {/* History */}
          <section className="panel">
            <div className="panel-header">
              <h3>{t('sidebar_withdraw_history')}</h3>
            </div>

            <div className="wd-filter-tabs">
              {filterTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={filter === tab.key ? 'active' : ''}
                  onClick={() => setFilter(tab.key)}
                >
                  {t(tab.labelKey as any)}
                </button>
              ))}
            </div>

            <p className="muted-copy" style={{ marginTop: 10, marginBottom: 4 }}>
              {filtered.length} {t('wd_count_label')}
            </p>

            <div className="wd-history-list">
              {filtered.map((item) => (
                <button key={item.id} className="wd-history-item" onClick={() => setActiveItem(item)}>
                  <div className="wd-history-top">
                    <strong>{formatCurrency(item.amount, lang)}</strong>
                    <span className={wdStatusPillClass[item.status] ?? 'order-pill'}>
                      ● {t(wdStatusKeyMap[item.status] as any) || item.status}
                    </span>
                  </div>
                  <p>{item.bank}</p>
                  <span className="wd-history-meta">{item.accountNumber} · {item.accountHolder}</span>
                  <div className="wd-history-bottom">
                    <span className="modal-code-row-small">{item.id}</span>
                    <span>{t('wd_view_detail')} ›</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <p className="muted-copy">{t('order_empty')}</p>}
            </div>
          </section>
        </div>
      </div>

      <Modal open={!!activeItem} onClose={() => setActiveItem(null)}>
        {activeItem && (
          <>
            <div className="modal-header-row">
              <span className="promo-icon-badge" style={{ width: 40, height: 40 }}>🧾</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{t('wd_detail_title')}</h3>
                <span className="modal-code-row-small">{activeItem.id}</span>
              </div>
            </div>

            <span className={wdStatusPillClass[activeItem.status] ?? 'order-pill'} style={{ marginBottom: 16, display: 'inline-flex' }}>
              ● {t(wdStatusKeyMap[activeItem.status] as any) || activeItem.status}
            </span>

            <div className="modal-field-list">
              <div className="modal-field-row">
                <span>{t('bank_field_bank_name')}</span>
                <span>{activeItem.bank}</span>
              </div>
              <div className="modal-field-row">
                <span>{t('bank_field_account_number')}</span>
                <span>{activeItem.accountNumber}</span>
              </div>
              <div className="modal-field-row">
                <span>{t('bank_field_account_holder')}</span>
                <span>{activeItem.accountHolder}</span>
              </div>
              <div className="modal-field-row">
                <span>{t('wd_amount_label')}</span>
                <span>{formatCurrency(activeItem.amount, lang)}</span>
              </div>
              <div className="modal-field-row">
                <span>{t('wd_created_at')}</span>
                <span>{activeItem.createdAt}</span>
              </div>
              <div className="modal-field-row">
                <span>{t('wd_updated_at')}</span>
                <span>{activeItem.updatedAt}</span>
              </div>
              <div className="modal-field-row">
                <span>{t('wd_code_label')}</span>
                <span className="modal-code-row">
                  {activeItem.id}
                  <button className="modal-copy-icon-btn" onClick={() => copyCode(activeItem.id)} title="Copy">
                    {copied ? '✓' : '📋'}
                  </button>
                </span>
              </div>
            </div>

            <p className="mock-note" style={{ marginTop: 14 }}>{t('wd_support_note')}</p>
          </>
        )}
      </Modal>
    </AppShell>
    </RequireAuth>
  );
}
