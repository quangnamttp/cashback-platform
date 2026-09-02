'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { bankList } from '../../lib/mock-data';
import { subscribeSystemRates, DEFAULT_RATES } from '../../lib/systemConfig';
import { AppShell } from '../../components/layout/AppShell';
import { Modal } from '../../components/ui/Modal';
import { CopyIdChip } from '../../components/ui/CopyIdChip';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { useAuth } from '../../lib/auth';
import { getFirebaseDb } from '../../lib/firebase';
import { validateAccountNumber } from '../../lib/bankValidation';
import { notifyWithdrawalRequestToTelegram } from '../../lib/telegram';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { usePageTitle } from '../../lib/use-page-title';

const wdStatusKeyMap: Record<string, string> = {
  PAID: 'wd_status_done',
  APPROVED: 'wd_status_pending',
  PENDING_ADMIN: 'wd_status_pending',
  REJECTED: 'wd_status_cancelled',
};

const wdStatusPillClass: Record<string, string> = {
  PAID: 'order-pill success',
  APPROVED: 'order-pill warning',
  PENDING_ADMIN: 'order-pill warning',
  REJECTED: 'order-pill danger',
};

const filterTabs = [
  { key: 'all', labelKey: 'wd_filter_all' },
  { key: 'PENDING', labelKey: 'wd_filter_pending' },
  { key: 'DONE', labelKey: 'wd_filter_done' },
  { key: 'CANCELLED', labelKey: 'wd_filter_cancelled' },
];

type BankAccount = { id: string; bank: string; accountNumber: string; accountHolder: string };

type LedgerEntry = {
  id: string;
  userId: string;
  orderId?: string;
  amount: number;
  status: 'FROZEN' | 'RELEASED' | 'REJECTED';
  confirmedAt?: { toDate: () => Date };
  releasedAt?: { toDate: () => Date };
};

type WithdrawalDoc = {
  id: string;
  userId: string;
  amount: number;
  method: string;
  status: 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'PAID';
  requestedAt?: { toDate: () => Date };
  decidedAt?: { toDate: () => Date };
};

export default function CashbackWalletPage() {
  const { t, lang } = useLanguage();
  const { uid, userName, userEmail } = useAuth();
  usePageTitle(t('wallet_eyebrow'));

  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalDoc[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [minWithdraw, setMinWithdraw] = useState(DEFAULT_RATES.minWithdraw);

  useEffect(() => subscribeSystemRates((rates) => setMinWithdraw(rates.minWithdraw)), []);
  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [showManageBankModal, setShowManageBankModal] = useState(false);
  const [showLedgerModal, setShowLedgerModal] = useState(false);
  const [newBank, setNewBank] = useState('');
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newAccHolder, setNewAccHolder] = useState('');

  // Withdraw request
  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // History
  const [filter, setFilter] = useState('all');
  const [activeItem, setActiveItem] = useState<WithdrawalDoc | null>(null);
  const [copied, setCopied] = useState(false);

  // Ledger search
  const [ledgerQuery, setLedgerQuery] = useState('');

  useEffect(() => {
    if (!uid) {
      setLedger([]);
      setWithdrawals([]);
      setBankAccounts([]);
      return;
    }
    const db = getFirebaseDb();
    const unsubLedger = onSnapshot(query(collection(db, 'cashbackLedger'), where('userId', '==', uid)), (snap) => {
      setLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
    });
    const unsubWithdrawals = onSnapshot(
      query(collection(db, 'withdrawalRequests'), where('userId', '==', uid), orderBy('requestedAt', 'desc')),
      (snap) => setWithdrawals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WithdrawalDoc))),
    );
    const unsubUser = onSnapshot(doc(db, 'users', uid), (snap) => {
      setBankAccounts((snap.data()?.bankAccounts as BankAccount[]) ?? []);
    });
    return () => {
      unsubLedger();
      unsubWithdrawals();
      unsubUser();
    };
  }, [uid]);

  // No stored balance counter anywhere — always summed live from the
  // ledger + withdrawals, same rule the admin side already follows.
  //
  // Reserves PENDING_ADMIN and APPROVED requests too, not just PAID ones —
  // otherwise "available" stays unchanged the instant a request is
  // submitted, and nothing stops the same money being requested again in a
  // second withdrawal before admin gets to the first one (a real double-
  // withdrawal risk with more than one request open at once). Excluding
  // REJECTED specifically is what still makes a rejected request release
  // its reserved amount back automatically — no manual refund step needed,
  // exactly like before.
  const { available, pending } = useMemo(() => {
    let released = 0;
    let frozen = 0;
    ledger.forEach((entry) => {
      if (entry.status === 'RELEASED') released += entry.amount;
      else if (entry.status === 'FROZEN') frozen += entry.amount;
    });
    const reserved = withdrawals.filter((w) => w.status !== 'REJECTED').reduce((sum, w) => sum + w.amount, 0);
    return { available: released - reserved, pending: frozen };
  }, [ledger, withdrawals]);

  // Combines released cashback + paid withdrawals into one chronological
  // transaction feed with a running balance — the closest honest
  // equivalent of the old mock "before/after" ledger, built from data that
  // actually exists rather than a separate invented "affiliate" ledger.
  const ledgerFeed = useMemo(() => {
    type Row = { id: string; content: string; type: 'CASHBACK' | 'WITHDRAW'; change: number; time: Date };
    const rows: Row[] = [];
    ledger
      .filter((e) => e.status === 'RELEASED' && e.releasedAt)
      .forEach((e) => {
        rows.push({
          id: e.id,
          content: `Hoàn tiền đơn hàng${e.orderId ? ` #${e.orderId}` : ''}`,
          type: 'CASHBACK',
          change: e.amount,
          time: e.releasedAt!.toDate(),
        });
      });
    withdrawals
      .filter((w) => w.status === 'PAID' && w.decidedAt)
      .forEach((w) => {
        rows.push({
          id: w.id,
          content: `Rút tiền #${w.id}`,
          type: 'WITHDRAW',
          change: -w.amount,
          time: w.decidedAt!.toDate(),
        });
      });
    rows.sort((a, b) => a.time.getTime() - b.time.getTime());
    let running = 0;
    const withBalance = rows.map((row) => {
      const before = running;
      running += row.change;
      return { ...row, before, after: running };
    });
    return withBalance.reverse();
  }, [ledger, withdrawals]);

  const filtered = useMemo(() => {
    const statusFor = (key: string): WithdrawalDoc['status'][] => {
      if (key === 'PENDING') return ['PENDING_ADMIN', 'APPROVED'];
      if (key === 'DONE') return ['PAID'];
      if (key === 'CANCELLED') return ['REJECTED'];
      return [];
    };
    if (filter === 'all') return withdrawals;
    const wanted = statusFor(filter);
    return withdrawals.filter((row) => wanted.includes(row.status));
  }, [withdrawals, filter]);

  const filteredLedger = useMemo(() => {
    if (!ledgerQuery) return ledgerFeed;
    const q = ledgerQuery.toLowerCase();
    return ledgerFeed.filter((row) => row.content.toLowerCase().includes(q) || row.id.toLowerCase().includes(q));
  }, [ledgerFeed, ledgerQuery]);

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
  const isValidAmount = amountNum >= minWithdraw && amountNum <= available;
  const selectedAccount = bankAccounts.find((a) => a.id === selectedAccountId);
  const newAccNumberError = newBank && newAccNumber ? validateAccountNumber(newBank, newAccNumber) : null;

  const handleAddBank = async () => {
    if (!newBank || !newAccNumber || !newAccHolder || !uid) return;
    if (validateAccountNumber(newBank, newAccNumber)) return;
    const acc: BankAccount = {
      id: `${Date.now()}`,
      bank: newBank,
      accountNumber: newAccNumber,
      accountHolder: newAccHolder.toUpperCase(),
    };
    try {
      await updateDoc(doc(getFirebaseDb(), 'users', uid), { bankAccounts: arrayUnion(acc) });
      setSelectedAccountId(acc.id);
      setNewBank('');
      setNewAccNumber('');
      setNewAccHolder('');
      setShowAddBankModal(false);
    } catch (err) {
      console.error('add bank account failed', err);
    }
  };

  const handleDeleteBank = async (acc: BankAccount) => {
    if (!uid) return;
    try {
      await updateDoc(doc(getFirebaseDb(), 'users', uid), { bankAccounts: arrayRemove(acc) });
      if (selectedAccountId === acc.id) setSelectedAccountId('');
    } catch (err) {
      console.error('delete bank account failed', err);
    }
  };

  const handleSubmitWithdrawal = async () => {
    if (!uid || !selectedAccount || !isValidAmount) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const requesterName = userName || 'Khách hàng';
      const requesterEmail = userEmail || uid;
      // Pre-generated so the id is known BEFORE the doc is written — needed
      // to send it as the Telegram "✅ Xác nhận đã thanh toán" button's
      // callback_data and to fold the Telegram message's own chat/message
      // id back into this same create call (a plain customer can create
      // their own request, but firestore.rules only lets admin/the payment
      // bot UPDATE one afterwards — see workers/telegram-bot).
      const ref = doc(collection(getFirebaseDb(), 'withdrawalRequests'));
      const telegramRef = await notifyWithdrawalRequestToTelegram({
        requestId: ref.id,
        requesterName,
        requesterEmail,
        bank: selectedAccount.bank,
        accountNumber: selectedAccount.accountNumber,
        accountHolder: selectedAccount.accountHolder,
        amount: amountNum,
        amountLabel: formatCurrency(amountNum, lang),
      });
      await setDoc(ref, {
        userId: uid,
        amount: amountNum,
        bank: selectedAccount.bank,
        accountNumber: selectedAccount.accountNumber,
        accountHolder: selectedAccount.accountHolder,
        method: `${selectedAccount.bank} • ${selectedAccount.accountNumber} (${selectedAccount.accountHolder})`,
        requesterName,
        requesterEmail,
        status: 'PENDING_ADMIN',
        requestedAt: serverTimestamp(),
        telegramChatId: telegramRef?.chatId ?? null,
        telegramMessageId: telegramRef?.messageId ?? null,
      });
      setAmount('');
      setSelectedAccountId('');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err) {
      console.error('create withdrawal request failed', err);
      setSubmitError('Gửi yêu cầu thất bại, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
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
                <div className="wc-value-v2">{formatCurrency(available, lang)}</div>
              </div>
              <div className="wc-divider" />
              <div>
                <div className="wc-label">{t('wallet_pending')}</div>
                <div className="wc-value-v2 secondary">{formatCurrency(pending, lang)}</div>
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
            <p>{t('wd_notice_desc').replace('{min}', formatCurrency(minWithdraw, lang))}</p>
          </div>

          <div className="two-column-grid">
            {/* Withdraw request form */}
            <section className="panel">
              <div className="wd-form-header">
                <span className="promo-icon-badge" style={{ background: '#dcfce7', color: '#15803d' }}>⬇️</span>
                <div>
                  <h3>{t('wd_create_title')}</h3>
                  <p className="muted-copy">{t('wd_create_min').replace('{min}', formatCurrency(minWithdraw, lang))}</p>
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
              {amount && amountNum < minWithdraw && (
                <p className="admin-gate-error" style={{ marginTop: 6 }}>{t('wd_min_error').replace('{min}', formatCurrency(minWithdraw, lang))}</p>
              )}
              {amount && amountNum >= minWithdraw && amountNum > available && (
                <p className="admin-gate-error" style={{ marginTop: 6 }}>Số dư của bạn không đủ để thực hiện lệnh rút này (khả dụng: {formatCurrency(available, lang)}).</p>
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

              {submitError && <p className="admin-gate-error" style={{ marginTop: 6 }}>{submitError}</p>}

              <button
                className="button button-primary get-link-cta"
                disabled={!isValidAmount || !selectedAccountId || submitting}
                onClick={handleSubmitWithdrawal}
              >
                {submitting ? 'Đang gửi...' : submitted ? '✓ Đã gửi yêu cầu' : `⬇️ ${t('wd_submit_btn')}`}
              </button>
              <p className="muted-copy" style={{ fontSize: '0.78rem', marginTop: 8 }}>{t('wd_processing_time')}</p>
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
                  <div
                    key={item.id}
                    className="wd-history-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveItem(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setActiveItem(item);
                    }}
                  >
                    <div className="wd-history-top">
                      <strong>{formatCurrency(item.amount, lang)}</strong>
                      <span className={wdStatusPillClass[item.status] ?? 'order-pill'}>
                        ● {t(wdStatusKeyMap[item.status] as any) || item.status}
                      </span>
                    </div>
                    <p>{item.method}</p>
                    <div className="wd-history-bottom">
                      <CopyIdChip value={item.id} />
                      <span>{t('wd_view_detail')} ›</span>
                    </div>
                  </div>
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
                  <span>{t('wd_receiving_bank')}</span>
                  <span>{activeItem.method}</span>
                </div>
                <div className="modal-field-row">
                  <span>{t('wd_amount_label')}</span>
                  <span>{formatCurrency(activeItem.amount, lang)}</span>
                </div>
                <div className="modal-field-row">
                  <span>{t('wd_created_at')}</span>
                  <span>{activeItem.requestedAt ? activeItem.requestedAt.toDate().toLocaleString('vi-VN') : '—'}</span>
                </div>
                <div className="modal-field-row">
                  <span>{t('wd_updated_at')}</span>
                  <span>{activeItem.decidedAt ? activeItem.decidedAt.toDate().toLocaleString('vi-VN') : '—'}</span>
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
          {newAccNumberError && <p className="admin-gate-error" style={{ marginTop: 6 }}>{newAccNumberError}</p>}

          <label className="field-label" style={{ display: 'block', marginTop: 14 }}>{t('bank_field_account_holder')}</label>
          <div className="get-link-input-row" style={{ marginTop: 6 }}>
            <span className="get-link-input-icon">👤</span>
            <input placeholder={t('bank_holder_placeholder')} value={newAccHolder} onChange={(e) => setNewAccHolder(e.target.value)} />
          </div>

          <button
            type="button"
            className="button button-primary modal-cta"
            onClick={handleAddBank}
            disabled={!newBank || !newAccNumber || !newAccHolder || !!newAccNumberError}
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
                  <button className="btn-reject" onClick={() => handleDeleteBank(acc)}>🗑 {t('bank_delete')}</button>
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
                    {row.type === 'CASHBACK' ? t('ledger_type_cashback') : t('ledger_type_withdraw')}
                  </span>
                  <span className={row.change >= 0 ? 'ledger-change positive' : 'ledger-change negative'}>
                    {row.change >= 0 ? '+' : ''}{formatCurrency(row.change, lang)}
                  </span>
                </div>
                <p className="ledger-content">{row.content}</p>
                <div className="ledger-row-bottom">
                  <span>{formatCurrency(row.before, lang)} → {formatCurrency(row.after, lang)}</span>
                  <span>{row.time.toLocaleString('vi-VN')}</span>
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
