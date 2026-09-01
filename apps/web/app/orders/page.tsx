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
  commissionAmount: number;
  status: OrderStatus;
  orderDate?: { toDate: () => Date };
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

export default function OrdersPage() {
  const { t, lang } = useLanguage();
  const { uid } = useAuth();
  usePageTitle(t('orders_title'));
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [ledgerByOrder, setLedgerByOrder] = useState<Record<string, number>>({});
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
    const q = query(collection(getFirebaseDb(), 'orders'), where('userId', '==', uid), orderBy('orderDate', 'desc'));
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
        const map: Record<string, number> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { orderId: string; amount: number };
          map[data.orderId] = (map[data.orderId] ?? 0) + data.amount;
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
    ledgerByOrder[order.id] ?? computeCommissionSplit(order.commissionAmount, hasReferrer).customerAmount;

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
                          <OrderThumb imageUrl={item.imageUrl} platform={platformName} size={48} />
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
                        <div className="order-table-date">{date ? date.toLocaleString('vi-VN') : '—'}</div>
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

            <div className="modal-amount-box">
              <div>
                <div className="amount-label">Hoàn tiền</div>
                <div className="amount-value">+{cashbackFor(activeOrder).toLocaleString('vi-VN')} đ</div>
              </div>
              <span style={{ fontSize: '1.6rem' }}>💰</span>
            </div>

            <div className="modal-field-list">
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
