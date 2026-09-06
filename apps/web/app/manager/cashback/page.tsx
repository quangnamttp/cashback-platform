'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { AdminShell } from '../../../components/layout/AdminShell';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { Modal } from '../../../components/ui/Modal';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';
import { getFirebaseDb } from '../../../lib/firebase';
import { ADMIN_WALLET_ID, type LedgerEntryType } from '../../../lib/orderEntry';
import { usePageTitle } from '../../../lib/use-page-title';

type LedgerEntry = {
  id: string;
  userId: string;
  orderId?: string;
  amount: number;
  type?: LedgerEntryType;
  status: 'FROZEN' | 'RELEASED' | 'REJECTED';
  confirmedAt?: { toDate: () => Date };
  releasedAt?: { toDate: () => Date };
};

type UserOption = { id: string; fullName?: string; email?: string };

const TYPE_LABEL: Record<LedgerEntryType, string> = {
  CUSTOMER_CASHBACK: 'Cashback khách hàng',
  REFERRAL_BONUS: 'Thưởng giới thiệu',
  PLATFORM_REVENUE: 'Doanh thu 20% (Admin)',
};

function userLabel(users: UserOption[], userId: string): string {
  if (userId === ADMIN_WALLET_ID) return 'Ví tổng Admin';
  const user = users.find((u) => u.id === userId);
  if (!user) return userId;
  return user.fullName || user.email || userId;
}

const STATUS_BADGE: Record<LedgerEntry['status'], string> = {
  FROZEN: 'badge-warning',
  RELEASED: 'badge-success',
  REJECTED: 'badge-danger',
};

const STATUS_LABEL: Record<LedgerEntry['status'], string> = {
  FROZEN: 'Đang giữ',
  RELEASED: 'Đã giải phóng',
  REJECTED: 'Đã từ chối',
};

const FILTERS = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'FROZEN', label: 'Đang giữ' },
  { value: 'RELEASED', label: 'Đã giải phóng' },
  { value: 'REJECTED', label: 'Đã từ chối' },
];

export default function AdminCashbackPage() {
  usePageTitle('Lịch sử cashback toàn hệ thống');
  const { lang } = useLanguage();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'flat' | 'byCustomer'>('byCustomer');
  const [drilldownUserId, setDrilldownUserId] = useState<string | null>(null);

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubLedger = onSnapshot(query(collection(db, 'cashbackLedger'), orderBy('confirmedAt', 'desc')), (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserOption)));
    });
    return () => {
      unsubLedger();
      unsubUsers();
    };
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filter !== 'ALL' && e.status !== filter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        e.id.toLowerCase().includes(q) ||
        (e.orderId ?? '').toLowerCase().includes(q) ||
        userLabel(users, e.userId).toLowerCase().includes(q) ||
        String(e.amount).includes(q)
      );
    });
  }, [entries, users, filter, searchQuery]);

  const totals = useMemo(() => {
    const sum = (status: LedgerEntry['status']) => entries.filter((e) => e.status === status).reduce((acc, e) => acc + e.amount, 0);
    return { frozen: sum('FROZEN'), released: sum('RELEASED') };
  }, [entries]);

  // Per-customer rollup (section 6.A: "Hoàn tiền cho khách" tổng quan) —
  // pure client-side groupBy over the same entries already fetched above,
  // no new reads/writes. Excludes ADMIN_WALLET (that's the platform's own
  // 20% share, not a customer) and only ever reads cashbackLedger — never
  // touches or displays anything from walletBalances/withdrawalRequests, so
  // this can't be confused with (or drift from) the customer's own wallet
  // page's live-summed balance.
  const customerRollup = useMemo(() => {
    const map = new Map<string, { userId: string; released: number; frozen: number; rejected: number; orderIds: Set<string> }>();
    entries.forEach((e) => {
      if (e.userId === ADMIN_WALLET_ID) return;
      if (!map.has(e.userId)) map.set(e.userId, { userId: e.userId, released: 0, frozen: 0, rejected: 0, orderIds: new Set() });
      const row = map.get(e.userId)!;
      if (e.status === 'RELEASED') row.released += e.amount;
      else if (e.status === 'FROZEN') row.frozen += e.amount;
      else if (e.status === 'REJECTED') row.rejected += e.amount;
      if (e.orderId) row.orderIds.add(e.orderId);
    });
    return Array.from(map.values())
      .map((row) => ({ ...row, total: row.released + row.frozen, orderCount: row.orderIds.size }))
      .sort((a, b) => b.total - a.total);
  }, [entries]);

  const filteredCustomerRollup = useMemo(() => {
    if (!searchQuery.trim()) return customerRollup;
    const q = searchQuery.trim().toLowerCase();
    return customerRollup.filter((row) => row.userId.toLowerCase().includes(q) || userLabel(users, row.userId).toLowerCase().includes(q));
  }, [customerRollup, users, searchQuery]);

  const drilldownEntries = useMemo(() => {
    if (!drilldownUserId) return [];
    return entries.filter((e) => e.userId === drilldownUserId).sort((a, b) => (b.confirmedAt?.toDate?.().getTime() ?? 0) - (a.confirmedAt?.toDate?.().getTime() ?? 0));
  }, [entries, drilldownUserId]);

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Cashback / Hoa hồng</span>
          <h1>Lịch sử cashback toàn hệ thống</h1>
        </div>
      </div>

      <div className="stats-grid admin-grid" style={{ marginBottom: 16 }}>
        <div className="stat-card compact">
          <div className="stat-label">Đang giữ (chưa giải phóng)</div>
          <div className="stat-value">{formatCurrency(totals.frozen, lang)}</div>
        </div>
        <div className="stat-card compact">
          <div className="stat-label">Đã giải phóng (toàn hệ thống)</div>
          <div className="stat-value">{formatCurrency(totals.released, lang)}</div>
        </div>
      </div>

      <div className="sv-platform-tabs" style={{ marginBottom: 16 }}>
        <button className={view === 'byCustomer' ? 'active' : ''} onClick={() => setView('byCustomer')}>
          👤 Theo khách hàng
        </button>
        <button className={view === 'flat' ? 'active' : ''} onClick={() => setView('flat')}>
          📋 Theo khoản
        </button>
      </div>

      {view === 'byCustomer' ? (
        <>
          <AdminSearchToolbar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder="Tìm theo tên khách hàng..."
            resultCount={filteredCustomerRollup.length}
            resultLabel="khách hàng"
          />
          <div className="panel admin-table-panel">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Khách hàng</th>
                    <th>Số đơn có cashback</th>
                    <th>Tổng cashback (đã + đang giữ)</th>
                    <th>Đã giải phóng</th>
                    <th>Đang giữ (FROZEN)</th>
                    <th>Bị từ chối/thu hồi</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomerRollup.map((row) => (
                    <tr key={row.userId}>
                      <td>{userLabel(users, row.userId)}</td>
                      <td>{row.orderCount}</td>
                      <td><strong>{formatCurrency(row.total, lang)}</strong></td>
                      <td>{formatCurrency(row.released, lang)}</td>
                      <td>{formatCurrency(row.frozen, lang)}</td>
                      <td>{formatCurrency(row.rejected, lang)}</td>
                      <td>
                        <button className="button button-secondary" onClick={() => setDrilldownUserId(row.userId)}>
                          👁 Chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredCustomerRollup.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted-copy">Không tìm thấy khách hàng nào phù hợp.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mock-note">
            Tổng hợp trực tiếp từ <code>cashbackLedger</code> (nhóm theo khách hàng, tính lại mỗi lần tải trang — không
            lưu số liệu tổng hợp riêng nên luôn khớp thực tế). Bấm &quot;Chi tiết&quot; để xem từng đơn/khoản của một
            khách cụ thể.
          </p>
        </>
      ) : (
        <>
          <AdminSearchToolbar
            query={searchQuery}
            onQueryChange={setSearchQuery}
            placeholder="Tìm theo mã khoản, mã đơn, tên người dùng..."
            filterValue={filter}
            onFilterChange={setFilter}
            filterOptions={FILTERS}
            resultCount={filtered.length}
            resultLabel="khoản"
          />

          <div className="panel admin-table-panel">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Loại khoản</th>
                    <th>Đơn hàng</th>
                    <th>Số tiền</th>
                    <th>Trạng thái</th>
                    <th>Xác nhận lúc</th>
                    <th>Giải phóng/xử lý lúc</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr key={entry.id}>
                      <td>{userLabel(users, entry.userId)}</td>
                      <td>{entry.type ? TYPE_LABEL[entry.type] : '—'}</td>
                      <td>{entry.orderId ? <CopyIdChip value={entry.orderId} /> : '—'}</td>
                      <td><strong>{formatCurrency(entry.amount, lang)}</strong></td>
                      <td><span className={`badge ${STATUS_BADGE[entry.status]}`}>{STATUS_LABEL[entry.status]}</span></td>
                      <td>{entry.confirmedAt ? entry.confirmedAt.toDate().toLocaleString('vi-VN') : '—'}</td>
                      <td>{entry.releasedAt ? entry.releasedAt.toDate().toLocaleString('vi-VN') : '—'}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7} className="muted-copy">Không tìm thấy khoản nào phù hợp.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mock-note">
            Dữ liệu thật, chỉ đọc, từ Firestore (collection <code>cashbackLedger</code>) — xem toàn bộ lịch sử cả những
            khoản đã xử lý xong. Để duyệt/từ chối các khoản đang giữ, dùng trang Duyệt hoàn tiền.
          </p>
        </>
      )}

      <Modal open={!!drilldownUserId} onClose={() => setDrilldownUserId(null)}>
        {drilldownUserId && (
          <>
            <h3 style={{ marginTop: 0 }}>{userLabel(users, drilldownUserId)}</h3>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Đơn hàng</th>
                    <th>Loại khoản</th>
                    <th>Số tiền</th>
                    <th>Trạng thái</th>
                    <th>Ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {drilldownEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.orderId ? <CopyIdChip value={entry.orderId} /> : '—'}</td>
                      <td>{entry.type ? TYPE_LABEL[entry.type] : '—'}</td>
                      <td><strong>{formatCurrency(entry.amount, lang)}</strong></td>
                      <td><span className={`badge ${STATUS_BADGE[entry.status]}`}>{STATUS_LABEL[entry.status]}</span></td>
                      <td>{entry.confirmedAt ? entry.confirmedAt.toDate().toLocaleString('vi-VN') : '—'}</td>
                    </tr>
                  ))}
                  {drilldownEntries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted-copy">Không có khoản nào.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </AdminShell>
  );
}
