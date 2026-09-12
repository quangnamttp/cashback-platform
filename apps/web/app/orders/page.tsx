'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AppShell } from '../../components/layout/AppShell';
import { OrderThumb } from '../../components/ui/OrderThumb';
import { Modal } from '../../components/ui/Modal';
import { CopyIdChip } from '../../components/ui/CopyIdChip';
import { useLanguage } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { getFirebaseDb } from '../../lib/firebase';
import { computeCommissionSplit, PLATFORM_LABEL, type OrderStatus, type Platform } from '../../lib/orderEntry';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { usePageTitle } from '../../lib/use-page-title';

type OrderDoc = {
  id: string;
  platform: Platform;
  productName: string;
  productUrl?: string | null;
  imageUrl?: string | null;
  orderValue: number;
  commissionAmount: number;
  status: OrderStatus;
  orderDate?: { toDate: () => Date };
  confirmedAt?: { toDate: () => Date };
  // Set once at approval time (see lib/orderEntry.ts's approveOrdersBatch
  // / workers/telegram-bot's tryClaimOrderStatus) — the earliest moment
  // step ④ below can activate. Absent on any order approved before this
  // field existed, or on a MANUAL order approved that way originally —
  // deriveOrderTimelineStep treats a missing value as "not yet known",
  // never as "already eligible".
  eligibleAt?: { toMillis: () => number };
  // Only meaningful for source:'AFFILIATE' — the affiliate network's own
  // verdict on the commission, independent of this order's own status.
  // Absent/undefined for a MANUAL order (no such upstream concept), which
  // deriveOrderTimelineStep treats as "nothing to wait on".
  commissionStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  source?: 'MANUAL' | 'AFFILIATE';
  // Set by lib/orderEntry.ts's upsertOrder when a REFUNDED order had
  // cashback that needed clawing back — customer-visible so a return
  // doesn't look like it silently kept a cashback it never really settled.
  cashbackClawback?: 'FROZEN_REJECTED' | 'RELEASED_FLAGGED';
};

const statusKeyMap: Record<OrderStatus, string> = {
  CONFIRMED: 'status_confirmed',
  PENDING: 'status_pending',
  REFUNDED: 'status_rejected',
  CANCELLED: 'status_rejected',
};

const statusPillClass: Record<OrderStatus, string> = {
  CONFIRMED: 'order-pill success',
  PENDING: 'order-pill warning',
  REFUNDED: 'order-pill danger',
  CANCELLED: 'order-pill danger',
};

// The 5-step customer timeline (section 4 of the "hoàn thiện nghiệp vụ"
// request) — neutral language only, no ACCESSTRADE/Sub-ID/FROZEN/APPROVED
// ever shown. Steps ①② both complete the instant an order is visible at
// all (a PENDING AFFILIATE order is invisible by design — see
// firestore.rules — so there's no earlier customer-visible state to show
// separately for step ① alone). ③→④ needs BOTH the fixed eligibleAt
// timestamp AND (for an AFFILIATE order only) the network's own commission
// approval — a MANUAL order has no such upstream concept, so it's treated
// as always satisfied for that part. ⑤ is the ledger's own RELEASED
// status, the one moment real money actually reaches the wallet.
type TimelineStep = 1 | 2 | 3 | 4 | 5;

function deriveOrderTimelineStep(order: OrderDoc, ledgerStatus: 'FROZEN' | 'RELEASED' | 'REJECTED' | undefined): TimelineStep {
  if (ledgerStatus === 'RELEASED') return 5;
  const eligibleAtMs = order.eligibleAt?.toMillis?.() ?? null;
  const commissionOk = order.source !== 'AFFILIATE' || order.commissionStatus === 'APPROVED';
  if (eligibleAtMs !== null && Date.now() >= eligibleAtMs && commissionOk && ledgerStatus === 'FROZEN') return 4;
  return 3;
}

const TIMELINE_LABELS: Record<TimelineStep, string> = {
  1: 'Đơn hàng đã được ghi nhận',
  2: 'Đơn hàng đã được xác nhận',
  3: 'Đang chờ hoàn tiền',
  4: 'Đủ điều kiện hoàn tiền',
  5: '💰 Tiền hoàn đã vào ví',
};

export default function OrdersPage() {
  const { t, lang } = useLanguage();
  const { uid } = useAuth();
  usePageTitle(t('orders_title'));
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [ledgerByOrder, setLedgerByOrder] = useState<Record<string, { amount: number; status: 'FROZEN' | 'RELEASED' | 'REJECTED' }>>({});
  const [hasReferrer, setHasReferrer] = useState(false);
  const [query_, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [activeOrder, setActiveOrder] = useState<OrderDoc | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!uid) {
      setOrders([]);
      return;
    }
    // customerVisible=true is enforced server-side too (firestore.rules'
    // orders match block) — an AFFILIATE order still awaiting Admin review
    // is not returned by this query at all (not just hidden by this page),
    // so there's no client-side filtering of anything sensitive here.
    const q = query(
      collection(getFirebaseDb(), 'orders'),
      where('userId', '==', uid),
      where('customerVisible', '==', true),
      orderBy('orderDate', 'desc'),
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OrderDoc)));
    });
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setLedgerByOrder({});
      setHasReferrer(false);
      return;
    }
    const db = getFirebaseDb();
    const unsubLedger = onSnapshot(
      query(collection(db, 'cashbackLedger'), where('userId', '==', uid), where('type', '==', 'CUSTOMER_CASHBACK')),
      (snap) => {
        const map: Record<string, { amount: number; status: 'FROZEN' | 'RELEASED' | 'REJECTED' }> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { orderId: string; amount: number; status: 'FROZEN' | 'RELEASED' | 'REJECTED' };
          const prev = map[data.orderId];
          map[data.orderId] = { amount: (prev?.amount ?? 0) + data.amount, status: data.status };
        });
        setLedgerByOrder(map);
      },
    );
    const unsubUser = onSnapshot(doc(db, 'users', uid), (snap) => {
      setHasReferrer(!!snap.data()?.referredBy);
    });
    return () => {
      unsubLedger();
      unsubUser();
    };
  }, [uid]);

  const cashbackFor = (order: OrderDoc) =>
    ledgerByOrder[order.id]?.amount ?? computeCommissionSplit(order.commissionAmount, hasReferrer).customerAmount;

  const filtered = useMemo(() => {
    return orders.filter((row) => {
      const platformName = PLATFORM_LABEL[row.platform] ?? row.platform;
      const matchesQuery =
        row.productName.toLowerCase().includes(query_.toLowerCase()) ||
        row.id.toLowerCase().includes(query_.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || platformName === platformFilter;
      return matchesQuery && matchesPlatform;
    });
  }, [orders, query_, platformFilter]);

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('orders_eyebrow')}</span>
            <h1>{t('orders_title')}</h1>
          </div>
        </div>

        <div className="order-toolbar">
          <div className="order-search">
            <span>🔍</span>
            <input
              placeholder={t('order_search_placeholder')}
              value={query_}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="order-filter-select">
            <option value="all">{t('order_filter_all')}</option>
            <option value="Shopee">Shopee</option>
            <option value="TikTok Shop">TikTok Shop</option>
            <option value="Lazada">Lazada</option>
          </select>
          <button type="button" className="button button-primary order-search-btn">🔍 Tìm kiếm</button>
        </div>

        <div className="panel order-table-panel">
          <div className="table-scroll">
            <table className="data-table order-data-table">
              <thead>
                <tr>
                  <th>Thông tin sản phẩm</th>
                  <th>Tiền hoàn</th>
                  <th>Trạng thái &amp; Ngày tạo</th>
                  <th>Hành động</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const platformName = PLATFORM_LABEL[item.platform] ?? item.platform;
                  const date = item.orderDate?.toDate();
                  return (
                    <tr key={item.id}>
                      <td className="order-table-product-cell">
                        <div className="order-table-product">
                          <OrderThumb imageUrl={item.imageUrl} platform={platformName} size={36} />
                          <div className="order-table-product-info">
                            <div className="order-card-tags">
                              <span className="order-card-platform">{platformName}</span>
                              <CopyIdChip value={item.id} />
                            </div>
                            <strong className="order-table-product-name">{item.productName}</strong>
                            {item.productUrl && (
                              <a href={item.productUrl} target="_blank" rel="noreferrer" className="order-card-link">
                                {t('order_product_link')} ↗
                              </a>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="order-table-cashback-cell">
                        <strong className="order-card-cashback">+{cashbackFor(item).toLocaleString('vi-VN')} đ</strong>
                      </td>
                      <td className="order-table-status-cell">
                        <span className={statusPillClass[item.status] ?? 'order-pill'}>
                          ● {t(statusKeyMap[item.status] as any) || item.status}
                        </span>
                        {item.status === 'CONFIRMED' && (
                          <div className="muted-copy" style={{ fontSize: '0.75rem', marginTop: 3 }}>
                            {TIMELINE_LABELS[deriveOrderTimelineStep(item, ledgerByOrder[item.id]?.status)]}
                          </div>
                        )}
                        <div className="order-table-date">{date ? date.toLocaleString('vi-VN') : '—'}</div>
                        {item.cashbackClawback && (
                          <div className="muted-copy" style={{ fontSize: '0.75rem', color: '#dc2626', marginTop: 4 }}>
                            ⚠️ Đơn hàng #{item.id} đã được xác nhận trả hàng. Khoản cashback của đơn hàng này sẽ được thu hồi.
                          </div>
                        )}
                      </td>
                      <td>
                        <button className="button button-secondary order-card-view" onClick={() => setActiveOrder(item)}>
                          👁 {t('order_view')}
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted-copy">{t('order_empty')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal open={!!activeOrder} onClose={() => setActiveOrder(null)}>
        {activeOrder && (
          <>
            <div className="modal-header-row">
              <span className="order-card-platform">{PLATFORM_LABEL[activeOrder.platform] ?? activeOrder.platform}</span>
              <span className="order-card-id">#{activeOrder.id}</span>
            </div>

            <h3 style={{ marginTop: 8, marginBottom: 0 }}>{activeOrder.productName}</h3>

            <div className="modal-amount-box">
              <div>
                <div className="amount-label">Hoàn tiền</div>
                <div className="amount-value">+{cashbackFor(activeOrder).toLocaleString('vi-VN')} đ</div>
              </div>
              <span style={{ fontSize: '1.6rem' }}>💰</span>
            </div>

            <div className="modal-field-list">
              <div className="modal-field-row">
                <span>Giá trị đơn</span>
                <span>{activeOrder.orderValue.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="modal-field-row">
                <span>Hoa hồng thực tế</span>
                <span>{activeOrder.commissionAmount.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="modal-field-row">
                <span>{t('tbl_status')}</span>
                <span>{t(statusKeyMap[activeOrder.status] as any) || activeOrder.status}</span>
              </div>
              <div className="modal-field-row">
                <span>{t('tbl_id')}</span>
                <span className="modal-code-row">
                  {activeOrder.id}
                  <button className="modal-copy-icon-btn" onClick={() => copyCode(activeOrder.id)} title="Copy">
                    {copied ? '✓' : '📋'}
                  </button>
                </span>
              </div>
            </div>

            <div className="modal-timeline-title">{t('modal_timeline_title')}</div>
            {activeOrder.status === 'CONFIRMED' ? (
              (() => {
                const currentStep = deriveOrderTimelineStep(activeOrder, ledgerByOrder[activeOrder.id]?.status);
                const eligibleDate = activeOrder.eligibleAt?.toMillis ? new Date(activeOrder.eligibleAt.toMillis()) : null;
                return (
                  <div>
                    {([1, 2, 3, 4, 5] as TimelineStep[]).map((step) => {
                      const done = step <= currentStep;
                      return (
                        <div key={step}>
                          <div className="modal-timeline-item">
                            <div className="modal-timeline-dot">{done ? '✓' : step}</div>
                            <div className="modal-timeline-content">
                              <strong>{TIMELINE_LABELS[step]}</strong>
                              {step === 1 && (
                                <span>{activeOrder.orderDate ? activeOrder.orderDate.toDate().toLocaleString('vi-VN') : '—'}</span>
                              )}
                              {step === 2 && (
                                <span>{activeOrder.confirmedAt ? activeOrder.confirmedAt.toDate().toLocaleString('vi-VN') : '—'}</span>
                              )}
                              {step === 3 && currentStep === 3 && eligibleDate && (
                                <span>Dự kiến đủ điều kiện: {eligibleDate.toLocaleString('vi-VN')}</span>
                              )}
                            </div>
                          </div>
                          {step < 5 && (
                            <div style={{ display: 'flex' }}>
                              <div className="modal-timeline-line" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              <div>
                <div className="modal-timeline-item">
                  <div className="modal-timeline-dot">＋</div>
                  <div className="modal-timeline-content">
                    <strong>{t('modal_timeline_recorded')}</strong>
                    <span>{activeOrder.orderDate ? activeOrder.orderDate.toDate().toLocaleString('vi-VN') : '—'}</span>
                  </div>
                </div>
                <div style={{ display: 'flex' }}>
                  <div className="modal-timeline-line" />
                </div>
                <div className="modal-timeline-item">
                  <div className="modal-timeline-dot">✓</div>
                  <div className="modal-timeline-content">
                    <strong>{t(statusKeyMap[activeOrder.status] as any) || activeOrder.status}</strong>
                    <span>{activeOrder.orderDate ? activeOrder.orderDate.toDate().toLocaleString('vi-VN') : '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {activeOrder.productUrl && (
              <a href={activeOrder.productUrl} target="_blank" rel="noreferrer" className="button button-primary modal-cta">
                🛒 {t('modal_buy_again')}
              </a>
            )}
          </>
        )}
      </Modal>
    </AppShell>
    </RequireAuth>
  );
}
