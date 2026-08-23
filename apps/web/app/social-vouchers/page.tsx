'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { VoucherTicket } from '../../components/ui/VoucherTicket';
import { useLanguage } from '../../lib/i18n';
import { mockSocialVouchers } from '../../lib/mock-data';

const REFRESH_SLOTS = ['00:00', '09:00', '12:00', '15:00', '18:00', '20:00'];

function getNextSlotInfo() {
  const now = new Date();
  const slotsToday = REFRESH_SLOTS.map((slot) => {
    const [h, m] = slot.split(':').map(Number);
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    return { slot, date: d };
  });

  let next = slotsToday.find((s) => s.date.getTime() > now.getTime());
  if (!next) {
    const [h, m] = REFRESH_SLOTS[0].split(':').map(Number);
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(h, m, 0, 0);
    next = { slot: REFRESH_SLOTS[0], date: d };
  }

  const diffMs = next.date.getTime() - now.getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);

  return { nextSlot: next.slot, hours, minutes };
}

const platformGroups = [
  { key: 'fb-ig', label: 'Facebook & Instagram', icon: '📘' },
  { key: 'yt', label: 'YouTube', icon: '▶️' },
];

export default function SocialVouchersPage() {
  const { t } = useLanguage();
  const [activeGroup, setActiveGroup] = useState('fb-ig');
  const [link, setLink] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [countdown, setCountdown] = useState<{ nextSlot: string; hours: number; minutes: number } | null>(null);

  useEffect(() => {
    setCountdown(getNextSlotInfo());
    const id = setInterval(() => setCountdown(getNextSlotInfo()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setRevealed(false);
  }, [link, activeGroup]);

  const filteredVouchers = useMemo(() => {
    if (activeGroup === 'fb-ig') {
      return mockSocialVouchers.filter((v) => v.platform === 'Facebook' || v.platform === 'Instagram');
    }
    return mockSocialVouchers.filter((v) => v.platform === 'YouTube' || v.platform === 'TikTok');
  }, [activeGroup]);

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <section className="sv-hero">
          <div className="sv-hero-text">
            <h1>{t('sv_title')}</h1>
            <p>{t('sv_desc')}</p>
          </div>
          <div className="promo-icon-badge">🎟️</div>
        </section>

        <section className="panel">
          <div className="sv-slot-header">
            <span>⏱ {t('sv_slot_title')}</span>
            {countdown && (
              <span className="sv-countdown">
                {t('sv_next_in')} {countdown.hours}{t('sv_hours')}{countdown.minutes}{t('sv_minutes')}
              </span>
            )}
          </div>

          <div className="sv-slot-grid">
            {REFRESH_SLOTS.map((slot) => (
              <div key={slot} className={`sv-slot-item${countdown?.nextSlot === slot ? ' next' : ''}`}>
                <strong>{slot}</strong>
                <span>{countdown?.nextSlot === slot ? t('sv_slot_next_tag') : t('sv_slot_refresh_tag')}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="sv-platform-tabs">
          {platformGroups.map((group) => (
            <button
              key={group.key}
              className={activeGroup === group.key ? 'active' : ''}
              onClick={() => setActiveGroup(group.key)}
            >
              {group.icon} {group.label}
            </button>
          ))}
        </section>

        <section className="panel">
          <div className="get-link-input-block">
            <label className="field-label" htmlFor="sv-link">{t('sv_link_label')}</label>
            <div className="get-link-input-row">
              <span className="get-link-input-icon">🔗</span>
              <input
                id="sv-link"
                placeholder="https://shopee.vn/..."
                value={link}
                onChange={(event) => setLink(event.target.value)}
              />
              <button type="button" className="get-link-paste-btn" onClick={() => setLink('')}>{t('sv_clear_link')}</button>
            </div>
          </div>
          <button
            className="button button-primary get-link-cta"
            disabled={!link}
            onClick={() => setRevealed(true)}
          >
            🎟️ {t('sv_apply_code')}
          </button>
        </section>

        {revealed && (
          <section>
            <div className="section-header">
              <h2>{t('sv_matched_title')}</h2>
            </div>
            <div className="voucher-ticket-grid">
              {filteredVouchers.map((voucher) => (
                <VoucherTicket key={voucher.code} voucher={voucher} applyLabel={t('sv_use_now')} />
              ))}
            </div>
          </section>
        )}

        <section>
          <div className="section-header">
            <h2>{t('sv_status_title')}</h2>
          </div>

          <div className="voucher-ticket-grid">
            {filteredVouchers.map((voucher) => (
              <VoucherTicket key={voucher.code} voucher={voucher} applyLabel={t('offer_get_code')} />
            ))}
            {filteredVouchers.length === 0 && (
              <p className="muted-copy">{t('sv_empty')}</p>
            )}
          </div>
        </section>

        <p className="mock-note">{t('mock_notice')}</p>
      </div>
    </AppShell>
  );
}
