'use client';

import { useMemo, useState } from 'react';
import { mockOrderRows } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { Modal } from '../../components/ui/Modal';
import { useLanguage } from '../../lib/i18n';
import { RequireAuth } from '../../components/layout/RequireAuth';

const statusKeyMap: Record<string, string> = {
  CONFIRMED: 'status_confirmed',
  PENDING: 'status_pending',
  REFUNDED: 'status_rejected',
  CANCELLED: 'status_rejected',
};

const statusPillClass: Record<string, string> = {
  CONFIRMED: 'order-pill success',
  PENDING: 'order-pill warning',
  REFUNDED: 'order-pill danger',
  CANCELLED: 'order-pill danger',
};

export default function OrdersPage() {
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [activeOrder, setActiveOrder] = useState<(typeof mockOrderRows)[number] | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    return mockOrderRows.filter((row) => {
      const matchesQuery =
        row.product.toLowerCase().includes(query.toLowerCase()) ||
        row.id.toLowerCase().includes(query.toLowerCase());
      const matchesPlatform = platformFilter === 'all' || row.platform === platformFilter;
      return matchesQuery && matchesPlatform;
    });
  }, [query, platformFilter]);

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
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)} className="order-filter-select">
            <option value="all">{t('order_filter_all')}</option>
            <option value="Shopee">Shopee</option>
            <option value="TikTok Shop">TikTok Shop</option>
            <option value="Lazada">Lazada</option>
          </select>
        </div>

        <div className="order-card-list">
          {filtered.map((item) => (
            <div key={item.id} className="order-card">
              <div className="order-card-main">
                <PlatformBadge name={item.platform} size={44} />
                <div className="order-card-info">
                  <div className="order-card-tags">
                    <span className="order-card-platform">{item.platform}</span>
                    <span className="order-card-id">#{item.id}</span>
                  </div>
                  <h3>{item.product}</h3>
                  <a href={item.linkUrl} target="_blank" rel="noreferrer" className="order-card-link">
                    {t('order_product_link')} ↗
                  </a>
                </div>
              </div>

              <div className="order-card-side">
                <div className="order-card-cashback">+{item.cashback.toLocaleString('vi-VN')} xu</div>
                <span className={statusPillClass[item.status] ?? 'order-pill'}>
                  ● {t(statusKeyMap[item.status] as any) || item.status}
                </span>
                <span className="order-card-date">{item.date} {item.time}</span>
              </div>

              <button className="button button-secondary order-card-view" onClick={() => setActiveOrder(item)}>
                👁 {t('order_view')}
              </button>
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="muted-copy">{t('order_empty')}</p>
          )}
        </div>
      </div>

      <Modal open={!!activeOrder} onClose={() => setActiveOrder(null)}>
        {activeOrder && (
          <>
            <div className="modal-header-row">
              <span className="order-card-platform">{activeOrder.platform}</span>
              <span className="order-card-id">#{activeOrder.id}</span>
            </div>

            <div className="modal-amount-box">
              <div>
                <div className="amount-label">{t('order_product_link') === 'Link mua hàng' ? 'Hoàn tiền' : 'Cashback'}</div>
                <div className="amount-value">+{activeOrder.cashback.toLocaleString('vi-VN')} xu</div>
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
                  <span>{activeOrder.date} {activeOrder.time}</span>
                </div>
              </div>
              <div style={{ display: 'flex' }}>
                <div className="modal-timeline-line" />
              </div>
              <div className="modal-timeline-item">
                <div className="modal-timeline-dot">✓</div>
                <div className="modal-timeline-content">
                  <strong>{t(statusKeyMap[activeOrder.status] as any) || activeOrder.status}</strong>
                  <span>{activeOrder.date} {activeOrder.time}</span>
                </div>
              </div>
            </div>

            <a href={activeOrder.linkUrl} target="_blank" rel="noreferrer" className="button button-primary modal-cta">
              🛒 {t('modal_buy_again')}
            </a>
          </>
        )}
      </Modal>
    </AppShell>
    </RequireAuth>
  );
}
