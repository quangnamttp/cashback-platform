'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { getFirebaseDb } from '../../../lib/firebase';
import { useAuth } from '../../../lib/auth';
import { logAdminAction } from '../../../lib/adminAudit';
import { ADMIN_WALLET_ID, type LedgerEntryType } from '../../../lib/orderEntry';
import { syncCashbackStatusToTelegram } from '../../../lib/telegram';
import { creditWalletBalance } from '../../../lib/walletBalance';
import { AdminShell } from '../../../components/layout/AdminShell';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { Modal } from '../../../components/ui/Modal';
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

type OrderMeta = { source?: string; commissionStatus?: string };

// An AFFILIATE order's commissionAmount at the moment Admin confirms it is
// whatever ACCESSTRADE had reported so far — which can still be their own
// PENDING verdict, not yet APPROVED. Gating this queue (not ledger
// creation itself — that stays exactly as-is, still tied to Admin's own
// CONFIRMED approval) keeps a still-provisional commission from being
// released before ACCESSTRADE has actually confirmed it. A MANUAL order
// (admin-entered commission, no ACCESSTRADE concept at all) is never
// gated — unchanged from before. An order still loading/not found is
// treated as eligible too, so a row never flickers hidden while its order
// doc is still being fetched.
function isEligibleForPayout(entry: LedgerEntry, orderMeta: Record<string, OrderMeta>): boolean {
  if (!entry.orderId) return true;
  const meta = orderMeta[entry.orderId];
  if (!meta) return true;
  if (meta.source !== 'AFFILIATE') return true;
  return meta.commissionStatus === 'APPROVED';
}

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
  const [orderMeta, setOrderMeta] = useState<Record<string, OrderMeta>>({});
  const fetchedOrderIdsRef = useRef<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<'approve' | 'reject' | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
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

  // One-time reads (not a listener) per referenced order — this set is
  // always small (only orderIds behind currently-FROZEN entries), and a
  // commissionStatus flip doesn't need to be instantly live here the way
  // the ledger itself does; re-opening/refreshing this page picks it up.
  useEffect(() => {
    const db = getFirebaseDb();
    const missing = Array.from(new Set(entries.map((e) => e.orderId).filter((id): id is string => !!id))).filter(
      (id) => !fetchedOrderIdsRef.current.has(id),
    );
    if (missing.length === 0) return;
    missing.forEach((id) => fetchedOrderIdsRef.current.add(id));
    missing.forEach((orderId) => {
      getDoc(doc(db, 'orders', orderId))
        .then((snap) => {
          const data = snap.data();
          setOrderMeta((prev) => ({ ...prev, [orderId]: { source: data?.source, commissionStatus: data?.commissionStatus } }));
        })
        .catch(() => setOrderMeta((prev) => ({ ...prev, [orderId]: {} })));
    });
  }, [entries]);

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

  // Split, not filter-out: an AFFILIATE order still awaiting ACCESSTRADE's
  // own commission approval stays visible (Admin can see the money is
  // held and why) but moves to a separate, read-only section below with
  // no checkbox/select — it simply cannot be approved/released from here
  // yet, closing the "customer already sees CONFIRMED but cashback gets
  // released before ACCESSTRADE actually confirmed the commission" gap.
  const payoutReadyEntries = useMemo(
    () => filteredEntries.filter((e) => isEligibleForPayout(e, orderMeta)),
    [filteredEntries, orderMeta],
  );
  const awaitingCommissionEntries = useMemo(
    () => filteredEntries.filter((e) => !isEligibleForPayout(e, orderMeta)),
    [filteredEntries, orderMeta],
  );

  const allSelected = payoutReadyEntries.length > 0 && payoutReadyEntries.every((e) => selectedIds.has(e.id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(payoutReadyEntries.map((e) => e.id)));
  };

  // Bulk decision on the ledger — a single writeBatch per click (chunked
  // at 450 to stay under Firestore's 500-op cap), no per-entry re-read
  // since everything needed is already in the onSnapshot list in state.
  // The isEligibleForPayout re-check here is defense-in-depth (nothing in
  // the UI should ever put an awaiting-commission entry into selectedIds
  // in the first place, since its row has no checkbox) — mirrors this
  // codebase's existing pattern of never trusting client-side selection
  // state alone for a money-releasing action.
  const decideSelected = async (decision: 'RELEASED' | 'REJECTED', reason?: string) => {
    const targets = entries.filter((e) => selectedIds.has(e.id) && isEligibleForPayout(e, orderMeta));
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
            ...(decision === 'REJECTED' ? { rejectionReason: reason || '' } : {}),
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
          <span className="badge badge-warning">{payoutReadyEntries.length} khoản</span>
        </div>

        <AdminSearchToolbar
          query={searchQuery}
          onQueryChange={setSearchQuery}
          placeholder="Tìm theo mã khoản, mã đơn, tên người dùng..."
          filterValue={typeFilter}
          onFilterChange={setTypeFilter}
          filterOptions={PAYOUT_TYPE_FILTERS}
          resultCount={payoutReadyEntries.length}
          resultLabel="khoản"
        />

        {payoutReadyEntries.length > 0 && (
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
              onClick={() => { setRejectReasonInput(''); setShowRejectModal(true); }}
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
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} aria-label="Chọn tất cả" disabled={payoutReadyEntries.length === 0} />
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
              {payoutReadyEntries.map((entry) => (
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
              {payoutReadyEntries.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted-copy">
                    {entries.length === 0 ? 'Không có khoản nào đang chờ duyệt.' : 'Không có khoản nào đủ điều kiện duyệt.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {awaitingCommissionEntries.length > 0 && (
        <div className="panel admin-table-panel" style={{ marginTop: 16 }}>
          <div className="panel-header">
            <h3>Đang chờ ACCESSTRADE xác nhận hoa hồng</h3>
            <span className="badge">{awaitingCommissionEntries.length} khoản</span>
          </div>
          <p className="muted-copy" style={{ marginBottom: 10 }}>
            Các khoản dưới đây thuộc đơn hàng ACCESSTRADE mà Admin đã duyệt, nhưng sàn chưa xác nhận hoa hồng
            (APPROVED) — chưa thể duyệt/giải phóng từ đây để tránh giải phóng nhầm một mức hoa hồng còn tạm tính.
            Tiền vẫn đang được giữ (FROZEN) bình thường, không mất.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mã khoản</th>
                  <th>Người dùng</th>
                  <th>Loại khoản</th>
                  <th>Đơn hàng</th>
                  <th>Số tiền</th>
                  <th>Xác nhận lúc</th>
                </tr>
              </thead>
              <tbody>
                {awaitingCommissionEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td><CopyIdChip value={entry.id} /></td>
                    <td>{ownerLabel(users, entry.userId)}</td>
                    <td>{entry.type ? TYPE_LABEL[entry.type] : '—'}</td>
                    <td>{entry.orderId ? <CopyIdChip value={entry.orderId} /> : '—'}</td>
                    <td><strong>{formatCurrency(entry.amount, lang)}</strong></td>
                    <td>{entry.confirmedAt ? entry.confirmedAt.toDate().toLocaleString('vi-VN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mock-note">
        Không giới hạn thời gian, không phân biệt số tiền lớn/nhỏ — Admin toàn quyền bấm duyệt hoặc từ chối bất cứ lúc
        nào tùy đánh giá thực tế (dùng cột &quot;Xác nhận lúc&quot; để tự cân nhắc đơn nào nên đợi thêm). Duyệt sẽ
        chuyển khoản này sang trạng thái đã giải phóng — số dư &quot;sẵn sàng rút&quot; của người dùng luôn tính trực
        tiếp từ tổng các khoản <code>cashbackLedger</code> đã <code>RELEASED</code>, không lưu bộ đếm riêng nên không
        thể bị lệch/giả mạo.
      </p>

      <Modal open={showRejectModal} onClose={() => setShowRejectModal(false)}>
        <h3 style={{ marginTop: 0 }}>Từ chối {selectedIds.size} khoản hoàn tiền</h3>
        <p className="muted-copy">
          Lý do này sẽ hiện trong thông báo (chuông 🔔) của từng khách hàng liên quan — không bắt buộc, nhưng nên ghi
          rõ để khách hiểu vì sao.
        </p>
        <textarea
          className="support-chat-textarea"
          placeholder="VD: Đơn hàng không hợp lệ / Vi phạm điều khoản / Sàn từ chối ghi nhận hoa hồng..."
          value={rejectReasonInput}
          onChange={(e) => setRejectReasonInput(e.target.value)}
          rows={3}
          style={{ marginTop: 6 }}
        />
        <button
          className="button button-primary modal-cta"
          style={{ background: '#dc2626' }}
          disabled={bulkBusy !== null}
          onClick={async () => {
            await decideSelected('REJECTED', rejectReasonInput.trim());
            setShowRejectModal(false);
          }}
        >
          ✕ Xác nhận từ chối
        </button>
      </Modal>
    </AdminShell>
  );
}
