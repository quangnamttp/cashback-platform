'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '../../lib/i18n';
import { usePageTitle } from '../../lib/use-page-title';

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  usePageTitle(t('forgot_title'));
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Mock only — no real email/backend wired yet.
    setSent(true);
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
            <button type="submit" className="button button-primary wide-button">{t('forgot_submit')}</button>
            <p className="login-mock-note">{t('login_mock_note')}</p>
          </form>
        )}

        <Link href="/login" className="text-link login-back-home">← {t('header_login')}</Link>
      </div>
    </div>
  );
}
