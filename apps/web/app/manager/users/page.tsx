'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, type Timestamp } from 'firebase/firestore';
import { AdminShell } from '../../../components/layout/AdminShell';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { Modal } from '../../../components/ui/Modal';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';
import { getFirebaseDb } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { logAdminAction } from '../../../lib/adminAudit';
import { usePageTitle } from '../../../lib/use-page-title';

const USER_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'SUSPENDED', label: 'Tạm khóa' },
  { value: 'LOCKED', label: 'Đã khóa' },
];

type AdminUserRow = {
  id: string;
  fullName?: string;
  email?: string;
  phone?: string | null;
  birthday?: string | null;
  status?: 'ACTIVE' | 'SUSPENDED' | 'LOCKED';
  role?: string;
  createdAt?: Timestamp;
};

type LedgerRow = { userId: string; amount: number; status: string };
type WithdrawalRow = { userId: string; amount: number; status: string };

const statusBadge: Record<string, string> = {
  ACTIVE: 'badge-success',
  SUSPENDED: 'badge-warning',
  LOCKED: 'badge-danger',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Đang hoạt động',
  SUSPENDED: 'Tạm khóa',
  LOCKED: 'Đã khóa',
};

export default function AdminUsersPage() {
  usePageTitle('Người dùng');
  const { lang } = useLanguage();
  const { uid, userEmail } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailUserId, setDetailUserId] = useState<string | null>(null);

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminUserRow)));
    });
    // Balances are never a stored counter now — always summed live from the
    // ledger + paid withdrawals, so this list can't drift from reality.
    const unsubLedger = onSnapshot(collection(db, 'cashbackLedger'), (snap) => {
      setLedger(snap.docs.map((d) => d.data() as LedgerRow));
    });
    const unsubWithdrawals = onSnapshot(collection(db, 'withdrawalRequests'), (snap) => {
      setWithdrawals(snap.docs.map((d) => d.data() as WithdrawalRow));
    });
    return () => {
      unsubUsers();
      unsubLedger();
      unsubWithdrawals();
    };
  }, []);

  const balancesByUser = useMemo(() => {
    const map: Record<string, { available: number; lifetime: number }> = {};
    ledger.forEach((entry) => {
      const row = (map[entry.userId] ??= { available: 0, lifetime: 0 });
      if (entry.status === 'RELEASED') {
        row.available += entry.amount;
        row.lifetime += entry.amount;
      } else if (entry.status === 'FROZEN') {
        row.lifetime += entry.amount;
      }
    });
    withdrawals.forEach((wd) => {
      if (wd.status !== 'PAID') return;
      const row = (map[wd.userId] ??= { available: 0, lifetime: 0 });
      row.available -= wd.amount;
    });
    return map;
  }, [ledger, withdrawals]);

  const filtered = useMemo(() => {
    return users
      .filter((user) => {
        const matchesStatus = statusFilter === 'all' || (user.status ?? 'ACTIVE') === statusFilter;
        if (!matchesStatus) return false;
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          (user.fullName ?? '').toLowerCase().includes(q) ||
          (user.email ?? '').toLowerCase().includes(q) ||
          user.id.toLowerCase().includes(q) ||
          (user.phone ?? '').toLowerCase().includes(q)
        );
      })
      // Newest account first — client-side (not a Firestore orderBy) so an
      // account somehow missing createdAt (shouldn't happen for anything
      // created through the real signup flow, but costs nothing to guard)
      // still shows up instead of silently vanishing from the list.
      .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
  }, [users, statusFilter, query]);

  const detailUser = users.find((u) => u.id === detailUserId) ?? null;
  const detailBalance = detailUserId ? (balancesByUser[detailUserId] ?? { available: 0, lifetime: 0 }) : null;

  const setStatus = async (id: string, status: 'ACTIVE' | 'LOCKED') => {
    if (!uid) return;
    setBusyId(id);
    try {
      await updateDoc(doc(getFirebaseDb(), 'users', id), { status });
      await logAdminAction({ actorUid: uid, actorEmail: userEmail, action: `adminSetUserStatus:${status}`, targetType: 'user', targetId: id });
    } catch (err) {
      console.error('setStatus failed', err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Quản lý người dùng</span>
          <h1>Người dùng</h1>
        </div>
      </div>

      <AdminSearchToolbar
        query={query}
        onQueryChange={setQuery}
        placeholder="Tìm theo mã người dùng, tên, email, SĐT..."
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={USER_STATUS_FILTER_OPTIONS}
        resultCount={filtered.length}
        resultLabel="người dùng"
      />

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Email</th>
                <th>SĐT</th>
                <th>Ngày tạo tài khoản</th>
                <th>Vai trò</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName || '—'}</td>
                  <td>{user.email || '—'}</td>
                  <td>{user.phone || '—'}</td>
                  <td>{user.createdAt ? user.createdAt.toDate().toLocaleDateString('vi-VN') : '—'}</td>
                  <td>
                    {user.role === 'admin' ? <span className="badge badge-neutral">Quản trị viên</span> : <span className="muted-copy">Người dùng</span>}
                  </td>
                  <td><span className={`badge ${statusBadge[user.status ?? 'ACTIVE']}`}>{STATUS_LABEL[user.status ?? 'ACTIVE']}</span></td>
                  <td>
                    <div className="admin-action-row">
                      <button className="button button-secondary" onClick={() => setDetailUserId(user.id)}>👁 Chi tiết</button>
                      {(user.status ?? 'ACTIVE') !== 'ACTIVE' ? (
                        <button className="btn-approve" disabled={busyId === user.id} onClick={() => setStatus(user.id, 'ACTIVE')}>Mở khóa</button>
                      ) : (
                        <button className="btn-reject" disabled={busyId === user.id} onClick={() => setStatus(user.id, 'LOCKED')}>Khóa</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted-copy">
                    {users.length === 0 ? 'Chưa có người dùng nào.' : 'Không tìm thấy người dùng nào phù hợp.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">
        Dữ liệu thật từ Firestore. Không còn Admin SDK nên &quot;Khóa&quot; chỉ đánh dấu trạng thái — ứng dụng tự đăng
        xuất tài khoản đó ở mọi tab đang mở, nhưng về lý thuyết tài khoản vẫn có thể đăng nhập lại từ nơi khác nếu họ
        cố tình bỏ qua cảnh báo. Số dư luôn tính trực tiếp từ lịch sử <code>cashbackLedger</code>, không lưu bộ đếm
        riêng nên không thể bị lệch/giả mạo — xem chi tiết theo từng khách ở trang Cashback / Hoa hồng.
      </p>

      <Modal open={!!detailUserId} onClose={() => setDetailUserId(null)}>
        {detailUser && detailBalance && (
          <>
            <h3 style={{ marginTop: 0 }}>{detailUser.fullName || detailUser.email || 'Người dùng'}</h3>
            <div className="modal-field-list">
              <div className="modal-field-row">
                <span>Mã người dùng (UID)</span>
                <span className="modal-code-row">
                  {detailUserId}
                  <CopyIdChip value={detailUserId!} />
                </span>
              </div>
              <div className="modal-field-row">
                <span>Email</span>
                <span>{detailUser.email || '—'}</span>
              </div>
              <div className="modal-field-row">
                <span>SĐT</span>
                <span>{detailUser.phone || '—'}</span>
              </div>
              <div className="modal-field-row">
                <span>Ngày sinh</span>
                <span>{detailUser.birthday || '—'}</span>
              </div>
              <div className="modal-field-row">
                <span>Ngày tạo tài khoản</span>
                <span>{detailUser.createdAt ? detailUser.createdAt.toDate().toLocaleString('vi-VN') : '—'}</span>
              </div>
              <div className="modal-field-row">
                <span>Số dư khả dụng</span>
                <span>{formatCurrency(detailBalance.available, lang)}</span>
              </div>
              <div className="modal-field-row">
                <span>Tổng hoàn tiền (lũy kế)</span>
                <span>{formatCurrency(detailBalance.lifetime, lang)}</span>
              </div>
            </div>
          </>
        )}
      </Modal>
    </AdminShell>
  );
}
