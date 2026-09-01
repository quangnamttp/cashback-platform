'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { AdminShell } from '../../../components/layout/AdminShell';
import { OrderThumb } from '../../../components/ui/OrderThumb';
import { PlatformIcon } from '../../../components/ui/PlatformIcons';
import { AdminSearchToolbar } from '../../../components/ui/AdminSearchToolbar';
import { CopyIdChip } from '../../../components/ui/CopyIdChip';
import { useLanguage } from '../../../lib/i18n';
import { formatCurrency } from '../../../lib/currency';
import { getFirebaseDb } from '../../../lib/firebase';
import {
  approveOrdersBatch,
  computeCommissionSplit,
  ORDER_STATUS_LABEL,
  PLATFORM_LABEL,
  rejectOrdersBatch,
  upsertOrder,
  type OrderStatus,
  type Platform,
} from '../../../lib/orderEntry';
import { usePageTitle } from '../../../lib/use-page-title';

const PLATFORM_OPTIONS: { value: Platform; label: string }[] = [
  { value: 'SHOPEE', label: 'Shopee' },
  { value: 'TIKTOK_SHOP', label: 'TikTok Shop' },
  { value: 'LAZADA', label: 'Lazada' },
];

type OrderRow = {
  id: string;
  userId: string;
  platform: Platform;
  productName: string;
  productUrl?: string | null;
  imageUrl?: string | null;
  orderValue: number;
  commissionAmount: number;
  status: OrderStatus;
  orderDate?: { toDate: () => Date };
};

type UserOption = { id: string; fullName?: string; email?: string; referredBy?: string | null };

function userLabel(users: UserOption[], userId: string): string {
  const user = users.find((u) => u.id === userId);
  if (!user) return userId;
  return user.fullName || user.email || userId;
}

const statusBadge: Record<OrderStatus, string> = {
  CONFIRMED: 'badge-success',
  PENDING: 'badge-warning',
  REFUNDED: 'badge-danger',
  CANCELLED: 'badge-danger',
};

const ORDER_FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'PENDING', label: 'Chờ duyệt' },
  { value: 'CONFIRMED', label: 'Đã cộng ví' },
  { value: 'CANCELLED', label: 'Từ chối' },
  { value: 'REFUNDED', label: 'Thu hồi' },
];

const EMPTY_FORM = {
  userId: '',
  platform: 'SHOPEE' as Platform,
  productName: '',
  productUrl: '',
  imageUrl: '',
  orderValue: '',
  commissionAmount: '',
  status: 'PENDING' as OrderStatus,
};

export default function AdminOrdersPage() {
  usePageTitle('Tất cả đơn hàng');
  const { lang } = useLanguage();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [userQuery, setUserQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<'approve' | 'reject' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    const db = getFirebaseDb();
    const unsubOrders = onSnapshot(query(collection(db, 'orders'), orderBy('orderDate', 'desc')), (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderRow)));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as UserOption)));
    });
    return () => {
      unsubOrders();
      unsubUsers();
    };
  }, []);

  const matchingUsers = useMemo(() => {
    if (!userQuery.trim()) return [];
    const q = userQuery.toLowerCase();
    return users.filter((u) => (u.fullName ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q)).slice(0, 6);
  }, [users, userQuery]);

  const selectedUser = users.find((u) => u.id === form.userId);

  // Live preview only — the real split is (re)computed server-... well,
  // client-side-but-authoritatively in orderEntry.ts at approval time,
  // this just shows the admin what to expect before they commit.
  const formSplitPreview = useMemo(
    () => computeCommissionSplit(Number(form.commissionAmount) || 0, !!selectedUser?.referredBy),
    [form.commissionAmount, selectedUser],
  );

  const pendingOrders = useMemo(() => orders.filter((o) => o.status === 'PENDING'), [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const platformLabel = PLATFORM_LABEL[item.platform] ?? item.platform;
      return (
        item.id.toLowerCase().includes(q) ||
        userLabel(users, item.userId).toLowerCase().includes(q) ||
        item.productName.toLowerCase().includes(q) ||
        platformLabel.toLowerCase().includes(q) ||
        String(item.orderValue).includes(q) ||
        String(item.commissionAmount).includes(q)
      );
    });
  }, [orders, users, searchQuery, statusFilter]);
  const allPendingSelected = pendingOrders.length > 0 && pendingOrders.every((o) => selectedIds.has(o.id));

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllPending = () => {
    setSelectedIds(allPendingSelected ? new Set() : new Set(pendingOrders.map((o) => o.id)));
  };

  const approveSelected = async () => {
    const targets = pendingOrders.filter((o) => selectedIds.has(o.id));
    if (targets.length === 0) return;
    setBulkBusy('approve');
    try {
      await approveOrdersBatch(targets.map((o) => ({ id: o.id, userId: o.userId, commissionAmount: o.commissionAmount })));
      setSelectedIds(new Set());
    } catch (err) {
      console.error('bulk approve failed', err);
    } finally {
      setBulkBusy(null);
    }
  };

  const rejectSelected = async () => {
    const targetIds = pendingOrders.filter((o) => selectedIds.has(o.id)).map((o) => o.id);
    if (targetIds.length === 0) return;
    setBulkBusy('reject');
    try {
      await rejectOrdersBatch(targetIds);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('bulk reject failed', err);
    } finally {
      setBulkBusy(null);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setUserQuery('');
  };

  const submitNewOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.userId) return;
    setSubmitting(true);
    try {
      await upsertOrder({
        userId: form.userId,
        platform: form.platform,
        productName: form.productName,
        productUrl: form.productUrl,
        imageUrl: form.imageUrl,
        orderValue: Number(form.orderValue) || 0,
        commissionAmount: Number(form.commissionAmount) || 0,
        status: form.status,
      });
      resetForm();
      setShowForm(false);
    } catch (err) {
      console.error('create order failed', err);
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (order: OrderRow, status: OrderStatus) => {
    setBusyId(order.id);
    try {
      await upsertOrder({
        orderId: order.id,
        userId: order.userId,
        platform: order.platform,
        productName: order.productName,
        productUrl: order.productUrl ?? undefined,
        imageUrl: order.imageUrl ?? undefined,
        orderValue: order.orderValue,
        commissionAmount: order.commissionAmount,
        status,
      });
    } catch (err) {
      console.error('update order status failed', err);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell>
      <div className="page-header">
        <div>
          <span className="eyebrow dark">Đơn hàng</span>
          <h1>Tất cả đơn hàng</h1>
        </div>
        <button className="button button-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Đóng' : '+ Nhập đơn hàng'}
        </button>
      </div>

      <div className="sv-platform-tabs" style={{ marginBottom: 16 }}>
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          ⏳ Chờ duyệt{pendingOrders.length > 0 ? ` (${pendingOrders.length})` : ''}
        </button>
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>
          📋 Tất cả đơn hàng
        </button>
      </div>

      {tab === 'pending' && (
      <div className="panel admin-table-panel" style={{ marginBottom: 16 }}>
        <div className="panel-header">
          <h3>⏳ Chờ duyệt</h3>
          <span className="badge badge-warning">{pendingOrders.length} khoản</span>
        </div>

        {pendingOrders.length > 0 && (
          <div className="admin-action-row" style={{ marginBottom: 10, alignItems: 'center' }}>
            <span className="muted-copy">{selectedIds.size} đã chọn</span>
            <button
              className="btn-approve"
              disabled={selectedIds.size === 0 || bulkBusy !== null}
              onClick={approveSelected}
            >
              {bulkBusy === 'approve' ? 'Đang duyệt...' : `✓ Duyệt hàng loạt (${selectedIds.size})`}
            </button>
            <button
              className="btn-reject"
              disabled={selectedIds.size === 0 || bulkBusy !== null}
              onClick={rejectSelected}
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
                  <input
                    type="checkbox"
                    checked={allPendingSelected}
                    onChange={toggleSelectAllPending}
                    aria-label="Chọn tất cả"
                    disabled={pendingOrders.length === 0}
                  />
                </th>
                <th>Người dùng</th>
                <th>Mã đơn</th>
                <th>Hoa hồng</th>
                <th>Dự kiến phân bổ (khách / giới thiệu / ví admin)</th>
                <th>Thời gian tạo</th>
              </tr>
            </thead>
            <tbody>
              {pendingOrders.map((order) => {
                const orderUser = users.find((u) => u.id === order.userId);
                const split = computeCommissionSplit(order.commissionAmount, !!orderUser?.referredBy);
                return (
                  <tr key={order.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(order.id)}
                        onChange={() => toggleSelected(order.id)}
                        aria-label={`Chọn đơn ${order.id}`}
                      />
                    </td>
                    <td>{userLabel(users, order.userId)}</td>
                    <td><CopyIdChip value={order.id} /></td>
                    <td><strong>{formatCurrency(order.commissionAmount, lang)}</strong></td>
                    <td className="muted-copy">
                      {formatCurrency(split.customerAmount, lang)}
                      {split.hasReferrer ? ` / ${formatCurrency(split.referrerAmount, lang)}` : ' / —'}
                      {' / '}
                      {formatCurrency(split.platformAmount, lang)}
                    </td>
                    <td>{order.orderDate ? order.orderDate.toDate().toLocaleString('vi-VN') : '—'}</td>
                  </tr>
                );
              })}
              {pendingOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted-copy">Không có khoản nào đang chờ duyệt.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mock-note" style={{ marginTop: 10 }}>
          Duyệt sẽ tự động tính hoa hồng theo tỷ lệ 80/20 (không có người giới thiệu) hoặc 75/5/20 (có người giới
          thiệu) và ghi vào lịch sử của từng người ở trạng thái đang giữ (chưa cộng vào số dư khả dụng) — sang trang
          Duyệt hoàn tiền để Admin quyết định lúc nào giải phóng, không giới hạn thời gian. Từ chối sẽ hủy khoản này,
          không có gì được ghi vào lịch sử. Cả hai đều chạy trong <code>writeBatch</code>, không cần Cloud Functions.
        </p>
      </div>
      )}

      {showForm && (
        <form className="panel order-form" onSubmit={submitNewOrder}>
          <div className="order-form-section">
            <h4 className="order-form-section-title">👤 Khách hàng</h4>
            <div style={{ position: 'relative' }}>
              <label className="field-label">Tìm người dùng</label>
              <input
                placeholder="Tìm theo tên hoặc email..."
                value={selectedUser ? `${selectedUser.fullName || selectedUser.email}` : userQuery}
                onChange={(e) => {
                  setUserQuery(e.target.value);
                  setForm((f) => ({ ...f, userId: '' }));
                }}
                required
              />
              {matchingUsers.length > 0 && !form.userId && (
                <div className="panel" style={{ position: 'absolute', zIndex: 10, width: '100%', marginTop: 4, padding: 6 }}>
                  {matchingUsers.map((u) => (
                    <button
                      type="button"
                      key={u.id}
                      className="text-link"
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 4px' }}
                      onClick={() => {
                        setForm((f) => ({ ...f, userId: u.id }));
                        setUserQuery('');
                      }}
                    >
                      {u.fullName || '(chưa có tên)'} — {u.email}
                    </button>
                  ))}
                </div>
              )}
              {selectedUser && (
                <p className="muted-copy" style={{ fontSize: '0.78rem', marginTop: 6 }}>
                  {selectedUser.referredBy
                    ? `Khách được giới thiệu bằng mã ${selectedUser.referredBy} — áp dụng tỷ lệ 75% khách / 5% người giới thiệu / 20% ví admin.`
                    : 'Khách không có người giới thiệu — áp dụng tỷ lệ 80% khách / 20% ví admin.'}
                </p>
              )}
            </div>
          </div>

          <div className="order-form-divider" />

          <div className="order-form-section">
            <h4 className="order-form-section-title">🛍️ Sản phẩm</h4>

            <span className="field-label">Sàn thương mại</span>
            <div className="order-form-platform-picker">
              {PLATFORM_OPTIONS.map((p) => (
                <button
                  type="button"
                  key={p.value}
                  className={`voucher-platform-option${form.platform === p.value ? ' active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, platform: p.value }))}
                >
                  <PlatformIcon name={p.label} size={32} />
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <label style={{ marginTop: 12 }}>
              <span className="field-label">Tên sản phẩm</span>
              <input value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))} required />
            </label>

            <div className="two-column-grid order-form-tight-grid">
              <label>
                <span className="field-label">Link sản phẩm</span>
                <input
                  type="url"
                  placeholder="https://shopee.vn/..."
                  value={form.productUrl}
                  onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))}
                />
              </label>
              <label>
                <span className="field-label">Ảnh sản phẩm (URL)</span>
                <div className="order-form-image-input-row">
                  <input
                    type="url"
                    placeholder="https://...jpg"
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                  />
                  <div className="order-form-image-preview">
                    <OrderThumb imageUrl={form.imageUrl || null} platform={PLATFORM_LABEL[form.platform]} size={36} />
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="order-form-divider" />

          <div className="order-form-section">
            <h4 className="order-form-section-title">💰 Hoa hồng &amp; trạng thái</h4>
            <div className="two-column-grid">
              <label>
                <span className="field-label">Giá trị đơn (đ)</span>
                <input type="number" min={0} value={form.orderValue} onChange={(e) => setForm((f) => ({ ...f, orderValue: e.target.value }))} required />
              </label>
              <label>
                <span className="field-label">Hoa hồng sàn trả (đ)</span>
                <input type="number" min={0} value={form.commissionAmount} onChange={(e) => setForm((f) => ({ ...f, commissionAmount: e.target.value }))} />
              </label>
            </div>

            {Number(form.commissionAmount) > 0 && (
              <div className="order-form-split-preview">
                <div>
                  <span>Khách hàng</span>
                  <strong>{formatCurrency(formSplitPreview.customerAmount, lang)}</strong>
                </div>
                <div>
                  <span>Người giới thiệu</span>
                  <strong>{formSplitPreview.hasReferrer ? formatCurrency(formSplitPreview.referrerAmount, lang) : '—'}</strong>
                </div>
                <div>
                  <span>Ví tổng Admin</span>
                  <strong>{formatCurrency(formSplitPreview.platformAmount, lang)}</strong>
                </div>
              </div>
            )}

            <label style={{ marginTop: 10, display: 'block' }}>
              <span className="field-label">Trạng thái</span>
              <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as OrderStatus }))}>
                {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((status) => (
                  <option key={status} value={status}>{ORDER_STATUS_LABEL[status]}</option>
                ))}
              </select>
            </label>
          </div>

          <button type="submit" className="button button-primary order-form-submit" disabled={submitting || !form.userId}>
            {submitting ? 'Đang lưu...' : '💾 Lưu đơn hàng'}
          </button>
        </form>
      )}

      {tab === 'all' && (
      <>
      <AdminSearchToolbar
        query={searchQuery}
        onQueryChange={setSearchQuery}
        placeholder="Tìm theo mã đơn, tên khách, tên sản phẩm..."
        filterValue={statusFilter}
        onFilterChange={setStatusFilter}
        filterOptions={ORDER_FILTER_OPTIONS}
        resultCount={filteredOrders.length}
        resultLabel="đơn"
      />

      <div className="panel admin-table-panel">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Người dùng</th>
                <th>Sản phẩm</th>
                <th>Sàn</th>
                <th>Giá trị</th>
                <th>Hoa hồng</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((item) => (
                <tr key={item.id}>
                  <td><CopyIdChip value={item.id} /></td>
                  <td>{userLabel(users, item.userId)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      <span>{item.productName}</span>
                    </div>
                  </td>
                  <td>{PLATFORM_LABEL[item.platform] ?? item.platform}</td>
                  <td>{formatCurrency(item.orderValue, lang)}</td>
                  <td>{formatCurrency(item.commissionAmount, lang)}</td>
                  <td><span className={`badge ${statusBadge[item.status] ?? 'badge-neutral'}`}>{ORDER_STATUS_LABEL[item.status] ?? item.status}</span></td>
                  <td>
                    {item.status === 'CONFIRMED' && (
                      <button className="btn-reject" disabled={busyId === item.id} onClick={() => changeStatus(item, 'REFUNDED')}>Trả hàng</button>
                    )}
                    {item.status !== 'CONFIRMED' && <span className="muted-copy">—</span>}
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="muted-copy">
                    {orders.length === 0 ? 'Chưa có đơn hàng nào — bấm "Nhập đơn hàng" để thêm.' : 'Không tìm thấy đơn hàng phù hợp.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mock-note">
        Dữ liệu thật từ Firestore. Đơn mới nhập luôn ở trạng thái &quot;Chờ duyệt&quot; — dùng khu vực phía trên để
        duyệt/từ chối. Bấm &quot;Trả hàng&quot; trên đơn đã xác nhận sẽ tự thu hồi các khoản hoa hồng liên quan (khách
        hàng, người giới thiệu, ví admin) và tạo cảnh báo gian lận — toàn bộ đều chạy trong <code>writeBatch</code>,
        không cần Cloud Functions. Xem chi tiết từng khoản đã phân bổ tại trang Cashback / Hoa hồng.
      </p>
      </>
      )}
    </AdminShell>
  );
}
