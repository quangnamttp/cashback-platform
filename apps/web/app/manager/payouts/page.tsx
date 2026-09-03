'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { logAdminAction } from '../../../lib/adminAudit';
import { ADMIN_WALLET_ID, type LedgerEntryType } from '../../../lib/orderEntry';
import { syncCashbackStatusToTelegram } from '../../../lib/telegram';
import { creditWalletBalance } from '../../../lib/walletBalance';
import { AdminShell } from '../../../components/layout/AdminShell';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';
import { usePageTitle } from '../../../lib/use-page-title';

const PAYOUT_TYPE_FILTERS = [
  { value: 'all', label: 'Tất cả loại khoản' },
  { value: 'CUSTOMER_CASHBACK', label: 'Cashback khách hàng' },
  { value: 'REFERRAL_BONUS', label: 'Thưởng giới thiệu' },
  { value: 'PLATFORM_REVENUE', label: 'Doanh thu 20% (Admin)' },
];

type LedgerEntry = {
  id: string;
  userId: string;
  orderId?: string;
  amount: number;
  type?: LedgerEntryType;
  status: 'FROZEN' | 'RELEASED' | 'REJECTED';
  confirmedAt?: { toDate: () => Date };
  requesterName?: string;
  requesterEmail?: string;
  telegramChatId?: string | null;
  telegramMessageId?: number | null;
};

const TYPE_LABEL: Record<LedgerEntryType, string> = {
  CUSTOMER_CASHBACK: 'Cashback khách hàng',
  REFERRAL_BONUS: 'Thưởng giới thiệu',
  PLATFORM_REVENUE: 'Doanh thu 20% (Admin)',
};

type UserOption = { id: string; fullName?: string; email?: string };

// Previously returned the raw uid for every real customer (only
// ADMIN_WALLET_ID had a real label) — this table had no way to show who a
// held commission actually belongs to without opening Firestore directly.
function ownerLabel(users: UserOption[], userId: string): string {
  if (userId === ADMIN_WALLET_ID) return 'Ví tổng Admin';
  const user = users.find((u) => u.id === userId);
  if (!user) return userId;
  return user.fullName || user.email || userId;
}

// No time gate, no amount tiering — every held commission sits in this one
// queue and Admin decides case by case when to release it. That's a
// deliberate choice: a hard-coded wait risks losing customers who feel
// stalled, so the human judgment call replaces any rule here (both in the
// UI and in firestore.rules).
export default function AdminPayoutsPage() {
  usePageTitle('Duyệt hoàn tiền chờ giải phóng');
  const { lang } = useLanguage();
  const { uid, userEmail } = useAuth();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<'approve' | 'reject' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubEntries = onSnapshot(query(collection(db, 'cashbackLedger'), where('status', '==', 'FROZEN')), (snap) => {
      setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LedgerEntry)));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserOption)));
    });
    return () => {
      unsubEntries();
      unsubUsers();
    };
  }, []);

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      return (
        entry.id.toLowerCase().includes(q) ||
        (entry.orderId ?? '').toLowerCase().includes(q) ||
        ownerLabel(users, entry.userId).toLowerCase().includes(q) ||
        String(entry.amount).includes(q)
      );
    });
  }, [entries, users, searchQuery, typeFilter]);

  const allSelected = filteredEntries.length > 0 && filteredEntries.every((e) => selectedIds.has(e.id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(filteredEntries.map((e) => e.id)));
  };

  // Bulk decision on the ledger — a single writeBatch per click (chunked
  // at 450 to stay under Firestore's 500-op cap), no per-entry re-read
  // since everything needed is already in the onSnapshot list in state.
  const decideSelected = async (decision: 'RELEASED' | 'REJECTED') => {
    const targets = entries.filter((e) => selectedIds.has(e.id));
    if (!uid || targets.length === 0) return;
    setBulkBusy(decision === 'RELEASED' ? 'approve' : 'reject');
    try {
      const db = getFirebaseDb();
      for (let i = 0; i < targets.length; i += 450) {
        const chunk = targets.slice(i, i + 450);
        const batch = writeBatch(db);
        chunk.forEach((entry) => {
          batch.update(doc(db, 'cashbackLedger', entry.id), {
            status: decision,
            releasedBy: uid,
            releasedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      // Credits walletBalances/{uid}.available for every entry that just
      // became withdrawable — the server-side ceiling withdrawalRequests/
      // create checks (see lib/walletBalance.ts). ADMIN_WALLET is skipped:
      // its withdrawals are a separate, admin-only 20%-of-ledger
      // calculation on /manager/wallet that never reserves against this
      // counter, so crediting it here would just accumulate a number
      // nothing ever reads.
      if (decision === 'RELEASED') {
        await Promise.all(
          targets
            .filter((entry) => entry.userId !== ADMIN_WALLET_ID)
            .map((entry) => creditWalletBalance(entry.userId, entry.amount)),
        );
      }
      // Keeps the Telegram buttons in sync when admin decides from the web
      // instead of tapping them in Telegram — otherwise those buttons
      // would still look tappable for an already-settled entry. Only
      // CUSTOMER_CASHBACK entries ever get a Telegram message (see
      // addCommissionLedgerEntries in lib/orderEntry.ts), so entries
      // without a saved telegramChatId/messageId are silently skipped.
      targets.forEach((entry) => {
        if (entry.telegramChatId && entry.telegramMessageId) {
          syncCashbackStatusToTelegram(
            { chatId: entry.telegramChatId, messageId: entry.telegramMessageId },
            {
              requesterName: entry.requesterName || ownerLabel(users, entry.userId),
              requesterEmail: entry.requesterEmail || users.find((u) => u.id === entry.userId)?.email || '—',
              orderId: entry.orderId || '—',
              amount: entry.amount,
              amountLabel: formatCurrency(entry.amount, lang),
              ledgerId: entry.id,
            },
            decision === 'RELEASED' ? 'approved' : 'rejected',
          );
        }
      });
      await logAdminAction({
        actorUid: uid,
        actorEmail: userEmail,
        action: decision === 'RELEASED' ? 'releaseLedgerBatch' : 'rejectLedgerBatch',
        targetType: 'cashbackLedger',
        targetId: 'bulk',
        metadata: { count: targets.length },
      });
      setSelectedIds(new Set());
    } catch (err) {
      console.error('bulk ledger decision failed', err);
    } finally {
      setBulkBusy(null);
    }
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Duyệt hoàn tiền</span>
          <h1>Duyệt hoàn tiền chờ giải phóng</h1>
        </div>
      </div>

      <div className="panel admin-table-panel">
        <div className="panel-header">
          <h3>Đang giữ, chờ Admin quyết định</h3>
          <span className="badge badge-warning">{entries.length} khoản</span>
        </div>

        <AdminSearchToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Tìm theo mã khoản, mã đơn, tên người dùng..."
          filterValue={typeFilter}
          onFilterChange={setTypeFilter}
          filterOptions={PAYOUT_TYPE_FILTERS}
          resultCount={filteredEntries.length}
          resultLabel="khoản"
        />

        {filteredEntries.length > 0 && (
          <div className="admin-action-row" style={{ marginBottom: 10, alignItems: 'center' }}>
            <span className="muted-copy">{selectedIds.size} đã chọn</span>
            <button
              className="btn-approve"
              disabled={selectedIds.size === 0 || bulkBusy !== null}
              onClick={() => decideSelected('RELEASED')}
            >
              {bulkBusy === 'approve' ? 'Đang giải phóng...' : `✓ Duyệt hàng loạt (${selectedIds.size})`}
            </button>
            <button
              className="btn-reject"
              disabled={selectedIds.size === 0 || bulkBusy !== null}
              onClick={() => decideSelected('REJECTED')}
            >
              {bulkBusy === 'reject' ? 'Đang từ chối...' : `✕ Từ chối (${selectedIds.size})`}
            </button>
          </div>
        )}

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Chọn tất cả" disabled={filteredEntries.length === 0} />
                </th>
                <th>Mã khoản</th>
                <th>Người dùng</th>
                <th>Loại khoản</th>
                <th>Đơn hàng</th>
                <th>Số tiền</th>
                <th>Xác nhận lúc</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(entry.id)}
                      onChange={() => toggleSelected(entry.id)}
                      aria-label={`Chọn khoản ${entry.id}`}
                    />
                  </td>
                  <td><CopyIdChip value={entry.id} /></td>
                  <td>{ownerLabel(users, entry.userId)}</td>
                  <td>{entry.type ? TYPE_LABEL[entry.type] : '—'}</td>
                  <td>{entry.orderId ? <CopyIdChip value={entry.orderId} /> : '—'}</td>
                  <td><strong>{formatCurrency(entry.amount, lang)}</strong></td>
                  <td>{entry.confirmedAt ? entry.confirmedAt.toDate().toLocaleString('vi-VN') : '—'}</td>
                </tr>
              ))}
              {filteredEntries.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted-copy">
                    {entries.length === 0 ? 'Không có khoản nào đang chờ duyệt.' : 'Không tìm thấy khoản nào phù hợp.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">
        Không giới hạn thời gian, không phân biệt số tiền lớn/nhỏ — Admin toàn quyền bấm duyệt hoặc từ chối bất cứ lúc
        nào tùy đánh giá thực tế (dùng cột &quot;Xác nhận lúc&quot; để tự cân nhắc đơn nào nên đợi thêm). Duyệt sẽ
        chuyển khoản này sang trạng thái đã giải phóng — số dư &quot;sẵn sàng rút&quot; của người dùng luôn tính trực
        tiếp từ tổng các khoản <code>cashbackLedger</code> đã <code>RELEASED</code>, không lưu bộ đếm riêng nên không
        thể bị lệch/giả mạo.
      </p>
    </AdminShell>
  );
}
