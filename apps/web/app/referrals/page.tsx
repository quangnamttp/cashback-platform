'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { AppShell } from '../../components/layout/AppShell';
import { CopyCodeButton } from '../../components/ui/CopyCodeButton';
import { useLanguage } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { getFirebaseDb } from '../../lib/firebase';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { usePageTitle } from '../../lib/use-page-title';

type InvitedUser = { id: string; fullName?: string; email?: string; createdAt?: { toDate: () => Date } };

export default function ReferralsPage() {
  const { t } = useLanguage();
  const { uid } = useAuth();
  usePageTitle(t('referral_hero_title'));
  const [referralCode, setReferralCode] = useState('');
  const [invited, setInvited] = useState<InvitedUser[]>([]);

  useEffect(() => {
    if (!uid) {
      setReferralCode('');
      setInvited([]);
      return;
    }
    const db = getFirebaseDb();
    const unsubUser = onSnapshot(doc(db, 'users', uid), (snap) => {
      setReferralCode(snap.data()?.referralCode ?? '');
    });
    return unsubUser;
  }, [uid]);

  useEffect(() => {
    if (!referralCode) {
      setInvited([]);
      return;
    }
    const q = query(collection(getFirebaseDb(), 'users'), where('referredBy', '==', referralCode));
    const unsubscribe = onSnapshot(q, (snap) => {
      setInvited(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvitedUser)));
    });
    return unsubscribe;
  }, [referralCode]);

  const referralLink = typeof window !== 'undefined' && referralCode
    ? `${window.location.origin}/login?ref=${referralCode}`
    : '';

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
      <div className="page-shell">
        <section className="referral-hero">
          <span className="promo-badge light">👥 {t('referrals_eyebrow')}</span>
          <h1>{t('referral_hero_title')}</h1>
          <p>{t('referral_hero_desc')}</p>

          <div className="referral-actions">
            {referralLink ? (
              <CopyCodeButton code={referralLink} label={`📋 ${t('referral_copy_link')}`} className="button-primary" />
            ) : (
              <span className="muted-copy">Đang tải mã giới thiệu...</span>
            )}
          </div>

          <div className="referral-rate-box">
            <strong>{referralCode || '—'}</strong>
            <span>Mã giới thiệu của bạn</span>
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">{t('referred_users')}</div>
            <div className="stat-value">{invited.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('referral_rate_label')}</div>
            <div className="stat-value">5%</div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>👥 {t('referral_tab_members')}</h3>
          </div>

          <div className="referral-list">
            {invited.map((m) => (
              <div key={m.id} className="referral-list-row">
                <div>
                  <strong>{m.fullName || m.email || m.id}</strong>
                  <span>
                    {t('referral_joined')} {m.createdAt ? m.createdAt.toDate().toLocaleDateString('vi-VN') : '—'}
                  </span>
                </div>
              </div>
            ))}
            {invited.length === 0 && <p className="muted-copy">Chưa có ai đăng ký bằng mã giới thiệu của bạn.</p>}
          </div>
        </section>

        <p className="mock-note">
          Dữ liệu thật từ Firestore: mã giới thiệu, link, và danh sách người đã đăng ký bằng mã của bạn. Chương trình
          thưởng hoa hồng theo dõi đơn hàng của người được giới thiệu chưa được kích hoạt tính tiền tự động — báo mình
          khi bạn muốn triển khai phần đó.
        </p>
      </div>
    </AppShell>
    </RequireAuth>
  );
}
