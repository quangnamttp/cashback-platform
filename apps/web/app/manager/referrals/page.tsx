'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AdminShell } from '../../../components/layout/AdminShell';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';
import { getFirebaseDb } from '../../../lib/firebase';
import { usePageTitle } from '../../../lib/use-page-title';

type LedgerEntry = {
  id: string;
  userId: string;
  orderId?: string;
  amount: number;
  status: 'FROZEN' | 'RELEASED' | 'REJECTED';
  confirmedAt?: { toDate: () => Date };
};

type UserOption = { id: string; fullName?: string; email?: string };
type OrderOption = { id: string; userId: string; orderValue: number };

function userLabel(users: UserOption[], userId: string): string {
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

export default function AdminReferralsPage() {
  usePageTitle('Theo dõi giới thiệu bạn bè');
  const { lang } = useLanguage();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubLedger = onSnapshot(
      query(collection(db, 'cashbackLedger'), where('type', '==', 'REFERRAL_BONUS'), orderBy('confirmedAt', 'desc')),
      (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry))),
    );
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserOption)));
    });
    const unsubOrders = onSnapshot(collection(db, 'orders'), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderOption)));
    });
    return () => {
      unsubLedger();
      unsubUsers();
      unsubOrders();
    };
  }, []);

  const rows = useMemo(() => {
    return entries.map((entry) => {
      const order = orders.find((o) => o.id === entry.orderId);
      return {
        entry,
        referrer: userLabel(users, entry.userId),
        referred: order ? userLabel(users, order.userId) : '—',
        purchase: order?.orderValue ?? 0,
      };
    });
  }, [entries, orders, users]);

  const filtered = useMemo(() => {
    return rows.filter(({ entry, referrer, referred }) => {
      if (filter !== 'ALL' && entry.status !== filter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        entry.id.toLowerCase().includes(q) ||
        (entry.orderId ?? '').toLowerCase().includes(q) ||
        referrer.toLowerCase().includes(q) ||
        referred.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, searchQuery]);

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Giới thiệu</span>
          <h1>Theo dõi giới thiệu bạn bè</h1>
        </div>
      </div>

      <AdminSearchToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Tìm theo người giới thiệu, người được giới thiệu, mã đơn..."
        filterValue={filter}
        onFilterChange={setFilter}
        filterOptions={FILTERS}
        resultCount={filtered.length}
        resultLabel="thưởng"
      />

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Người giới thiệu</th>
                <th>Người được giới thiệu</th>
                <th>Giá trị đơn</th>
                <th>Thưởng</th>
                <th>Trạng thái</th>
                <th>Mã đơn</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="muted-copy">Chưa có khoản thưởng giới thiệu nào.</td>
                </tr>
              ) : (
                filtered.map(({ entry, referrer, referred, purchase }) => (
                  <tr key={entry.id}>
                    <td>{referrer}</td>
                    <td>{referred}</td>
                    <td>{purchase > 0 ? formatCurrency(purchase, lang) : '—'}</td>
                    <td>{formatCurrency(entry.amount, lang)}</td>
                    <td><span className={`badge ${STATUS_BADGE[entry.status]}`}>{STATUS_LABEL[entry.status]}</span></td>
                    <td>{entry.orderId ? <CopyIdChip value={entry.orderId} /> : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}
