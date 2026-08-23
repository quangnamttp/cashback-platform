'use client';

import { AppShell } from '../../components/layout/AppShell';
import { LANGS, useLanguage } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';

export default function SettingsPage() {
  const { lang, setLang, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('sidebar_settings')}</span>
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
          <h3>{t('settings_account_title')}</h3>
          <p className="muted-copy">{t('settings_account_desc')}</p>
          <button className="btn-reject" style={{ marginTop: 14 }}>{t('account_sign_out')}</button>
        </section>
      </div>
    </AppShell>
  );
}
