'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { useAuth } from '../../lib/auth';
import { getFirebaseDb } from '../../lib/firebase';

type LedgerEntry = { amount: number; status: 'FROZEN' | 'RELEASED' | 'REJECTED' };
type WithdrawalDoc = { amount: number; status: string };

export function RightPanel() {
  const { t, lang } = useLanguage();
  const { isLoggedIn, uid } = useAuth();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalDoc[]>([]);
  const [orderCount, setOrderCount] = useState(0);

  useEffect(() => {
    if (!uid) {
      setLedger([]);
      setWithdrawals([]);
      setOrderCount(0);
      return;
    }
    const db = getFirebaseDb();
    const unsubLedger = onSnapshot(query(collection(db, 'cashbackLedger'), where('userId', '==', uid)), (snap) => {
      setLedger(snap.docs.map((d) => d.data() as LedgerEntry));
    });
    const unsubWithdrawals = onSnapshot(query(collection(db, 'withdrawalRequests'), where('userId', '==', uid)), (snap) => {
      setWithdrawals(snap.docs.map((d) => d.data() as WithdrawalDoc));
    });
    const unsubOrders = onSnapshot(query(collection(db, 'orders'), where('userId', '==', uid)), (snap) => {
      setOrderCount(snap.size);
    });
    return () => {
      unsubLedger();
      unsubWithdrawals();
      unsubOrders();
    };
  }, [uid]);

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
    <aside className="app-right-panel">
      <div className="rp-card rp-balance">
        <div className="rp-card-title">{t('panel_balance_title')}</div>

        {isLoggedIn ? (
          <>
            <div className="rp-balance-value">{formatCurrency(available, lang)}</div>
            <div className="rp-balance-actions">
              <Link href="/cashback-wallet" className="button button-secondary rp-btn">{t('panel_wallet_btn')}</Link>
              <Link href="/cashback-wallet" className="button button-primary rp-btn">{t('panel_withdraw_btn')}</Link>
            </div>
          </>
        ) : (
          <p className="rp-login-hint">{t('panel_balance_login_hint')}</p>
        )}
      </div>

      <div className="rp-card">
        <div className="rp-card-title">{t('panel_quick_stats')}</div>
        <div className="rp-stat-list">
          <div className="rp-stat-row">
            <span>{t('panel_saved')}</span>
            <strong>{formatCurrency(received, lang)}</strong>
          </div>
          <div className="rp-stat-row">
            <span>{t('panel_pending')}</span>
            <strong>{formatCurrency(pending, lang)}</strong>
          </div>
          <div className="rp-stat-row">
            <span>{t('panel_received')}</span>
            <strong>{formatCurrency(received, lang)}</strong>
          </div>
          <div className="rp-stat-row">
            <span>{t('panel_orders')}</span>
            <strong>{orderCount}</strong>
          </div>
        </div>
      </div>

      <div className="rp-card">
        <div className="rp-card-title">{t('panel_referral_title')}</div>
        <p className="rp-referral-desc">{t('panel_referral_desc')}</p>
        <Link href="/referrals" className="button button-secondary rp-btn-full">{t('panel_referral_btn')}</Link>
      </div>

      <div className="rp-card rp-support">
        <div className="rp-card-title">{t('panel_support_title')}</div>
        <ul className="rp-support-list">
          <li><Link href="/support">{t('panel_faq')}</Link></li>
          <li><Link href="/#guide">{t('panel_guide')}</Link></li>
          <li><Link href="/support">{t('panel_contact')}</Link></li>
        </ul>
      </div>
    </aside>
  );
}
