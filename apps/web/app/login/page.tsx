'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useLanguage } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { usePageTitle } from '../../lib/use-page-title';

function LoginPageInner() {
  const { t } = useLanguage();
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [tab, setTab] = useState<'login' | 'register'>('login');
  usePageTitle(tab === 'login' ? t('header_login') : t('login_register'));
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Mock login: no real backend/credential check yet. See lib/auth.tsx.
    login();
    router.push(next);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-head">
          <span className="login-card-eyebrow">{t('login_wallet_label')}</span>
          <h1>{tab === 'login' ? t('login_welcome_back') : t('login_create_account')}</h1>
        </div>

        <div className="login-tabs">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => setTab('login')}>
            ➡️ {t('header_login')}
          </button>
          <button className={tab === 'register' ? 'active' : ''} onClick={() => setTab('register')}>
            👤➕ {t('login_register')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <label>
            <span className="field-label">{t('login_account_label')}</span>
            <input
              placeholder={t('login_account_placeholder')}
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              required
            />
          </label>

          <label>
            <span className="field-label">{t('login_password_label')}</span>
            <div className="login-password-row">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button type="button" className="login-eye-btn" onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </label>

          {tab === 'login' && (
            <div className="login-options-row">
              <label className="login-checkbox">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                {t('login_remember')}
              </label>
              <a href="/forgot-password" className="text-link">{t('login_forgot')}</a>
            </div>
          )}

          {tab === 'register' && (
            <label>
              <span className="field-label">{t('login_referral_code_label')}</span>
              <input
                placeholder={t('login_referral_code_placeholder')}
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
              />
            </label>
          )}

          <button type="submit" className="button button-primary wide-button">
            {tab === 'login' ? `➡️ ${t('header_login')}` : `👤➕ ${t('login_register')}`}
          </button>
        </form>

        <div className="login-divider"><span>{t('login_or')}</span></div>

        <button type="button" className="login-google-btn" onClick={handleSubmit}>
          <span className="login-google-icon">G</span>
          {t('continue_google')}
        </button>

        <p className="login-mock-note">{t('login_mock_note')}</p>
        <p className="login-mock-note">{t('login_google_link_note')}</p>

        <Link href="/" className="text-link login-back-home">← {t('back_home')}</Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
