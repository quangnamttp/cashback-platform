'use client';

import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { CopyCodeButton } from '../../components/ui/CopyCodeButton';
import { useLanguage } from '../../lib/i18n';

const commissionHistory = [
  { user: 'lan.hoa', platform: 'Shopee', amount: 314, rate: '10%', base: 3143, date: '22/08/2026 07:01' },
  { user: 'thu.mai', platform: 'TikTok Shop', amount: 350, rate: '10%', base: 3500, date: '21/08/2026 09:30' },
  { user: 'bao.tran', platform: 'TikTok Shop', amount: 1588, rate: '10%', base: 15876, date: '21/08/2026 08:30' },
  { user: 'quang.nam', platform: 'Shopee', amount: 197, rate: '10%', base: 1970, date: '20/08/2026 21:12' },
];

const invitedMembers = [
  { user: 'lan.hoa', joined: '30/07/2026', orders: 3, earned: 664 },
  { user: 'thu.mai', joined: '02/08/2026', orders: 1, earned: 350 },
  { user: 'bao.tran', joined: '10/08/2026', orders: 2, earned: 1588 },
];

export default function ReferralsPage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'history' | 'members'>('history');
  const referralLink = 'https://cashback-platform.example/r/REF-MINH-2026';

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <section className="referral-hero">
          <span className="promo-badge light">👥 {t('referrals_eyebrow')}</span>
          <h1>{t('referral_hero_title')}</h1>
          <p>{t('referral_hero_desc')}</p>

          <div className="referral-actions">
            <CopyCodeButton code={referralLink} label={`📋 ${t('referral_copy_link')}`} />
            <button className="button button-secondary">💵 {t('panel_withdraw_btn')}</button>
          </div>

          <div className="referral-rate-box">
            <strong>10%</strong>
            <span>{t('referral_rate_desc')}</span>
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">{t('referral_clicks')}</div>
            <div className="stat-value">37</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('referred_users')}</div>
            <div className="stat-value">10</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('referral_rate_label')}</div>
            <div className="stat-value">10%</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('referral_rewards')}</div>
            <div className="stat-value">26.544đ</div>
          </div>
        </section>

        <section className="panel">
          <div className="referral-tabs">
            <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
              📜 {t('referral_tab_history')}
            </button>
            <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>
              👥 {t('referral_tab_members')}
            </button>
          </div>

          {tab === 'history' ? (
            <div className="referral-list">
              {commissionHistory.map((row) => (
                <div key={`${row.user}-${row.date}`} className="referral-list-row">
                  <div>
                    <strong>{row.user}</strong>
                    <span>{t('referral_commission_from')} {row.platform}</span>
                    <span className="referral-list-meta">{t('offer_min_order').replace('Đơn từ', 'Gốc')} {row.base.toLocaleString('vi-VN')}đ · {row.date}</span>
                  </div>
                  <div className="referral-list-amount">
                    <strong>+{row.amount.toLocaleString('vi-VN')}đ</strong>
                    <span>{row.rate}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="referral-list">
              {invitedMembers.map((m) => (
                <div key={m.user} className="referral-list-row">
                  <div>
                    <strong>{m.user}</strong>
                    <span>{t('referral_joined')} {m.joined}</span>
                    <span className="referral-list-meta">{m.orders} {t('panel_orders').toLowerCase()}</span>
                  </div>
                  <div className="referral-list-amount">
                    <strong>+{m.earned.toLocaleString('vi-VN')}đ</strong>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="mock-note">{t('mock_notice')}</p>
      </div>
    </AppShell>
  );
}
