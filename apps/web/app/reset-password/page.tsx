'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FirebaseError } from 'firebase/app';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { getFirebaseAuth } from '../../lib/firebase';
import { useLanguage } from '../../lib/i18n';
import { usePageTitle } from '../../lib/use-page-title';
import { EyeIcon, EyeOffIcon } from '../../components/ui/Icons';

function ResetPasswordInner() {
  const { t } = useLanguage();
  usePageTitle(t('reset_password_title'));
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode') || '';

  const [status, setStatus] = useState<'verifying' | 'valid' | 'invalid' | 'done'>('verifying');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // The oobCode arrives straight from the email link (handleCodeInApp:true
  // in forgot-password's sendPasswordResetEmail call sends it here instead
  // of Firebase's generic hosted action page) — verify it once up front so
  // an expired/already-used link fails fast with a clear message instead
  // of only surfacing an error after the user fills in a new password.
  useEffect(() => {
    if (!oobCode) {
      setStatus('invalid');
      return;
    }
    verifyPasswordResetCode(getFirebaseAuth(), oobCode)
      .then((verifiedEmail) => {
        setEmail(verifiedEmail);
        setStatus('valid');
      })
      .catch(() => setStatus('invalid'));
  }, [oobCode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('reset_password_error_mismatch'));
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(getFirebaseAuth(), oobCode, password);
      setStatus('done');
    } catch (err) {
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case 'auth/weak-password':
            setError(t('reset_password_error_weak'));
            break;
          case 'auth/expired-action-code':
          case 'auth/invalid-action-code':
            setStatus('invalid');
            break;
          default:
            setError(t('reset_password_error_generic'));
        }
      } else {
        setError(t('reset_password_error_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-head">
          <span className="login-card-eyebrow">{t('login_wallet_label')}</span>
          <h1>{t('reset_password_title')}</h1>
        </div>

        {status === 'verifying' && (
          <p className="muted-copy" style={{ textAlign: 'center', padding: '20px 0' }}>{t('reset_password_verifying')}</p>
        )}

        {status === 'invalid' && (
          <div className="forgot-success">
            <span style={{ fontSize: '2rem' }}>⚠️</span>
            <p>{t('reset_password_error_invalid_link')}</p>
            <Link href="/forgot-password" className="button button-primary wide-button">{t('reset_password_request_new')}</Link>
          </div>
        )}

        {status === 'valid' && (
          <form onSubmit={handleSubmit} className="login-form">
            <p className="muted-copy">{t('reset_password_desc').replace('{email}', email)}</p>

            <label>
              <span className="field-label">{t('reset_password_new')}</span>
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

            <label>
              <span className="field-label">{t('reset_password_confirm')}</span>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
            </label>

            {error && <p className="admin-gate-error">{error}</p>}

            <button type="submit" className="button button-primary wide-button" disabled={submitting}>
              {submitting ? t('reset_password_submitting') : t('reset_password_submit')}
            </button>
          </form>
        )}

        {status === 'done' && (
          <div className="forgot-success">
            <span style={{ fontSize: '2rem' }}>✅</span>
            <p><strong>{t('reset_password_success_title')}</strong></p>
            <p>{t('reset_password_success_desc')}</p>
            <Link href="/login" className="button button-primary wide-button">{t('back_home')} {t('header_login')}</Link>
          </div>
        )}

        <Link href="/login" className="text-link login-back-home">← {t('header_login')}</Link>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
