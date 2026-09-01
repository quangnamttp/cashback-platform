'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FirebaseError } from 'firebase/app';
import { useLanguage } from '../../lib/i18n';
import { useAuth } from '../../lib/auth';
import { usePageTitle } from '../../lib/use-page-title';
import { CheckIcon, EyeIcon, EyeOffIcon, LoginIcon, UserPlusIcon } from '../../components/ui/Icons';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function LoginPageInner() {
  const { t } = useLanguage();
  const { loginWithEmail, registerWithEmail, loginWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const refFromLink = searchParams.get('ref') || '';
  const [tab, setTab] = useState<'login' | 'register'>(refFromLink ? 'register' : 'login');
  usePageTitle(tab === 'login' ? t('header_login') : t('login_register'));
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [referralCode, setReferralCode] = useState(refFromLink);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const mapFirebaseError = (err: unknown): string => {
    if (err instanceof Error && err.message === 'firebase-not-configured') {
      return t('login_error_not_configured');
    }
    if (err instanceof FirebaseError) {
      switch (err.code) {
        case 'auth/invalid-email':
          return t('login_error_invalid_email');
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          return t('login_error_wrong_password');
        case 'auth/email-already-in-use':
          return t('login_error_email_in_use');
        case 'auth/weak-password':
          return t('login_error_weak_password');
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
          return t('login_error_popup_closed');
        default:
          return t('login_error_generic');
      }
    }
    return t('login_error_generic');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (!EMAIL_PATTERN.test(account)) {
      setError(t('login_error_invalid_email'));
      return;
    }

    if (tab === 'register' && !fullName.trim()) {
      setError(t('login_error_fullname_required'));
      return;
    }

    setSubmitting(true);
    try {
      if (tab === 'login') {
        await loginWithEmail(account, password, remember);
      } else {
        await registerWithEmail(account, password, { referralCode, fullName: fullName.trim() }, remember);
      }
      router.push(next);
    } catch (err) {
      setError(mapFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setSubmitting(true);
    try {
      await loginWithGoogle();
      router.push(next);
    } catch (err) {
      setError(mapFirebaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-head">
          <span className="login-card-eyebrow">{t('login_wallet_label')}</span>
          <h1>{tab === 'login' ? t('login_welcome_back') : t('login_create_account')}</h1>
        </div>

        <div className="login-tabs">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => { setTab('login'); setError(''); }}>
            <LoginIcon size={16} /> {t('header_login')}
          </button>
          <button className={tab === 'register' ? 'active' : ''} onClick={() => { setTab('register'); setError(''); }}>
            <UserPlusIcon size={16} /> {t('login_register')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {tab === 'register' && (
            <label>
              <span className="field-label">{t('login_fullname_label')}</span>
              <input
                type="text"
                placeholder={t('login_fullname_placeholder')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </label>
          )}

          <label>
            <span className="field-label">{t('login_account_label')}</span>
            <input
              type="email"
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
                minLength={6}
                required
              />
              <button
                type="button"
                className="login-eye-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </label>

          {tab === 'login' && (
            <div className="login-options-row">
              <button
                type="button"
                className={`login-checkbox${remember ? ' checked' : ''}`}
                onClick={() => setRemember((v) => !v)}
                aria-pressed={remember}
              >
                <span className="login-checkbox-box">{remember && <CheckIcon size={13} />}</span>
                {t('login_remember')}
              </button>
              <Link href="/forgot-password" className="text-link">{t('login_forgot')}</Link>
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

          {error && <p className="admin-gate-error">{error}</p>}

          <button type="submit" className="button button-primary wide-button" disabled={submitting}>
            {submitting ? (
              t('login_submitting')
            ) : tab === 'login' ? (
              <><LoginIcon size={18} /> {t('header_login')}</>
            ) : (
              <><UserPlusIcon size={18} /> {t('login_register')}</>
            )}
          </button>
        </form>

        <div className="login-divider"><span>{t('login_or')}</span></div>

        <button type="button" className="login-google-btn" onClick={handleGoogle} disabled={submitting}>
          <span className="login-google-icon">G</span>
          {t('continue_google')}
        </button>

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
