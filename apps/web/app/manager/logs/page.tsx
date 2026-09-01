'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb } from '../../../lib/firebase';
import { AdminShell } from '../../../components/layout/AdminShell';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { usePageTitle } from '../../../lib/use-page-title';

type AuditLog = {
  id: string;
  actorEmail?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  createdAt?: { toDate: () => Date };
};

const ACTION_LABEL: Record<string, string> = {
  adminSetUserStatus: 'Đổi trạng thái người dùng',
  setUserRole: 'Đổi vai trò người dùng',
  resolveFraudSignal: 'Xử lý cảnh báo gian lận',
  forceLogoutSession: 'Buộc đăng xuất phiên',
  adminDecideWithdrawal: 'Xử lý yêu cầu rút tiền',
  releaseLedgerBatch: 'Giải phóng hoàn tiền hàng loạt',
  rejectLedgerBatch: 'Từ chối hoàn tiền hàng loạt',
};

const ACTION_ARG_LABEL: Record<string, string> = {
  ACTIVE: 'mở khóa',
  LOCKED: 'khóa tài khoản',
  admin: 'cấp quyền Admin',
  user: 'gỡ quyền Admin',
  LOCK: 'khóa tài khoản',
  FREEZE: 'đóng băng',
  IGNORE: 'bỏ qua',
  APPROVE: 'duyệt',
  REJECT: 'từ chối',
  MARK_PAID: 'đánh dấu đã chuyển tiền',
};

const TARGET_TYPE_LABEL: Record<string, string> = {
  user: 'Người dùng',
  fraudSignal: 'Cảnh báo gian lận',
  session: 'Phiên đăng nhập',
  withdrawalRequest: 'Yêu cầu rút tiền',
  cashbackLedger: 'Khoản hoàn tiền',
};

function describeAction(action: string): string {
  const [base, arg] = action.split(':');
  const label = ACTION_LABEL[base] ?? base;
  if (!arg) return label;
  return `${label} — ${ACTION_ARG_LABEL[arg] ?? arg}`;
}

const TARGET_TYPE_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả đối tượng' },
  ...Object.entries(TARGET_TYPE_LABEL).map(([value, label]) => ({ value, label })),
];

export default function AdminLogsPage() {
  usePageTitle('Nhật ký hoạt động');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('all');

  useEffect(() => {
    const q = query(collection(getFirebaseDb(), 'adminAuditLogs'), orderBy('createdAt', 'desc'), limit(200));
    const unsubscribe = onSnapshot(q, (snap) => {
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditLog)));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (targetTypeFilter !== 'all' && log.targetType !== targetTypeFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        log.id.toLowerCase().includes(q) ||
        log.targetId.toLowerCase().includes(q) ||
        (log.actorEmail ?? '').toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q)
      );
    });
  }, [logs, searchQuery, targetTypeFilter]);

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Nhật ký</span>
          <h1>Nhật ký hoạt động</h1>
        </div>
      </div>

      <AdminSearchToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Tìm theo mã đối tượng, email admin, hành động..."
        filterValue={targetTypeFilter}
        onFilterChange={setTargetTypeFilter}
        filterOptions={TARGET_TYPE_FILTER_OPTIONS}
        resultCount={filteredLogs.length}
        resultLabel="hoạt động"
      />

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Người thực hiện</th>
                <th>Hành động</th>
                <th>Loại đối tượng</th>
                <th>Mã đối tượng</th>
                <th>Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>{log.actorEmail || '—'}</td>
                  <td>{describeAction(log.action)}</td>
                  <td>{TARGET_TYPE_LABEL[log.targetType] ?? log.targetType}</td>
                  <td><CopyIdChip value={log.targetId} /></td>
                  <td>{log.createdAt ? log.createdAt.toDate().toLocaleString('vi-VN') : '—'}</td>
                </tr>
              ))}
              {!loading && filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted-copy">
                    {logs.length === 0 ? 'Chưa có hoạt động quản trị nào được ghi nhận.' : 'Không tìm thấy hoạt động nào phù hợp.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">
        Dữ liệu thật từ Firestore (collection <code>adminAuditLogs</code>) — tự động ghi lại mỗi khi Admin duyệt/từ
        chối đơn, khóa tài khoản, cấp quyền... Chỉ hiển thị 200 hoạt động gần nhất; dùng chức năng backup ở trang Cấu
        hình để lưu trữ log cũ hơn lên Google Drive rồi dọn khỏi Firestore.
      </p>
    </AdminShell>
  );
}
