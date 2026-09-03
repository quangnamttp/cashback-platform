'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { logAdminAction } from '../../../lib/adminAudit';
import { syncWithdrawalStatusToTelegram } from '../../../lib/telegram';
import { ADMIN_WALLET_ID } from '../../../lib/orderEntry';
import { creditWalletBalance } from '../../../lib/walletBalance';
import { AdminShell } from '../../../components/layout/AdminShell';
import { Modal } from '../../../components/ui/Modal';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';
import { usePageTitle } from '../../../lib/use-page-title';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'PENDING_ADMIN', label: 'Chờ duyệt' },
  { value: 'DONE', label: 'Đã duyệt / Thành công' },
  { value: 'REJECTED', label: 'Từ chối' },
];

type WithdrawalRequest = {
  id: string;
  userId: string;
  amount: number;
  method: string;
  bank?: string;
  accountNumber?: string;
  accountHolder?: string;
  requesterName?: string;
  requesterEmail?: string;
  status: 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'PAID';
  requestedAt?: { toDate: () => Date };
  rejectionReason?: string;
  telegramChatId?: string | null;
  telegramMessageId?: number | null;
};

type UserOption = { id: string; fullName?: string; email?: string };

type LedgerEntry = { userId: string; amount: number; status: 'FROZEN' | 'RELEASED' | 'REJECTED' };

const statusBadge: Record<string, string> = {
  PENDING_ADMIN: 'badge-warning',
  APPROVED: 'badge-success',
  REJECTED: 'badge-danger',
  PAID: 'badge-neutral',
};

const statusLabel: Record<string, string> = {
  PENDING_ADMIN: 'Chờ admin duyệt',
  APPROVED: 'Đã duyệt (chờ chuyển khoản)',
  REJECTED: 'Đã từ chối',
  PAID: 'Đã chuyển tiền',
};

// `stored` is the requesterName/requesterEmail already saved directly on
// the withdrawalRequests doc at creation time (see cashback-wallet/page.tsx
// — captured for the Telegram message). Preferred over the live `users`
// lookup below: that lookup needs a matching users/{uid} doc to resolve
// anything and silently falls back to the raw uid when one doesn't exist
// (a real gap — every account created through the actual signup flow gets
// one, but it means any account missing that doc, for any reason, shows
// as an unreadable id string here instead of a name).
function requesterLabel(users: UserOption[], userId: string, stored?: string): string {
  if (userId === ADMIN_WALLET_ID) return 'Ví tổng Admin (doanh thu 20%)';
  if (stored) return stored;
  const user = users.find((u) => u.id === userId);
  if (!user) return userId;
  return user.fullName || user.email || userId;
}

export default function AdminWithdrawalsPage() {
  usePageTitle('Yêu cầu rút tiền');
  const { lang } = useLanguage();
  const { uid, userEmail } = useAuth();
  const [rows, setRows] = useState<WithdrawalRequest[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<WithdrawalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubRows = onSnapshot(query(collection(db, 'withdrawalRequests'), orderBy('requestedAt', 'desc')), (snap) => {
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() } as WithdrawalRequest)));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserOption)));
    });
    const unsubLedger = onSnapshot(collection(db, 'cashbackLedger'), (snap) => {
      setLedger(snap.docs.map((d) => d.data() as LedgerEntry));
    });
    return () => {
      unsubRows();
      unsubUsers();
      unsubLedger();
    };
  }, []);

  const pendingCount = rows.filter((row) => row.status === 'PENDING_ADMIN').length;

  // Same "available = released − reserved" formula the customer's own
  // wallet page shows them (cashback-wallet/page.tsx) — computed here too
  // because nothing server-side stops a withdrawal request's `amount` from
  // exceeding it (firestore.rules can't sum a collection to check a
  // balance). Without this, approving/marking-paid means trusting whatever
  // number is on the request doc with no way to notice an over-request.
  // ADMIN_WALLET's own revenue withdrawals aren't in cashbackLedger (that's
  // a separate 20%-of-ledger calculation on /manager/wallet), so this
  // check only applies to real customers.
  const availableByUser = useMemo(() => {
    const released = new Map<string, number>();
    ledger.forEach((entry) => {
      if (entry.status !== 'RELEASED') return;
      released.set(entry.userId, (released.get(entry.userId) ?? 0) + entry.amount);
    });
    const reserved = new Map<string, number>();
    rows.forEach((row) => {
      if (row.status === 'REJECTED') return;
      reserved.set(row.userId, (reserved.get(row.userId) ?? 0) + row.amount);
    });
    const result = new Map<string, number>();
    const userIds = new Set([...released.keys(), ...reserved.keys()]);
    userIds.forEach((userId) => {
      result.set(userId, (released.get(userId) ?? 0) - (reserved.get(userId) ?? 0));
    });
    return result;
  }, [ledger, rows]);

  const filteredRows = rows.filter((row) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'DONE' ? row.status === 'APPROVED' || row.status === 'PAID' : row.status === statusFilter);
    if (!matchesStatus) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const requester = requesterLabel(users, row.userId, row.requesterName);
    return (
      row.id.toLowerCase().includes(q) ||
      requester.toLowerCase().includes(q) ||
      (row.accountHolder ?? '').toLowerCase().includes(q) ||
      (row.accountNumber ?? '').toLowerCase().includes(q) ||
      (row.bank ?? row.method ?? '').toLowerCase().includes(q) ||
      String(row.amount).includes(q)
    );
  });

  // "Available to withdraw" is still always computed live from
  // cashbackLedger for display (unchanged) — but the request's `amount` was
  // reserved out of walletBalances/{uid}.available the moment it was
  // created (see lib/walletBalance.ts / cashback-wallet/page.tsx), which
  // IS what firestore.rules checks new requests against. A REJECTED
  // request must give that reservation back, or the requester's real
  // withdrawable ceiling would stay wrongly lower forever. ADMIN_WALLET
  // never reserves against this counter (separate calc, see
  // creditWalletBalance's call site in manager/payouts/page.tsx), so it's
  // skipped here too.
  const decide = async (requestId: string, decision: 'APPROVE' | 'REJECT' | 'MARK_PAID', reason?: string) => {
    if (!uid) return;
    setBusyId(requestId);
    try {
      const status = decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'PAID';
      await updateDoc(doc(getFirebaseDb(), 'withdrawalRequests', requestId), {
        status,
        decidedBy: uid,
        decidedAt: serverTimestamp(),
        ...(decision === 'REJECT' ? { rejectionReason: reason || '' } : {}),
      });
      if (decision === 'REJECT') {
        const row = rows.find((r) => r.id === requestId);
        if (row && row.userId !== ADMIN_WALLET_ID) {
          await creditWalletBalance(row.userId, row.amount);
        }
      }
      if (decision === 'MARK_PAID' || decision === 'REJECT') {
        // Keeps the Telegram buttons in sync when admin decides from the
        // web instead of tapping them in Telegram — otherwise those
        // buttons would still look tappable for an already-settled
        // request. (APPROVE has no Telegram button of its own — that step
        // only exists on the web side — so nothing to sync for it.)
        const row = rows.find((r) => r.id === requestId);
        if (row?.telegramChatId && row.telegramMessageId) {
          syncWithdrawalStatusToTelegram(
            { chatId: row.telegramChatId, messageId: row.telegramMessageId },
            {
              requesterName: requesterLabel(users, row.userId, row.requesterName),
              requesterEmail: row.requesterEmail || users.find((u) => u.id === row.userId)?.email || '—',
              bank: row.bank ?? row.method,
              accountNumber: row.accountNumber ?? '',
              accountHolder: row.accountHolder ?? '',
              amount: row.amount,
              amountLabel: formatCurrency(row.amount, lang),
              requestId: row.id,
            },
            decision === 'MARK_PAID' ? 'paid' : 'rejected',
          );
        }
      }
      await logAdminAction({
        actorUid: uid,
        actorEmail: userEmail,
        action: `adminDecideWithdrawal:${decision}`,
        targetType: 'withdrawalRequest',
        targetId: requestId,
      });
    } catch (err) {
      console.error('decide withdrawal failed', err);
    } finally {
      setBusyId(null);
    }
  };

  // Only REJECTED requests can ever be deleted (see firestore.rules) — a
  // real APPROVED/PAID request stays a permanent audit trail. Exists so
  // Admin can clear mistaken/test entries out of this list.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteRejected = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDoc(doc(getFirebaseDb(), 'withdrawalRequests', id));
    } catch (err) {
      console.error('delete rejected withdrawal failed', err);
    } finally {
      setDeletingId(null);
    }
  };

  const openReject = (row: WithdrawalRequest) => {
    setRejectTarget(row);
    setRejectReason('');
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    await decide(rejectTarget.id, 'REJECT', rejectReason.trim());
    setRejectTarget(null);
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Duyệt rút tiền</span>
          <h1>Yêu cầu rút tiền</h1>
        </div>
        <span className="badge badge-warning">{pendingCount} đang chờ duyệt</span>
      </div>

      <AdminSearchToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Tìm theo mã lệnh, tên người rút, SĐT/số tài khoản..."
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={FILTER_OPTIONS}
        resultCount={filteredRows.length}
        resultLabel="lệnh"
      />

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã lệnh</th>
                <th>Người rút</th>
                <th>Số tiền</th>
                <th>Số dư khả dụng của khách</th>
                <th>Phương thức</th>
                <th>Số TK / SĐT</th>
                <th>Chủ tài khoản</th>
                <th>Ngày yêu cầu</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td><CopyIdChip value={row.id} /></td>
                  <td>{requesterLabel(users, row.userId, row.requesterName)}</td>
                  <td><strong>{formatCurrency(row.amount, lang)}</strong></td>
                  <td>
                    {row.userId === ADMIN_WALLET_ID ? (
                      <span className="muted-copy">—</span>
                    ) : (
                      (() => {
                        const bal = availableByUser.get(row.userId) ?? 0;
                        return (
                          <span style={bal < 0 ? { color: '#dc2626', fontWeight: 600 } : undefined}>
                            {formatCurrency(bal, lang)}
                            {bal < 0 && ' ⚠️ Vượt số dư'}
                          </span>
                        );
                      })()
                    )}
                  </td>
                  <td>{row.bank ?? row.method}</td>
                  <td>{row.accountNumber ?? '—'}</td>
                  <td>{row.accountHolder ?? '—'}</td>
                  <td>{row.requestedAt ? row.requestedAt.toDate().toLocaleString('vi-VN') : '—'}</td>
                  <td>
                    <span className={`badge ${statusBadge[row.status]}`}>{statusLabel[row.status] ?? row.status}</span>
                    {row.status === 'REJECTED' && row.rejectionReason && (
                      <div className="muted-copy" style={{ fontSize: '0.75rem', marginTop: 4 }}>Lý do: {row.rejectionReason}</div>
                    )}
                  </td>
                  <td>
                    {row.status === 'PENDING_ADMIN' && (
                      <div className="admin-action-row">
                        <button className="btn-approve" disabled={busyId === row.id} onClick={() => decide(row.id, 'APPROVE')}>Đã duyệt</button>
                        <button className="btn-reject" disabled={busyId === row.id} onClick={() => openReject(row)}>Từ chối</button>
                      </div>
                    )}
                    {row.status === 'APPROVED' && (
                      <div className="admin-action-row">
                        <button className="btn-approve" disabled={busyId === row.id} onClick={() => decide(row.id, 'MARK_PAID')}>Đã thanh toán</button>
                        <button className="btn-reject" disabled={busyId === row.id} onClick={() => openReject(row)}>Từ chối</button>
                      </div>
                    )}
                    {row.status === 'PAID' && <span className="muted-copy">Đã xử lý</span>}
                    {row.status === 'REJECTED' && (
                      <button
                        className="btn-reject"
                        disabled={deletingId === row.id}
                        onClick={() => deleteRejected(row.id)}
                      >
                        {deletingId === row.id ? 'Đang xoá...' : '🗑 Xoá'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted-copy">Không tìm thấy yêu cầu rút tiền phù hợp.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">
        Dữ liệu thật từ Firestore (collection <code>withdrawalRequests</code>), gồm cả lệnh rút của khách hàng và lệnh
        rút doanh thu 20% của Admin (đánh dấu &quot;Ví tổng Admin&quot;). Chưa tích hợp API ngân hàng/ví thật — Admin
        luôn cần chuyển khoản thủ công rồi bấm &quot;Đã thanh toán&quot;. Ngay khi 1 lệnh được tạo, số tiền đó đã bị
        giữ lại khỏi số dư khả dụng của người rút (kể cả khi lệnh còn đang &quot;Chờ duyệt&quot;) — tránh việc tạo
        nhiều lệnh rút cùng lúc vượt quá số dư thật. Từ chối một lệnh không cần hoàn tiền thủ công: số tiền tự động
        trả lại vào số dư ngay khi bấm &quot;Từ chối&quot;. Cột &quot;Số dư khả dụng của khách&quot; hiển thị số dư
        thật của khách <strong>sau khi</strong> trừ hết các lệnh rút chưa bị từ chối (kể cả lệnh này) — nếu hiện âm
        (⚠️) nghĩa là tổng các lệnh rút của khách này đã vượt quá số tiền họ thực sự có, cần kiểm tra kỹ trước khi
        duyệt/thanh toán.
      </p>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)}>
        {rejectTarget && (
          <>
            <div className="modal-header-row">
              <span className="promo-icon-badge" style={{ width: 40, height: 40, background: '#fee2e2', color: '#dc2626' }}>✕</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Từ chối lệnh rút</h3>
                <span className="modal-code-row-small">{requesterLabel(users, rejectTarget.userId, rejectTarget.requesterName)} • {formatCurrency(rejectTarget.amount, lang)}</span>
              </div>
            </div>

            <label className="field-label" style={{ display: 'block', marginTop: 10 }}>
              Lý do từ chối (khách/Admin sẽ thấy để tạo lại lệnh mới chính xác hơn)
            </label>
            <textarea
              className="support-chat-textarea"
              placeholder="VD: Tên chủ tài khoản không khớp / Sai số tài khoản / Ngân hàng từ chối nhận tiền..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              style={{ marginTop: 6 }}
            />

            <button className="button button-primary modal-cta" style={{ background: '#dc2626' }} onClick={confirmReject}>
              ✕ Xác nhận từ chối
            </button>
          </>
        )}
      </Modal>
    </AdminShell>
  );
}
