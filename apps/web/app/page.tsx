'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { AppShell } from '../components/layout/AppShell';
import { PlatformBadge } from '../components/ui/PlatformBadge';
import { PlatformIcon } from '../components/ui/PlatformIcons';
import { EventCarousel } from '../components/ui/EventCarousel';
import { useLanguage } from '../lib/i18n';
import { formatCurrency } from '../lib/currency';
import { useAuth } from '../lib/auth';
import { getFirebaseDb } from '../lib/firebase';
import { mockHomeEvents, mockPlatforms } from '../lib/mock-data';
import { usePageTitle } from '../lib/use-page-title';
import { LinkIcon, BoxIcon, WalletIcon, UsersIcon, HeadsetIcon, BookIcon, GearIcon } from '../components/ui/Icons';

type LedgerEntry = { amount: number; status: 'FROZEN' | 'RELEASED' | 'REJECTED' };
type WithdrawalDoc = { amount: number; status: string };

const GUIDE_STEP_ICONS = ['🔗', '🛍️', '💰'];

const guideSteps = {
  mobile: [
    { title: 'guide_mobile_step1_title', desc: 'guide_mobile_step1_desc' },
    { title: 'guide_mobile_step2_title', desc: 'guide_mobile_step2_desc' },
    { title: 'guide_mobile_step3_title', desc: 'guide_mobile_step3_desc' },
  ],
  desktop: [
    { title: 'guide_desktop_step1_title', desc: 'guide_desktop_step1_desc' },
    { title: 'guide_desktop_step2_title', desc: 'guide_desktop_step2_desc' },
    { title: 'guide_desktop_step3_title', desc: 'guide_desktop_step3_desc' },
  ],
};

export default function HomePage() {
  const { t, lang } = useLanguage();
  const { isLoggedIn, uid } = useAuth();
  usePageTitle(t('nav_home'));
  const [guideTab, setGuideTab] = useState<'mobile' | 'desktop'>('mobile');
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalDoc[]>([]);

  useEffect(() => {
    if (!uid) {
      setLedger([]);
      setWithdrawals([]);
      return;
    }
    const db = getFirebaseDb();
    const unsubLedger = onSnapshot(query(collection(db, 'cashbackLedger'), where('userId', '==', uid)), (snap) => {
      setLedger(snap.docs.map((d) => d.data() as LedgerEntry));
    });
    const unsubWithdrawals = onSnapshot(query(collection(db, 'withdrawalRequests'), where('userId', '==', uid)), (snap) => {
      setWithdrawals(snap.docs.map((d) => d.data() as WithdrawalDoc));
    });
    return () => {
      unsubLedger();
      unsubWithdrawals();
    };
  }, [uid]);

  // Same computed-not-stored balance rule used everywhere else in the app
  // (see /manager/users, /cashback-wallet) — never a mutable counter.
  const { available, pending, received } = useMemo(() => {
    let released = 0;
    let frozen = 0;
    ledger.forEach((entry) => {
      if (entry.status === 'RELEASED') released += entry.amount;
      else if (entry.status === 'FROZEN') frozen += entry.amount;
    });
    const paidOut = withdrawals.filter((w) => w.status === 'PAID').reduce((sum, w) => sum + w.amount, 0);
    return { available: released - paidOut, pending: frozen, received: released };
  }, [ledger, withdrawals]);

  return (
    <AppShell showRightPanel={false}>
      {/* Live events carousel — auto-rotating, not a static banner */}
      <EventCarousel events={mockHomeEvents} />

      {/* Balance / welcome card — premium styling */}
      <section className="welcome-card-v2">
        <div className="welcome-card-v2-glow" />
        <div className="welcome-card-v2-head">
          <span className="promo-badge light">✨ {t('welcome_hi')}</span>
          <Link href="/account" className="welcome-card-v2-avatar">👤</Link>
        </div>

        {isLoggedIn ? (
          <>
            <div className="welcome-balance-row-v2">
              <div>
                <div className="wc-label">{t('panel_balance_title')}</div>
                <div className="wc-value-v2">{formatCurrency(available, lang)}</div>
              </div>
              <div className="wc-divider" />
              <div>
                <div className="wc-label">{t('welcome_saved')}</div>
                <div className="wc-value-v2 secondary">{formatCurrency(received, lang)}</div>
              </div>
            </div>

            <div className="welcome-actions">
              <Link href="/get-cashback-link" className="button button-primary wc-btn">🔗 {t('welcome_create_link')}</Link>
              <Link href="/orders" className="button button-secondary wc-btn">🕐 {t('welcome_order_history')}</Link>
            </div>
          </>
        ) : (
          <Link href="/login" className="button button-primary wc-btn welcome-login-cta">
            🔑 {t('welcome_login_cta')}
          </Link>
        )}
      </section>

      <section className="mini-stats-row">
        <div className="mini-stat-card">
          <span className="mini-stat-icon">🛍️</span>
          <div className="mini-stat-value">{formatCurrency(pending + received, lang)}</div>
          <div className="mini-stat-label">{t('welcome_total_orders')}</div>
        </div>
        <div className="mini-stat-card">
          <span className="mini-stat-icon">⏳</span>
          <div className="mini-stat-value">{formatCurrency(pending, lang)}</div>
          <div className="mini-stat-label">{t('panel_pending')}</div>
        </div>
        <div className="mini-stat-card">
          <span className="mini-stat-icon">✅</span>
          <div className="mini-stat-value">{formatCurrency(received, lang)}</div>
          <div className="mini-stat-label">{t('panel_received')}</div>
        </div>
      </section>

      {/* Quick utility icons */}
      <section className="quick-utility-section">
        <div className="section-header">
          <h2>{t('quick_utilities')}</h2>
        </div>
        <div className="quick-utility-grid">
          <Link href="/#stores" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><PlatformIcon name="Shopee" size={44} /></span>
            Shopee
          </Link>
          <Link href="/#stores" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><PlatformIcon name="TikTok Shop" size={44} /></span>
            TikTok Shop
          </Link>
          <Link href="/#stores" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><PlatformIcon name="Lazada" size={44} /></span>
            Lazada
          </Link>
          <Link href="/get-cashback-link" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#0096ff' }}><LinkIcon size={20} /></span></span>
            {t('sidebar_get_link')}
          </Link>
          <Link href="/orders" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#f59e0b' }}><BoxIcon size={20} /></span></span>
            {t('sidebar_orders')}
          </Link>
          <Link href="/cashback-wallet" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#16a34a' }}><WalletIcon size={20} /></span></span>
            {t('sidebar_wallet')}
          </Link>
          <Link href="/referrals" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#8b5cf6' }}><UsersIcon size={20} /></span></span>
            {t('sidebar_referrals')}
          </Link>
          <Link href="/support" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#0ea5e9' }}><HeadsetIcon size={20} /></span></span>
            {t('sidebar_support')}
          </Link>
          <Link href="/#guide" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#ef4444' }}><BookIcon size={20} /></span></span>
            {t('guide_title').split(' ').slice(0, 2).join(' ')}
          </Link>
          <Link href="/settings" className="quick-utility-item">
            <span className="quick-utility-icon-frame"><span className="quick-utility-icon" style={{ background: '#64748b' }}><GearIcon size={20} /></span></span>
            {t('sidebar_settings')}
          </Link>
        </div>
      </section>

      {/* Stores */}
      <section id="stores" className="home-section">
        <div className="section-header">
          <h2>{t('stores_title')}</h2>
        </div>
        <div className="platform-grid">
          {mockPlatforms.map((platform) => (
            <div
              key={platform.name}
              className="platform-card store-card"
              style={{ ['--store-accent' as any]: platform.accent }}
            >
              <div className="store-card-icon-badge">
                <PlatformBadge name={platform.name} size={32} />
              </div>
              <h3>{platform.name}</h3>
              <p className="platform-card-desc">{platform.description}</p>
              <Link href="/get-cashback-link" className="button wide-button store-card-cta">
                🛍️ {t('stores_cta')}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* How to get the link — desktop vs mobile */}
      <section id="guide" className="home-section">
        <div className="section-header">
          <h2>{t('guide_title')}</h2>
          <p className="muted-copy">{t('guide_desc')}</p>
        </div>

        <div className="sv-platform-tabs guide-tabs">
          <button className={guideTab === 'mobile' ? 'active' : ''} onClick={() => setGuideTab('mobile')}>
            📱 {t('guide_tab_mobile')}
          </button>
          <button className={guideTab === 'desktop' ? 'active' : ''} onClick={() => setGuideTab('desktop')}>
            💻 {t('guide_tab_desktop')}
          </button>
        </div>

        <div className="guide-steps">
          {guideSteps[guideTab].map((step, i) => (
            <div key={step.title} className="guide-step">
              <div className="guide-step-icon-frame">
                <span className="guide-step-icon">{GUIDE_STEP_ICONS[i]}</span>
                <span className="guide-step-number">{i + 1}</span>
              </div>
              <h3>{t(step.title as any)}</h3>
              <p>{t(step.desc as any)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Process steps */}
      <section className="process-section">
        <div className="section-header">
          <h2>{t('process_title')}</h2>
          <p className="muted-copy">{t('process_desc')}</p>
        </div>

        <div className="process-timeline-v2">
          <div className="process-step-card">
            <div className="process-icon-v2 step1">🛍️</div>
            <span className="process-step-label">{t('process_step1_label')}</span>
            <h3>{t('process_step1_title')}</h3>
            <span className="process-chip">{t('process_step1_chip')}</span>
            <p>{t('process_step1_desc')}</p>
          </div>

          <div className="process-step-card">
            <div className="process-icon-v2 step2">🔄</div>
            <span className="process-step-label">{t('process_step2_label')}</span>
            <h3>{t('process_step2_title')}</h3>
            <span className="process-chip warning">{t('process_step2_chip')}</span>
            <p>{t('process_step2_desc')}</p>
          </div>

          <div className="process-step-card">
            <div className="process-icon-v2 step3">👛</div>
            <span className="process-step-label">{t('process_step3_label')}</span>
            <h3>{t('process_step3_title')}</h3>
            <span className="process-chip">{t('process_step3_chip')}</span>
            <p>{t('process_step3_desc')}</p>
          </div>
        </div>

        <div className="process-timing-note">
          <h3>{t('process_timing_title')}</h3>
          <p className="muted-copy">{t('process_timing_desc')}</p>

          <div className="process-timing-grid">
            {mockPlatforms.map((platform) => (
              <div key={platform.name} className="process-timing-card">
                <PlatformBadge name={platform.name} size={26} />
                <div>
                  <h4>{platform.name}</h4>
                  <span className="process-timing-window">
                    {platform.name === 'Shopee'
                      ? t('process_timing_shopee')
                      : platform.name === 'TikTok Shop'
                      ? t('process_timing_tiktok')
                      : t('process_timing_lazada')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="process-timing-sync">
            ⚡ {t('process_timing_sync')}
          </div>

          <p className="mock-note">{t('process_timing_footnote')}</p>
        </div>
      </section>
    </AppShell>
  );
}
