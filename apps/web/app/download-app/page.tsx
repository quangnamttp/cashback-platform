'use client';

import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { useLanguage } from '../../lib/i18n';

export default function DownloadAppPage() {
  const { t } = useLanguage();
  const [platform, setPlatform] = useState<'ios' | 'android'>('ios');

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
        <div className="page-shell">
          <div className="page-header">
            <div>
              <span className="eyebrow dark">{t('download_eyebrow')}</span>
              <h1>{t('download_title')}</h1>
            </div>
          </div>

          <p className="muted-copy">{t('download_desc')}</p>

          <div className="download-platform-tabs">
            <button className={platform === 'ios' ? 'active' : ''} onClick={() => setPlatform('ios')}>
              🍎 iPhone (Safari)
            </button>
            <button className={platform === 'android' ? 'active' : ''} onClick={() => setPlatform('android')}>
              🤖 Android (Chrome)
            </button>
          </div>

          {platform === 'ios' ? (
            <section className="panel">
              <h3>{t('download_ios_title')}</h3>
              <ol className="ordered-list download-steps">
                <li>{t('download_ios_step1')}</li>
                <li>{t('download_ios_step2')}</li>
                <li>{t('download_ios_step3')}</li>
                <li>{t('download_ios_step4')}</li>
              </ol>
            </section>
          ) : (
            <section className="panel">
              <h3>{t('download_android_title')}</h3>
              <ol className="ordered-list download-steps">
                <li>{t('download_android_step1')}</li>
                <li>{t('download_android_step2')}</li>
                <li>{t('download_android_step3')}</li>
              </ol>
              <div className="wd-notice" style={{ marginTop: 16 }}>
                ⚠️ {t('download_android_note_title')}
                <p>{t('download_android_note_desc')}</p>
              </div>
            </section>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}
