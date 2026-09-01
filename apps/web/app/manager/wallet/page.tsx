'use client';

import { useEffect, useMemo, useState } from 'react';
import { addDoc, arrayRemove, arrayUnion, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { AdminShell } from '../../../components/layout/AdminShell';
import { Modal } from '../../../components/ui/Modal';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';
import { useAuth } from '../../../lib/auth';
import { getFirebaseDb } from '../../../lib/firebase';
import { ADMIN_WALLET_ID } from '../../../lib/orderEntry';
import { ADMIN_PAYMENT_METHODS, validateAccountNumber } from '../../../lib/bankValidation';
import { notifyWithdrawalRequestToTelegram } from '../../../lib/telegram';
import { usePageTitle } from '../../../lib/use-page-title';

const MIN_WITHDRAW = 20000;

type BankAccount = { id: string; bank: string; accountNumber: string; accountHolder: string };

type LedgerEntry = {
  id: string;
  userId: string;
  amount: number;
  type: 'CUSTOMER_CASHBACK' | 'REFERRAL_BONUS' | 'PLATFORM_REVENUE';
  status: 'FROZEN' | 'RELEASED' | 'REJECTED';
};

type WithdrawalDoc = {
  id: string;
  amount: number;
  bank: string;
  accountNumber: string;
  accountHolder: string;
  status: 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'PAID';
  requestedAt?: { toDate: () => Date };
  rejectionReason?: string;
};

const wdStatusLabel: Record<string, string> = {
  PENDING_ADMIN: 'Đang chờ xử lý',
  APPROVED: 'Đã duyệt (chờ chuyển)',
  REJECTED: 'Đã từ chối',
  PAID: 'Đã thanh toán',
};

const wdStatusBadge: Record<string, string> = {
  PENDING_ADMIN: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  PAID: 'badge-neutral',
};

const filterTabs = [
  { key: 'all', label: 'Tất cả' },
  { key: 'PENDING', label: 'Chờ duyệt' },
  { key: 'DONE', label: 'Hoàn tất' },
  { key: 'CANCELLED', label: 'Đã hủy' },
];

export default function AdminWalletPage() {
  usePageTitle('Ví tổng Admin');
  const { lang } = useLanguage();
  const { uid } = useAuth();

  const [allLedger, setAllLedger] = useState<LedgerEntry[]>([]);
  const [adminWithdrawals, setAdminWithdrawals] = useState<WithdrawalDoc[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const [amount, setAmount] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [showAddBankModal, setShowAddBankModal] = useState(false);
  const [newBank, setNewBank] = useState<string>(ADMIN_PAYMENT_METHODS[0]);
  const [newAccNumber, setNewAccNumber] = useState('');
  const [newAccHolder, setNewAccHolder] = useState('');

  const [historyFilter, setHistoryFilter] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [activeItem, setActiveItem] = useState<WithdrawalDoc | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const db = getFirebaseDb();
    // Admin can read the whole ledger (see firestore.rules) — used both to
    // derive the admin wallet's own balance and the system-wide stats below.
    const unsubLedger = onSnapshot(collection(db, 'cashbackLedger'), (snap) => {
      setAllLedger(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
    });
    const unsubWithdrawals = onSnapshot(
      query(collection(db, 'withdrawalRequests'), where('userId', '==', ADMIN_WALLET_ID), orderBy('requestedAt', 'desc')),
      (snap) => setAdminWithdrawals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WithdrawalDoc))),
    );
    return () => {
      unsubLedger();
      unsubWithdrawals();
    };
  }, []);

  useEffect(() => {
    if (!uid) {
      setBankAccounts([]);
      return undefined;
    }
    // Reuses the SAME bankAccounts field/pattern as the customer wallet
    // (users/{uid}.bankAccounts), just on the admin's own user doc — so the
    // admin's payout accounts are saved and reused exactly like a customer's.
    const unsubUser = onSnapshot(doc(getFirebaseDb(), 'users', uid), (snap) => {
      setBankAccounts((snap.data()?.bankAccounts as BankAccount[]) ?? []);
    });
    return unsubUser;
  }, [uid]);

  const stats = useMemo(() => {
    let platformReleased = 0;
    let platformFrozen = 0;
    let customerReleased = 0;
    let referralReleased = 0;
    allLedger.forEach((entry) => {
      if (entry.type === 'PLATFORM_REVENUE') {
        if (entry.status === 'RELEASED') platformReleased += entry.amount;
        else if (entry.status === 'FROZEN') platformFrozen += entry.amount;
      } else if (entry.type === 'CUSTOMER_CASHBACK' && entry.status === 'RELEASED') {
        customerReleased += entry.amount;
      } else if (entry.type === 'REFERRAL_BONUS' && entry.status === 'RELEASED') {
        referralReleased += entry.amount;
      }
    });
    const paidOut = adminWithdrawals.filter((w) => w.status === 'PAID').reduce((sum, w) => sum + w.amount, 0);
    return {
      available: platformReleased - paidOut,
      frozen: platformFrozen,
      lifetimeRevenue: platformReleased + platformFrozen,
      paidOut,
      customerReleased,
      referralReleased,
    };
  }, [allLedger, adminWithdrawals]);

  const filteredWithdrawals = useMemo(() => {
    const statusFor = (key: string): WithdrawalDoc['status'][] => {
      if (key === 'PENDING') return ['PENDING_ADMIN', 'APPROVED'];
      if (key === 'DONE') return ['PAID'];
      if (key === 'CANCELLED') return ['REJECTED'];
      return [];
    };
    const byStatus = historyFilter === 'all' ? adminWithdrawals : adminWithdrawals.filter((row) => statusFor(historyFilter).includes(row.status));
    if (!historySearch.trim()) return byStatus;
    const q = historySearch.trim().toLowerCase();
    return byStatus.filter(
      (row) =>
        row.id.toLowerCase().includes(q) ||
        row.accountNumber.toLowerCase().includes(q) ||
        row.accountHolder.toLowerCase().includes(q) ||
        row.bank.toLowerCase().includes(q) ||
        String(row.amount).includes(q),
    );
  }, [adminWithdrawals, historyFilter, historySearch]);

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
  const selectedAccount = bankAccounts.find((a) => a.id === selectedAccountId);
  const newAccNumberError = newAccNumber ? validateAccountNumber(newBank, newAccNumber) : null;
  const amountError =
    amount && amountNum < MIN_WITHDRAW
      ? `Số tiền rút tối thiểu là ${formatCurrency(MIN_WITHDRAW, lang)}.`
      : amount && amountNum > stats.available
        ? `Số dư của bạn không đủ để thực hiện lệnh rút này (khả dụng: ${formatCurrency(stats.available, lang)}).`
        : null;
  const isValid = amountNum >= MIN_WITHDRAW && amountNum <= stats.available && !!selectedAccount;

  const handleAddBank = async () => {
    if (!newAccNumber || !newAccHolder || !uid) return;
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
      setNewAccNumber('');
      setNewAccHolder('');
      setShowAddBankModal(false);
    } catch (err) {
      console.error('add admin bank account failed', err);
    }
  };

  const handleDeleteBank = async (acc: BankAccount) => {
    if (!uid) return;
    try {
      await updateDoc(doc(getFirebaseDb(), 'users', uid), { bankAccounts: arrayRemove(acc) });
      if (selectedAccountId === acc.id) setSelectedAccountId('');
    } catch (err) {
      console.error('delete admin bank account failed', err);
    }
  };

  const submitWithdrawal = async () => {
    if (!uid || !isValid || !selectedAccount) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await addDoc(collection(getFirebaseDb(), 'withdrawalRequests'), {
        userId: ADMIN_WALLET_ID,
        amount: amountNum,
        bank: selectedAccount.bank,
        accountNumber: selectedAccount.accountNumber,
        accountHolder: selectedAccount.accountHolder,
        method: `${selectedAccount.bank} • ${selectedAccount.accountNumber} (${selectedAccount.accountHolder})`,
        status: 'PENDING_ADMIN',
        requestedAt: serverTimestamp(),
        requestedBy: uid,
      });
      notifyWithdrawalRequestToTelegram({
        requesterLabel: 'Ví tổng Admin (doanh thu 20%)',
        amountLabel: formatCurrency(amountNum, lang),
        method: `${selectedAccount.bank} • ${selectedAccount.accountNumber} (${selectedAccount.accountHolder})`,
      });
      setAmount('');
      setSelectedAccountId('');
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } catch (err) {
      console.error('admin withdrawal request failed', err);
      setSubmitError('Gửi yêu cầu thất bại, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Ví tổng Admin</span>
          <h1>Doanh thu 20% &amp; rút tiền</h1>
        </div>
      </div>

      <div className="stats-grid admin-grid">
        <div className="stat-card compact">
          <div className="stat-label">Số dư khả dụng</div>
          <div className="stat-value">{formatCurrency(stats.available, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Đang chờ giải phóng</div>
          <div className="stat-value">{formatCurrency(stats.frozen, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Doanh thu 20% lũy kế</div>
          <div className="stat-value">{formatCurrency(stats.lifetimeRevenue, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Admin đã rút</div>
          <div className="stat-value">{formatCurrency(stats.paidOut, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Đã trả khách hàng (cashback)</div>
          <div className="stat-value">{formatCurrency(stats.customerReleased, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Đã trả người giới thiệu</div>
          <div className="stat-value">{formatCurrency(stats.referralReleased, lang)}</div>
        </div>
      </div>

      <div className="two-column-grid">
        <section className="panel">
          <div className="wd-form-header">
            <span className="promo-icon-badge" style={{ background: '#dcfce7', color: '#15803d' }}>⬇️</span>
            <div>
              <h3>Tạo lệnh rút doanh thu</h3>
              <p className="muted-copy">Tối thiểu {formatCurrency(MIN_WITHDRAW, lang)} · không giới hạn tối đa</p>
            </div>
          </div>

          <label className="field-label" htmlFor="admin-wd-amount">Số tiền muốn rút (đ)</label>
          <div className="get-link-input-row" style={{ marginTop: 6 }}>
            <span className="get-link-input-icon">💵</span>
            <input
              id="admin-wd-amount"
              inputMode="numeric"
              placeholder="VD: 500000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          {amountError && <p className="admin-gate-error" style={{ marginTop: 6 }}>{amountError}</p>}

          <div className="wd-bank-select-header">
            <span className="field-label">Ngân hàng nhận</span>
            <button type="button" className="text-link" onClick={() => setShowAddBankModal(true)}>➕ Thêm NH</button>
          </div>

          {bankAccounts.length > 0 ? (
            <select
              className="wd-bank-select"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              <option value="">--- Chọn tài khoản nhận ---</option>
              {bankAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountNumber} | {acc.bank} | {acc.accountHolder}
                </option>
              ))}
            </select>
          ) : (
            <div className="wd-bank-select wd-bank-select-empty">🏦 Bạn chưa liên kết tài khoản ngân hàng nào. Thêm tài khoản để rút tiền nhanh hơn.</div>
          )}

          {submitError && <p className="admin-gate-error" style={{ marginTop: 6 }}>{submitError}</p>}

          <button
            className="button button-primary get-link-cta"
            disabled={!isValid || submitting}
            onClick={submitWithdrawal}
          >
            {submitting ? 'Đang gửi...' : submitted ? '✓ Đã gửi yêu cầu' : '⬇️ Rút tiền ngay'}
          </button>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Lịch sử rút tiền Admin</h3>
          </div>

          <input
            className="admin-search-input"
            style={{ width: '100%', marginBottom: 10 }}
            placeholder="Tìm theo mã lệnh, số tài khoản, tên chủ TK..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
          />

          <div className="wd-filter-tabs">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                className={historyFilter === tab.key ? 'active' : ''}
                onClick={() => setHistoryFilter(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <p className="muted-copy" style={{ marginTop: 10, marginBottom: 4 }}>
            {filteredWithdrawals.length} lệnh
          </p>

          <div className="wd-history-list scrollable-list">
            {filteredWithdrawals.map((item) => (
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
                  <span className={`badge ${wdStatusBadge[item.status]}`}>{wdStatusLabel[item.status] ?? item.status}</span>
                </div>
                <p>{item.bank} • {item.accountNumber} ({item.accountHolder})</p>
                <div className="wd-history-bottom">
                  <CopyIdChip value={item.id} />
                  <span>Xem chi tiết ›</span>
                </div>
              </div>
            ))}
            {filteredWithdrawals.length === 0 && <p className="muted-copy">Chưa có lệnh rút nào.</p>}
          </div>
        </section>
      </div>

      <p className="mock-note">
        Số dư được tính trực tiếp từ <code>cashbackLedger</code> (khoản loại <code>PLATFORM_REVENUE</code>, chủ sở hữu
        ảo <code>ADMIN_WALLET</code>) trừ đi các lệnh rút đã <code>PAID</code> — không dùng biến đếm số dư nào cả, nên
        luôn khớp với thực tế dù mở nhiều tab cùng lúc. Duyệt/từ chối lệnh rút này ở trang{' '}
        <strong>Rút tiền</strong> chung với lệnh rút của khách hàng.
      </p>

      <Modal open={!!activeItem} onClose={() => setActiveItem(null)}>
        {activeItem && (
          <>
            <div className="modal-header-row">
              <span className="promo-icon-badge" style={{ width: 40, height: 40 }}>🧾</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Chi tiết lệnh rút</h3>
                <span className="modal-code-row-small">{activeItem.id}</span>
              </div>
            </div>

            <span className={`badge ${wdStatusBadge[activeItem.status]}`} style={{ marginBottom: 16, display: 'inline-flex' }}>
              {wdStatusLabel[activeItem.status] ?? activeItem.status}
            </span>

            <div className="modal-field-list">
              <div className="modal-field-row">
                <span>Phương thức</span>
                <span>{activeItem.bank}</span>
              </div>
              <div className="modal-field-row">
                <span>Số tài khoản / SĐT</span>
                <span>{activeItem.accountNumber}</span>
              </div>
              <div className="modal-field-row">
                <span>Chủ tài khoản</span>
                <span>{activeItem.accountHolder}</span>
              </div>
              <div className="modal-field-row">
                <span>Số tiền</span>
                <span>{formatCurrency(activeItem.amount, lang)}</span>
              </div>
              <div className="modal-field-row">
                <span>Ngày yêu cầu</span>
                <span>{activeItem.requestedAt ? activeItem.requestedAt.toDate().toLocaleString('vi-VN') : '—'}</span>
              </div>
              <div className="modal-field-row">
                <span>Mã lệnh</span>
                <span className="modal-code-row">
                  {activeItem.id}
                  <button className="modal-copy-icon-btn" onClick={() => copyCode(activeItem.id)} title="Copy">
                    {copied ? '✓' : '📋'}
                  </button>
                </span>
              </div>
            </div>

            {activeItem.status === 'REJECTED' && activeItem.rejectionReason && (
              <p className="admin-gate-error" style={{ marginTop: 14 }}>Lý do từ chối: {activeItem.rejectionReason}</p>
            )}
          </>
        )}
      </Modal>

      <Modal open={showAddBankModal} onClose={() => setShowAddBankModal(false)}>
        <div className="modal-header-row">
          <span className="promo-icon-badge" style={{ width: 40, height: 40, background: '#dcfce7', color: '#15803d' }}>🏦</span>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Thêm tài khoản ngân hàng</h3>
        </div>

        <label className="field-label" style={{ display: 'block', marginTop: 4 }}>Phương thức thanh toán</label>
        <select className="wd-bank-select" style={{ marginTop: 6 }} value={newBank} onChange={(e) => setNewBank(e.target.value)}>
          {ADMIN_PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <label className="field-label" style={{ display: 'block', marginTop: 14 }}>
          {newBank === 'Viettel Money' ? 'Số điện thoại' : 'Số tài khoản'}
        </label>
        <div className="get-link-input-row" style={{ marginTop: 6 }}>
          <span className="get-link-input-icon">💳</span>
          <input
            placeholder={newBank === 'Viettel Money' ? 'VD: 0961234567' : 'Nhập số tài khoản'}
            value={newAccNumber}
            onChange={(e) => setNewAccNumber(e.target.value)}
          />
        </div>
        {newAccNumberError && <p className="admin-gate-error" style={{ marginTop: 6 }}>{newAccNumberError}</p>}

        <label className="field-label" style={{ display: 'block', marginTop: 14 }}>Tên chủ tài khoản</label>
        <div className="get-link-input-row" style={{ marginTop: 6 }}>
          <span className="get-link-input-icon">👤</span>
          <input placeholder="VD: NGUYEN VAN A" value={newAccHolder} onChange={(e) => setNewAccHolder(e.target.value)} />
        </div>

        <button
          type="button"
          className="button button-primary modal-cta"
          onClick={handleAddBank}
          disabled={!newAccNumber || !newAccHolder || !!newAccNumberError}
        >
          ➕ Thêm tài khoản
        </button>

        {bankAccounts.length > 0 && (
          <div className="bank-manage-list scrollable-list" style={{ marginTop: 18 }}>
            {bankAccounts.map((acc, index) => (
              <div key={acc.id} className="bank-manage-row">
                <div>
                  <span className="modal-code-row-small">#{index + 1}</span>
                  <strong>{acc.bank}</strong>
                  <span>{acc.accountNumber} · {acc.accountHolder}</span>
                </div>
                <button className="btn-reject" onClick={() => handleDeleteBank(acc)}>🗑 Xoá</button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </AdminShell>
  );
}
