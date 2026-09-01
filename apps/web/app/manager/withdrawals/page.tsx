'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { getFirebaseDb } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { logAdminAction } from '../../../lib/adminAudit';
import { ADMIN_WALLET_ID } from '../../../lib/orderEntry';
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
  status: 'PENDING_ADMIN' | 'APPROVED' | 'REJECTED' | 'PAID';
  requestedAt?: { toDate: () => Date };
  rejectionReason?: string;
};

type UserOption = { id: string; fullName?: string; email?: string };

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

function requesterLabel(users: UserOption[], userId: string): string {
  if (userId === ADMIN_WALLET_ID) return 'Ví tổng Admin (doanh thu 20%)';
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
    return () => {
      unsubRows();
      unsubUsers();
    };
  }, []);

  const pendingCount = rows.filter((row) => row.status === 'PENDING_ADMIN').length;

  const filteredRows = rows.filter((row) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'DONE' ? row.status === 'APPROVED' || row.status === 'PAID' : row.status === statusFilter);
    if (!matchesStatus) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    const requester = requesterLabel(users, row.userId);
    return (
      row.id.toLowerCase().includes(q) ||
      requester.toLowerCase().includes(q) ||
      (row.accountHolder ?? '').toLowerCase().includes(q) ||
      (row.accountNumber ?? '').toLowerCase().includes(q) ||
      (row.bank ?? row.method ?? '').toLowerCase().includes(q) ||
      String(row.amount).includes(q)
    );
  });

  // Only ever a status change on the request doc — nothing to reserve or
  // refund, since a withdrawal request never debits a balance counter up
  // front (there isn't one). "Available to withdraw" is always computed
  // live from cashbackLedger, so a REJECTED request naturally leaves the
  // requester's balance untouched with zero extra bookkeeping here.
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
                  <td>{requesterLabel(users, row.userId)}</td>
                  <td><strong>{formatCurrency(row.amount, lang)}</strong></td>
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
                    {(row.status === 'REJECTED' || row.status === 'PAID') && (
                      <span className="muted-copy">Đã xử lý</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted-copy">Không tìm thấy yêu cầu rút tiền phù hợp.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">
        Dữ liệu thật từ Firestore (collection <code>withdrawalRequests</code>), gồm cả lệnh rút của khách hàng và lệnh
        rút doanh thu 20% của Admin (đánh dấu &quot;Ví tổng Admin&quot;). Chưa tích hợp API ngân hàng/ví thật — Admin
        luôn cần chuyển khoản thủ công rồi bấm &quot;Đã thanh toán&quot;. Từ chối một lệnh không cần hoàn tiền thủ công:
        số dư luôn được tính trực tiếp từ lịch sử đã <code>RELEASED</code> trừ các lệnh đã <code>PAID</code>, nên một
        lệnh bị từ chối trước khi thanh toán không hề làm mất tiền của người rút.
      </p>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)}>
        {rejectTarget && (
          <>
            <div className="modal-header-row">
              <span className="promo-icon-badge" style={{ width: 40, height: 40, background: '#fee2e2', color: '#dc2626' }}>✕</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Từ chối lệnh rút</h3>
                <span className="modal-code-row-small">{requesterLabel(users, rejectTarget.userId)} • {formatCurrency(rejectTarget.amount, lang)}</span>
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
