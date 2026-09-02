'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { logAdminAction } from '../../../lib/adminAudit';
import { AdminShell } from '../../../components/layout/AdminShell';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { usePageTitle } from '../../../lib/use-page-title';

const DEVICE_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang hoạt động' },
  { value: 'REVOKED', label: 'Đã đăng xuất' },
];

const STALE_WINDOW_MS = 24 * 60 * 60 * 1000;

type Session = {
  id: string;
  userId: string;
  deviceType: 'mobile' | 'desktop';
  status: 'ACTIVE' | 'REVOKED';
  userAgent?: string | null;
  lastSeenAt?: { toDate: () => Date };
};

export default function AdminDevicesPage() {
  usePageTitle('Phiên đăng nhập thiết bị');
  const { uid, userEmail } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    const q = query(collection(getFirebaseDb(), 'sessions'), orderBy('lastSeenAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Session)));
    });
    return unsubscribe;
  }, []);

  const forceLogout = async (sessionDocId: string) => {
    if (!uid) return;
    setBusyId(sessionDocId);
    try {
      await updateDoc(doc(getFirebaseDb(), 'sessions', sessionDocId), { status: 'REVOKED', sessionToken: null });
      await logAdminAction({
        actorUid: uid,
        actorEmail: userEmail,
        action: 'forceLogoutSession',
        targetType: 'session',
        targetId: sessionDocId,
      });
    } catch (err) {
      console.error('forceLogoutSession failed', err);
    } finally {
      setBusyId(null);
    }
  };

  const staleSessions = useMemo(
    () =>
      sessions.filter((s) => {
        if (s.status !== 'ACTIVE') return false;
        const millis = s.lastSeenAt?.toDate?.().getTime();
        return typeof millis === 'number' && Date.now() - millis > STALE_WINDOW_MS;
      }),
    [sessions],
  );

  // Session docs never expire on their own (see lib/auth.tsx) — every test
  // login (including QA runs) leaves a permanent ACTIVE row unless someone
  // revokes it by hand. One-click bulk revoke for everything that hasn't
  // been seen in 24h, instead of clicking "Đăng xuất" one row at a time.
  const cleanupStaleSessions = async () => {
    if (staleSessions.length === 0) return;
    setCleaning(true);
    try {
      const db = getFirebaseDb();
      const batch = writeBatch(db);
      staleSessions.forEach((s) => batch.update(doc(db, 'sessions', s.id), { status: 'REVOKED', sessionToken: null }));
      await batch.commit();
      if (uid) {
        await logAdminAction({
          actorUid: uid,
          actorEmail: userEmail,
          action: `bulkCleanupStaleSessions:${staleSessions.length}`,
          targetType: 'session',
          targetId: 'bulk',
        });
      }
    } catch (err) {
      console.error('bulk cleanup stale sessions failed', err);
    } finally {
      setCleaning(false);
    }
  };

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => {
      if (statusFilter !== 'all' && session.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        session.id.toLowerCase().includes(q) ||
        session.userId.toLowerCase().includes(q) ||
        (session.userAgent ?? '').toLowerCase().includes(q)
      );
    });
  }, [sessions, searchQuery, statusFilter]);

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Kiểm soát phiên thiết bị</span>
          <h1>Phiên đăng nhập thiết bị</h1>
        </div>
        {staleSessions.length > 0 && (
          <button className="button button-secondary" disabled={cleaning} onClick={cleanupStaleSessions}>
            {cleaning ? 'Đang dọn...' : `🧹 Dọn ${staleSessions.length} phiên quá 24h không hoạt động`}
          </button>
        )}
      </div>

      <AdminSearchToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Tìm theo mã phiên, uid người dùng, trình duyệt..."
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={DEVICE_FILTER_OPTIONS}
        resultCount={filteredSessions.length}
        resultLabel="phiên"
      />

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã phiên</th>
                <th>Người dùng (uid)</th>
                <th>Loại thiết bị</th>
                <th>Trình duyệt / thiết bị</th>
                <th>Hoạt động gần nhất</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((session) => (
                <tr key={session.id}>
                  <td><CopyIdChip value={session.id} /></td>
                  <td>{session.userId}</td>
                  <td>{session.deviceType === 'mobile' ? '📱 Di động' : '🖥️ Máy tính'}</td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={session.userAgent ?? ''}>
                    {session.userAgent ?? '—'}
                  </td>
                  <td>{session.lastSeenAt ? session.lastSeenAt.toDate().toLocaleString('vi-VN') : '—'}</td>
                  <td>
                    {session.status === 'ACTIVE' ? (
                      <span className="badge badge-success">Đang hoạt động</span>
                    ) : (
                      <span className="badge badge-neutral">Đã đăng xuất</span>
                    )}
                  </td>
                  <td>
                    {session.status === 'ACTIVE' && (
                      <button className="btn-reject" disabled={busyId === session.id} onClick={() => forceLogout(session.id)}>
                        Đăng xuất
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredSessions.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted-copy">
                    {sessions.length === 0 ? 'Chưa có phiên đăng nhập nào được ghi nhận.' : 'Không tìm thấy phiên nào phù hợp.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">
        Mỗi trình duyệt/app là một phiên riêng — đăng nhập cùng tài khoản trên Chrome, Edge, hay vừa app vừa web trên
        điện thoại đều chạy song song, không tự đăng xuất lẫn nhau. Hệ thống không có cách phân biệt chắc chắn &quot;trình
        duyệt khác trên cùng máy&quot; với &quot;một máy hoàn toàn khác&quot;, nên không tự động khóa bất kỳ trường hợp
        nào — nút &quot;Đăng xuất&quot; ở đây dành cho việc Admin chủ động buộc một phiên cụ thể đăng xuất khi thấy đáng ngờ.
      </p>
    </AdminShell>
  );
}
