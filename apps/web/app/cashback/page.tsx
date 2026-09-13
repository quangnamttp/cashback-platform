'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AppShell } from '../../components/layout/AppShell';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { OrderThumb } from '../../components/ui/OrderThumb';
import { ShipmentTracker } from '../../components/ui/ShipmentTracker';
import { CopyIdChip } from '../../components/ui/CopyIdChip';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { useAuth } from '../../lib/auth';
import { getFirebaseDb } from '../../lib/firebase';
import { computeCommissionSplit, PLATFORM_LABEL, type OrderStatus, type Platform } from '../../lib/orderEntry';
import { usePageTitle } from '../../lib/use-page-title';

type OrderDoc = {
  id: string;
  platform: Platform;
  productName: string;
  imageUrl?: string | null;
  commissionAmount: number;
  status: OrderStatus;
  orderDate?: { toDate: () => Date };
};

// This site has no real shipping/logistics API integration — it only ever
// knows the CASHBACK approval pipeline (order.status, then cashbackLedger's
// own status once Admin confirms). The 4 stages below track exactly that,
// nothing about the courier (fixed 2026-09-13: the old version mapped
// CONFIRMED straight to "Đã giao hàng"/Delivered, which is a claim about
// real-world shipping this site cannot verify and was confirmed live to be
// wrong — an order can be CONFIRMED the moment Admin approves it, well
// before the courier has even picked it up).
// CANCELLED (admin rejected before ever confirming) isn't shown here since
// there's no honest progress to depict for it — it still shows up in full
// on the Đơn hàng history page. REFUNDED (a confirmed order the customer
// later returned) IS shown, as its own distinct stopped state — it must
// never simply vanish from this page, since the customer needs to see it
// reflects a real returned order, not a disappeared one.
function deriveCashbackStage(status: OrderStatus, ledgerStatus: string | undefined): number {
  if (status === 'PENDING') return 1; // đang chờ Admin duyệt
  if (status === 'CONFIRMED') return ledgerStatus === 'RELEASED' ? 3 : 2; // đã duyệt, tới khi thực sự hoàn tiền mới lên bước cuối
  return 0;
}

const shippingStatusKeyMap: Record<number, string> = {
  0: 'ship_stage_ordered',
  1: 'ship_stage_preparing',
  2: 'ship_stage_shipping',
  3: 'ship_stage_delivered',
};

const shippingStatusPillClass: Record<number, string> = {
  0: 'order-pill warning',
  1: 'order-pill warning',
  2: 'order-pill warning',
  3: 'order-pill success',
};

export default function CashbackPage() {
  const { t, lang } = useLanguage();
  const { uid } = useAuth();
  usePageTitle(t('sidebar_order_status'));
  const [orders, setOrders] = useState<OrderDoc[]>([]);
  const [ledgerByOrder, setLedgerByOrder] = useState<Record<string, number>>({});
  const [ledgerStatusByOrder, setLedgerStatusByOrder] = useState<Record<string, string>>({});
  const [hasReferrer, setHasReferrer] = useState(false);
  const [query_, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');

  useEffect(() => {
    if (!uid) {
      setOrders([]);
      return;
    }
    // customerVisible=true enforced server-side (firestore.rules) — an
    // AFFILIATE order still awaiting Admin review is never returned here,
    // same as app/orders/page.tsx. The CANCELLED filter below is a
    // separate, purely cosmetic choice (this page has no honest shipping
    // stage to show for a rejected order), unrelated to visibility/security.
    const q = query(
      collection(getFirebaseDb(), 'orders'),
      where('userId', '==', uid),
      where('customerVisible', '==', true),
      orderBy('orderDate', 'desc'),
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as OrderDoc))
        .filter((o) => o.status !== 'CANCELLED');
      setOrders(rows);
    });
    return unsubscribe;
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setLedgerByOrder({});
      setLedgerStatusByOrder({});
      setHasReferrer(false);
      return;
    }
    const db = getFirebaseDb();
    const unsubLedger = onSnapshot(
      query(collection(db, 'cashbackLedger'), where('userId', '==', uid), where('type', '==', 'CUSTOMER_CASHBACK')),
      (snap) => {
        const map: Record<string, number> = {};
        const statusMap: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { orderId: string; amount: number; status: string };
          map[data.orderId] = (map[data.orderId] ?? 0) + data.amount;
          statusMap[data.orderId] = data.status;
        });
        setLedgerByOrder(map);
        setLedgerStatusByOrder(statusMap);
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

  const filteredOrders = useMemo(() => {
    return orders.filter((row) => {
      const platformName = PLATFORM_LABEL[row.platform] ?? row.platform;
      const matchesQuery =
        row.productName.toLowerCase().includes(query_.toLowerCase()) || row.id.toLowerCase().includes(query_.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || platformName === platformFilter;
      return matchesQuery && matchesPlatform;
    });
  }, [orders, query_, platformFilter]);

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
        <div className="page-shell">
          <div className="page-header">
            <div>
              <span className="eyebrow dark">{t('cashback_eyebrow')}</span>
              <h1>{t('sidebar_order_status')}</h1>
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

          <div className="ship-order-list">
            {filteredOrders.map((item) => {
              const platformName = PLATFORM_LABEL[item.platform] ?? item.platform;
              const isRefunded = item.status === 'REFUNDED';
              const stage = deriveCashbackStage(item.status, ledgerStatusByOrder[item.id]);
              const date = item.orderDate?.toDate();
              return (
                <div key={item.id} className="ship-order-card">
                  <div className="order-card-product-row">
                    <OrderThumb imageUrl={item.imageUrl} platform={platformName} size={56} />
                    <div className="order-card-info">
                      <div className="order-card-tags">
                        <span className="order-card-platform">{platformName}</span>
                        <CopyIdChip value={item.id} />
                        <span className="order-card-date">{date ? date.toLocaleDateString('vi-VN') : '—'}</span>
                      </div>
                      <h3>{item.productName}</h3>
                    </div>
                  </div>
                  <div className="ship-order-cashback-row">
                    <div className="order-card-cashback">{formatCurrency(cashbackFor(item), lang)}</div>
                    {isRefunded ? (
                      <span className="order-pill danger">● Đã trả hàng</span>
                    ) : (
                      <span className={shippingStatusPillClass[stage] ?? 'order-pill'}>
                        ● {t(shippingStatusKeyMap[stage] as any)}
                      </span>
                    )}
                  </div>

                  {isRefunded ? (
                    <p className="muted-copy" style={{ marginTop: 4 }}>
                      Đơn hàng này đã được ghi nhận trả hàng — các khoản hoàn tiền/hoa hồng liên quan đã bị thu hồi.
                    </p>
                  ) : (
                    <ShipmentTracker stage={stage} t={t} />
                  )}
                </div>
              );
            })}

            {filteredOrders.length === 0 && (
              <div className="panel empty-state-panel">
                <span className="promo-icon-badge">📦</span>
                <p className="muted-copy">{t('order_empty')}</p>
              </div>
            )}
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
