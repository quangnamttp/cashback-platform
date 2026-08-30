'use client';

import { useMemo, useState } from 'react';
import { mockWithdrawalHistory, mockBalanceLedger, balanceLedgerTypeKeyMap, bankList } from '../../lib/mock-data';
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
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [showManageBankModal, setShowManageBankModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [newBank, setNewBank] = useState('');
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newAccHolder, setNewAccHolder] = useState('');

  // Withdraw request
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // History
  const [filter, setFilter] = useState('all');
  const [activeItem, setActiveItem] = useState<(typeof mockWithdrawalHistory)[number] | null>(null);
  const [copied, setCopied] = useState(false);

  // Ledger search
  const [ledgerQuery, setLedgerQuery] = useState('');

  const filtered = useMemo(() => {
    if (filter === 'all') return mockWithdrawalHistory;
    return mockWithdrawalHistory.filter((row) => row.status === filter);
  }, [filter]);

  const filteredLedger = useMemo(() => {
    if (!ledgerQuery) return mockBalanceLedger;
    return mockBalanceLedger.filter(
      (row) =>
        row.content.toLowerCase().includes(ledgerQuery.toLowerCase()) ||
        row.id.toLowerCase().includes(ledgerQuery.toLowerCase())
    );
  }, [ledgerQuery]);

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
  const selectedAccount = bankAccounts.find((a) => a.id === selectedAccountId);

  const handleAddBank = () => {
    if (!newBank || !newAccNumber || !newAccHolder) return;
    const acc: BankAccount = {
      id: `${Date.now()}`,
      bank: newBank,
      accountNumber: newAccNumber,
      accountHolder: newAccHolder.toUpperCase(),
    };
    setBankAccounts((prev) => [...prev, acc]);
    setSelectedAccountId(acc.id);
    setNewBank('');
    setNewAccNumber('');
    setNewAccHolder('');
    setShowAddBankModal(false);
  };

  const handleDeleteBank = (id: string) => {
    setBankAccounts((prev) => prev.filter((a) => a.id !== id));
    if (selectedAccountId === id) setSelectedAccountId('');
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

            <div className="welcome-actions">
              <button className="button button-primary wc-btn" onClick={() => setShowAddBankModal(true)}>
                ➕ {t('bank_accounts_add_short')}
              </button>
              <button className="button button-secondary wc-btn" onClick={() => setShowManageBankModal(true)}>
                🏦 {t('bank_manage_title')}
              </button>
              <button className="button button-secondary wc-btn" onClick={() => setShowLedgerModal(true)}>
                📖 {t('ledger_title')}
              </button>
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

              <div className="wd-bank-select-header">
                <span className="field-label">{t('wd_receiving_bank')}</span>
                <button type="button" className="text-link" onClick={() => setShowAddBankModal(true)}>➕ {t('bank_accounts_add_short')}</button>
              </div>

              {bankAccounts.length > 0 ? (
                <select
                  className="wd-bank-select"
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  <option value="">{t('wd_choose_account')}</option>
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.accountNumber} | {acc.bank} | {acc.accountHolder}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="wd-bank-select wd-bank-select-empty">🏦 {t('bank_accounts_empty')}</div>
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

              <div className="wd-history-list scrollable-list">
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

        {/* Withdrawal detail modal */}
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

        {/* Add bank account modal */}
        <Modal open={showAddBankModal} onClose={() => setShowAddBankModal(false)}>
          <div className="modal-header-row">
            <span className="promo-icon-badge" style={{ width: 40, height: 40, background: '#dcfce7', color: '#15803d' }}>🏦</span>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('bank_accounts_add')}</h3>
          </div>

          <label className="field-label" style={{ display: 'block', marginTop: 4 }}>{t('bank_field_bank_name')}</label>
          <select className="wd-bank-select" style={{ marginTop: 6 }} value={newBank} onChange={(e) => setNewBank(e.target.value)}>
            <option value="">{t('bank_choose_placeholder')}</option>
            {bankList.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>

          <label className="field-label" style={{ display: 'block', marginTop: 14 }}>{t('bank_field_account_number')}</label>
          <div className="get-link-input-row" style={{ marginTop: 6 }}>
            <span className="get-link-input-icon">💳</span>
            <input placeholder={t('bank_account_number_placeholder')} value={newAccNumber} onChange={(e) => setNewAccNumber(e.target.value)} />
          </div>

          <label className="field-label" style={{ display: 'block', marginTop: 14 }}>{t('bank_field_account_holder')}</label>
          <div className="get-link-input-row" style={{ marginTop: 6 }}>
            <span className="get-link-input-icon">👤</span>
            <input placeholder={t('bank_holder_placeholder')} value={newAccHolder} onChange={(e) => setNewAccHolder(e.target.value)} />
          </div>

          <p className="mock-note" style={{ marginTop: 10 }}>{t('bank_accounts_note')}</p>

          <button
            type="button"
            className="button button-primary modal-cta"
            onClick={handleAddBank}
            disabled={!newBank || !newAccNumber || !newAccHolder}
          >
            ➕ {t('bank_accounts_add')}
          </button>
        </Modal>

        {/* Manage bank accounts modal */}
        <Modal open={showManageBankModal} onClose={() => setShowManageBankModal(false)}>
          <div className="modal-header-row">
            <span className="promo-icon-badge" style={{ width: 40, height: 40, background: '#dcfce7', color: '#15803d' }}>🏦</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('bank_manage_title')}</h3>
              <span className="modal-code-row-small">{t('bank_manage_subtitle')}</span>
            </div>
          </div>

          <button
            type="button"
            className="button button-primary wide-button"
            style={{ marginBottom: 16 }}
            onClick={() => {
              setShowManageBankModal(false);
              setShowAddBankModal(true);
            }}
          >
            ➕ {t('bank_accounts_add')}
          </button>

          {bankAccounts.length === 0 ? (
            <p className="muted-copy">{t('bank_accounts_empty')}</p>
          ) : (
            <div className="bank-manage-list scrollable-list">
              {bankAccounts.map((acc, index) => (
                <div key={acc.id} className="bank-manage-row">
                  <div>
                    <span className="modal-code-row-small">#{index + 1}</span>
                    <strong>{acc.bank}</strong>
                    <span>{acc.accountNumber} · {acc.accountHolder}</span>
                  </div>
                  <button className="btn-reject" onClick={() => handleDeleteBank(acc.id)}>🗑 {t('bank_delete')}</button>
                </div>
              ))}
            </div>
          )}
        </Modal>

        {/* Balance ledger modal */}
        <Modal open={showLedgerModal} onClose={() => setShowLedgerModal(false)}>
          <div className="modal-header-row">
            <span className="promo-icon-badge" style={{ width: 40, height: 40, background: '#dcfce7', color: '#15803d' }}>📖</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{t('ledger_title')}</h3>
              <span className="modal-code-row-small">{t('ledger_subtitle')}</span>
            </div>
          </div>

          <input
            className="admin-search-input"
            style={{ width: '100%', margin: '14px 0' }}
            placeholder={t('ledger_search_placeholder')}
            value={ledgerQuery}
            onChange={(e) => setLedgerQuery(e.target.value)}
          />

          <div className="ledger-list scrollable-list">
            {filteredLedger.map((row) => (
              <div key={row.id} className="ledger-row">
                <div className="ledger-row-top">
                  <span className={`ledger-type-badge ${row.type.toLowerCase()}`}>
                    {t(balanceLedgerTypeKeyMap[row.type] as any)}
                  </span>
                  <span className={row.change >= 0 ? 'ledger-change positive' : 'ledger-change negative'}>
                    {row.change >= 0 ? '+' : ''}{row.change.toLocaleString('vi-VN')} xu
                  </span>
                </div>
                <p className="ledger-content">{row.content}</p>
                <div className="ledger-row-bottom">
                  <span>{row.before.toLocaleString('vi-VN')} → {row.after.toLocaleString('vi-VN')} xu</span>
                  <span>{row.time}</span>
                </div>
              </div>
            ))}
            {filteredLedger.length === 0 && <p className="muted-copy">{t('order_empty')}</p>}
          </div>
        </Modal>
      </AppShell>
    </RequireAuth>
  );
}
