'use client';

import { useState } from 'react';
import Link from 'next/link';
import { sendPasswordResetEmail } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase';
import { useLanguage } from '../../lib/i18n';
import { usePageTitle } from '../../lib/use-page-title';

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  usePageTitle(t('forgot_title'));
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      // handleCodeInApp:true sends the reset link straight to our own
      // /reset-password page (with the oobCode in the URL) instead of
      // Firebase's generic hosted action page — same free link-based
      // mechanism, just handled in our own branded UI end to end.
      await sendPasswordResetEmail(getFirebaseAuth(), email, {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      });
    } catch {
      // Deliberately don't disclose whether the email exists — always show
      // the same "sent" confirmation either way.
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-head">
          <span className="login-card-eyebrow">{t('login_wallet_label')}</span>
          <h1>{t('forgot_title')}</h1>
        </div>

        {sent ? (
          <div className="forgot-success">
            <span style={{ fontSize: '2rem' }}>📩</span>
            <p>{t('forgot_sent_desc').replace('{email}', email)}</p>
            <Link href="/login" className="button button-primary wide-button">{t('back_home')} {t('header_login')}</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="login-form">
            <p className="muted-copy">{t('forgot_desc')}</p>
            <label>
              <span className="field-label">{t('login_account_label')}</span>
              <input
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="button button-primary wide-button" disabled={submitting}>
              {submitting ? t('login_submitting') : t('forgot_submit')}
            </button>
          </form>
        )}

        <Link href="/login" className="text-link login-back-home">← {t('header_login')}</Link>
      </div>
    </div>
  );
}
