'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { AppShell } from '../../components/layout/AppShell';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { OrderThumb } from '../../components/ui/OrderThumb';
import { CopyIdChip } from '../../components/ui/CopyIdChip';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { useAuth } from '../../lib/auth';
import { getFirebaseDb } from '../../lib/firebase';
import { PLATFORM_LABEL, type Platform } from '../../lib/orderEntry';
import { recordRedirectHit } from '../../lib/redirectLink';
import { subscribeSystemRates, DEFAULT_RATES, ASSUMED_ORDER_VALUE, type SystemRates } from '../../lib/systemConfig';
import { usePageTitle } from '../../lib/use-page-title';

type RedirectDoc = {
  id: string;
  platform: Platform;
  title?: string;
  image?: string;
  price?: number;
  destinationUrl: string;
  status: 'ACTIVE' | 'EXPIRED' | 'SUPERSEDED';
  hitCount?: number;
  createdAt?: { toDate: () => Date };
  lastHitAt?: { toDate: () => Date };
  expiresAt?: { toDate: () => Date };
};

export default function LinkHistoryPage() {
  const { t, lang } = useLanguage();
  usePageTitle(t('link_history_title'));
  const { uid } = useAuth();
  const [links, setLinks] = useState<RedirectDoc[]>([]);
  const [rates, setRates] = useState<SystemRates>(DEFAULT_RATES);
  const [query_, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');

  useEffect(() => subscribeSystemRates(setRates), []);

  useEffect(() => {
    if (!uid) {
      setLinks([]);
      return;
    }
    const q = query(collection(getFirebaseDb(), 'redirectCache'), where('userId', '==', uid), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setLinks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as RedirectDoc)));
    });
    return unsubscribe;
  }, [uid]);

  const rows = useMemo(() => {
    const platformRate: Record<Platform, number> = {
      SHOPEE: rates.shopeeRate,
      TIKTOK_SHOP: rates.tiktokRate,
      LAZADA: rates.lazadaRate,
    };
    const now = Date.now();
    return links.map((item) => {
      const expiresAtMs = item.expiresAt?.toDate?.().getTime() ?? 0;
      // SUPERSEDED means a newer code replaced this one for the same
      // product — practically the same as expired from the customer's
      // point of view, so both render with the same "hết hạn" badge.
      const isExpired = item.status !== 'ACTIVE' || now > expiresAtMs;
      const estimatedCashback = Math.round((item.price ?? ASSUMED_ORDER_VALUE) * (platformRate[item.platform] ?? 0));
      return { ...item, isExpired, estimatedCashback };
    });
  }, [links, rates]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const platformName = PLATFORM_LABEL[row.platform] ?? row.platform;
      const matchesQuery =
        (row.title ?? '').toLowerCase().includes(query_.toLowerCase()) || row.id.toLowerCase().includes(query_.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || platformName === platformFilter;
      return matchesQuery && matchesPlatform;
    });
  }, [rows, query_, platformFilter]);

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
        <div className="page-shell">
          <div className="page-header">
            <div>
              <span className="eyebrow dark">{t('link_history_eyebrow')}</span>
              <h1>{t('link_history_title')}</h1>
            </div>
          </div>
          <p className="muted-copy" style={{ marginTop: -8 }}>{t('link_history_desc')}</p>

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

          <div className="panel order-table-panel" style={{ marginTop: 16 }}>
            <div className="table-scroll">
              <table className="data-table order-data-table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Hoàn tiền dự kiến</th>
                    <th>Trạng thái</th>
                    <th>Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((item) => {
                    const platformName = PLATFORM_LABEL[item.platform] ?? item.platform;
                    return (
                      <tr key={item.id}>
                        <td className="order-table-product-cell">
                          <div className="order-table-product">
                            <OrderThumb imageUrl={item.image} platform={platformName} size={36} />
                            <div className="order-table-product-info">
                              <div className="order-card-tags">
                                <span className="order-card-platform">{platformName}</span>
                                <CopyIdChip value={item.id} />
                              </div>
                              <strong className="order-table-product-name">
                                {item.title || `Sản phẩm liên kết qua ${platformName}`}
                              </strong>
                              {item.hitCount !== undefined && (
                                <span className="muted-copy" style={{ fontSize: '0.78rem' }}>
                                  {item.hitCount} {t('link_history_hit_count')}
                                  {item.lastHitAt ? ` · ${t('link_history_last_hit')}: ${item.lastHitAt.toDate().toLocaleDateString('vi-VN')}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="order-table-cashback-cell">
                          <strong className="order-card-cashback">
                            {item.price ? '' : '~'}{formatCurrency(item.estimatedCashback, lang)}
                          </strong>
                        </td>
                        <td className="order-table-status-cell">
                          <span className={item.isExpired ? 'order-pill danger' : 'order-pill success'}>
                            ● {item.isExpired ? t('link_history_status_expired') : t('link_history_status_active')}
                          </span>
                        </td>
                        <td>
                          {!item.isExpired && (
                            <a
                              href={item.destinationUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="button button-secondary order-card-view"
                              onClick={() => recordRedirectHit(item.id)}
                            >
                              🛒 {t('get_link_buy_now')}
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted-copy">
                        {rows.length === 0 ? t('link_history_empty') : t('order_empty')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          {/* Sàn không cho đọc giá thật của sản phẩm (đã kiểm chứng: kể cả
              qua dịch vụ render JS ngoài cũng bị chặn) — số có dấu ~ chỉ là
              ước tính tham khảo, không phải số tiền hoàn thật của đơn đó. */}
          <p className="muted-copy" style={{ fontSize: '0.78rem', marginTop: 10 }}>
            Số có dấu ~ là ước tính tham khảo (chưa đọc được giá thật sản phẩm) — số tiền hoàn thật được tính lại chính xác khi đơn hàng được đối soát.
          </p>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
