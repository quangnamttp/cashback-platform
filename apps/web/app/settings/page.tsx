'use client';

import { useState } from 'react';
import { FirebaseError } from 'firebase/app';
import { AppShell } from '../../components/layout/AppShell';
import { LANGS, useLanguage } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { usePageTitle } from '../../lib/use-page-title';

export default function SettingsPage() {
  const { lang, setLang, t } = useLanguage();
  usePageTitle(t('settings_title'));
  const { theme, toggleTheme } = useTheme();
  const { hasPasswordProvider, changePassword } = useAuth();
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPwError('');
    setPwSuccess(false);
    setPwSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            setPwError(t('settings_password_error_wrong_current'));
            break;
          case 'auth/weak-password':
            setPwError(t('settings_password_error_weak'));
            break;
          default:
            setPwError(t('settings_password_error_generic'));
        }
      } else {
        setPwError(t('settings_password_error_generic'));
      }
    } finally {
      setPwSubmitting(false);
    }
  };

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('settings_eyebrow')}</span>
            <h1>{t('settings_title')}</h1>
          </div>
        </div>

        <section className="panel settings-row">
          <div>
            <h3>{t('settings_language_title')}</h3>
            <p className="muted-copy">{t('settings_language_desc')}</p>
          </div>
          <div className="settings-lang-options">
            {LANGS.map((item) => (
              <button
                key={item.code}
                className={item.code === lang ? 'settings-lang-btn active' : 'settings-lang-btn'}
                onClick={() => setLang(item.code)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="panel settings-row">
          <div>
            <h3>{t('settings_theme_title')}</h3>
            <p className="muted-copy">{t('settings_theme_desc')}</p>
          </div>
          <button className="button button-secondary" onClick={toggleTheme}>
            {theme === 'light' ? `🌙 ${t('settings_theme_dark')}` : `☀️ ${t('settings_theme_light')}`}
          </button>
        </section>

        <section className="panel settings-row">
          <div>
            <h3>{t('settings_notif_title')}</h3>
            <p className="muted-copy">{t('settings_notif_desc')}</p>
          </div>
          <label className="settings-toggle">
            <input type="checkbox" defaultChecked />
            <span className="settings-toggle-slider" />
          </label>
        </section>

        <section className="panel">
          <div className="settings-row">
            <div>
              <h3>🔒 {t('settings_password_title')}</h3>
              <p className="muted-copy">{t('settings_password_desc')}</p>
            </div>
            {hasPasswordProvider && (
              <button
                className="button button-secondary"
                onClick={() => {
                  setShowPasswordForm((v) => !v);
                  setPwError('');
                  setPwSuccess(false);
                }}
              >
                {showPasswordForm ? t('settings_password_close') : t('settings_password_title')}
              </button>
            )}
          </div>

          {!hasPasswordProvider && (
            <p className="mock-note" style={{ marginTop: 12 }}>{t('settings_password_google_note')}</p>
          )}

          {hasPasswordProvider && showPasswordForm && (
            <form className="bank-add-form" style={{ maxWidth: 420, marginTop: 18 }} onSubmit={handleChangePassword}>
              <label>
                <span className="field-label">{t('settings_password_current')}</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </label>
              <label>
                <span className="field-label">{t('settings_password_new')}</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </label>
              {pwError && <p className="admin-gate-error">{pwError}</p>}
              {pwSuccess && <p className="quick-product-note applied">✓ {t('settings_password_success')}</p>}
              <button type="submit" className="button button-primary" disabled={pwSubmitting}>
                {pwSubmitting ? t('settings_password_submitting') : t('settings_password_submit')}
              </button>
            </form>
          )}
        </section>
      </div>
    </AppShell>
    </RequireAuth>
  );
}
