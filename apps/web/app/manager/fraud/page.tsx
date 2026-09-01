'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { logAdminAction } from '../../../lib/adminAudit';
import { AdminShell } from '../../../components/layout/AdminShell';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { usePageTitle } from '../../../lib/use-page-title';

const FRAUD_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'OPEN', label: 'Chờ xử lý' },
  { value: 'RESOLVED', label: 'Đã xử lý' },
];

type FraudSignal = {
  id: string;
  userId: string;
  orderId?: string;
  signalType?: string;
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
  status: 'OPEN' | 'RESOLVED_LOCKED' | 'RESOLVED_FROZEN' | 'RESOLVED_IGNORED';
};

const STATUS_BY_RESOLUTION: Record<'LOCK' | 'FREEZE' | 'IGNORE', string> = {
  LOCK: 'RESOLVED_LOCKED',
  FREEZE: 'RESOLVED_FROZEN',
  IGNORE: 'RESOLVED_IGNORED',
};

const RISK_LABEL: Record<FraudSignal['riskLevel'], string> = {
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

const STATUS_LABEL: Record<FraudSignal['status'], string> = {
  OPEN: 'Chờ xử lý',
  RESOLVED_LOCKED: 'Đã khóa tài khoản',
  RESOLVED_FROZEN: 'Đã đóng băng',
  RESOLVED_IGNORED: 'Đã bỏ qua',
};

type UserOption = { id: string; fullName?: string; email?: string };

function userLabel(users: UserOption[], userId: string): string {
  const user = users.find((u) => u.id === userId);
  if (!user) return userId;
  return user.fullName || user.email || userId;
}

export default function AdminFraudPage() {
  usePageTitle('Cảnh báo gian lận');
  const { uid, userEmail } = useAuth();
  const [signals, setSignals] = useState<FraudSignal[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubSignals = onSnapshot(query(collection(db, 'fraudSignals'), orderBy('createdAt', 'desc')), (snap) => {
      setSignals(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FraudSignal)));
      setLoading(false);
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserOption)));
    });
    return () => {
      unsubSignals();
      unsubUsers();
    };
  }, []);

  // No Admin SDK anymore, so LOCK/FREEZE only ever set users/{uid}.status —
  // enforced client-side in lib/auth.tsx (forces sign-out when LOCKED),
  // not a true Firebase Auth account disable. Never automatic — only ever
  // triggered by an admin clicking one of these buttons.
  const resolve = async (signal: FraudSignal, resolution: 'LOCK' | 'FREEZE' | 'IGNORE') => {
    if (!uid) return;
    setBusyId(signal.id);
    try {
      const db = getFirebaseDb();
      const batch = writeBatch(db);
      batch.update(doc(db, 'fraudSignals', signal.id), {
        status: STATUS_BY_RESOLUTION[resolution],
        resolvedBy: uid,
        resolvedAt: serverTimestamp(),
      });
      if (resolution === 'FREEZE') {
        batch.update(doc(db, 'users', signal.userId), { status: 'SUSPENDED' });
      } else if (resolution === 'LOCK') {
        batch.update(doc(db, 'users', signal.userId), { status: 'LOCKED' });
      }
      await batch.commit();
      await logAdminAction({
        actorUid: uid,
        actorEmail: userEmail,
        action: `resolveFraudSignal:${resolution}`,
        targetType: 'fraudSignal',
        targetId: signal.id,
        metadata: { userId: signal.userId },
      });
    } catch (err) {
      console.error('resolve fraud signal failed', err);
    } finally {
      setBusyId(null);
    }
  };

  const filteredSignals = useMemo(() => {
    return signals.filter((signal) => {
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'OPEN' ? signal.status === 'OPEN' : signal.status !== 'OPEN');
      if (!matchesStatus) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        signal.id.toLowerCase().includes(q) ||
        (signal.orderId ?? '').toLowerCase().includes(q) ||
        signal.userId.toLowerCase().includes(q) ||
        userLabel(users, signal.userId).toLowerCase().includes(q) ||
        signal.reason.toLowerCase().includes(q)
      );
    });
  }, [signals, users, searchQuery, statusFilter]);

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Chống gian lận</span>
          <h1>Cảnh báo gian lận</h1>
        </div>
      </div>

      <AdminSearchToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Tìm theo mã cảnh báo, mã đơn, tên người dùng..."
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={FRAUD_FILTER_OPTIONS}
        resultCount={filteredSignals.length}
        resultLabel="cảnh báo"
      />

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã cảnh báo</th>
                <th>Người dùng</th>
                <th>Đơn hàng</th>
                <th>Lý do</th>
                <th>Mức rủi ro</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredSignals.map((signal) => (
                <tr key={signal.id}>
                  <td><CopyIdChip value={signal.id} /></td>
                  <td>{userLabel(users, signal.userId)}</td>
                  <td>{signal.orderId ? <CopyIdChip value={signal.orderId} /> : '—'}</td>
                  <td>{signal.reason}</td>
                  <td>
                    <span className={`badge badge-${signal.riskLevel === 'HIGH' ? 'danger' : 'warning'}`}>{RISK_LABEL[signal.riskLevel] ?? signal.riskLevel}</span>
                  </td>
                  <td>
                    {signal.status === 'OPEN' ? (
                      <span className="badge badge-warning">{STATUS_LABEL.OPEN}</span>
                    ) : (
                      <span className="badge badge-neutral">{STATUS_LABEL[signal.status] ?? 'Đã xử lý'}</span>
                    )}
                  </td>
                  <td>
                    {signal.status === 'OPEN' && (
                      <div className="admin-action-row">
                        <button className="btn-reject" disabled={busyId === signal.id} onClick={() => resolve(signal, 'LOCK')}>Khóa tài khoản</button>
                        <button className="btn-reject" disabled={busyId === signal.id} onClick={() => resolve(signal, 'FREEZE')}>Đóng băng</button>
                        <button className="btn-approve" disabled={busyId === signal.id} onClick={() => resolve(signal, 'IGNORE')}>Bỏ qua</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && filteredSignals.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted-copy">
                    {signals.length === 0 ? 'Chưa có cảnh báo gian lận nào.' : 'Không tìm thấy cảnh báo nào phù hợp.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">
        Dữ liệu thật từ Firestore (collection <code>fraudSignals</code>) — được tạo ngay khi Admin đánh dấu một đơn đã
        xác nhận chuyển sang trạng thái trả hàng (trang Đơn hàng). Hệ thống không bao giờ tự khóa/đóng băng tài khoản —
        mọi quyết định ở đây đều do Admin bấm thủ công.
      </p>
    </AdminShell>
  );
}
