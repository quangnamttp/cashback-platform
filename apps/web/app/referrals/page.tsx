'use client';

import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';

export default function ReferralsPage() {
  const { t } = useLanguage();

  return (
    <AppShell>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('referrals_eyebrow')}</span>
            <h1>{t('referrals_title')}</h1>
          </div>
        </div>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">{t('referral_code_label')}</div>
            <div className="stat-value">REF-MINH-2026</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('referred_users')}</div>
            <div className="stat-value">128</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('eligible_purchases')}</div>
            <div className="stat-value">24</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('referral_rewards')}</div>
            <div className="stat-value">₫120K</div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>{t('referral_activity')}</h3>
            <span className="badge badge-warning">{t('only_confirmed')}</span>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('tbl_user')}</th>
                  <th>{t('tbl_purchase')}</th>
                  <th>{t('tbl_commission')}</th>
                  <th>{t('tbl_status')}</th>
                  <th>{t('tbl_reward')}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>lan.hoa</td>
                  <td>Beauty kit</td>
                  <td>₫680K</td>
                  <td><span className="badge badge-success">{t('status_confirmed')}</span></td>
                  <td>₫34K</td>
                </tr>
                <tr>
                  <td>thu.mai</td>
                  <td>Speaker</td>
                  <td>₫420K</td>
                  <td><span className="badge badge-warning">{t('status_pending')}</span></td>
                  <td>₫0</td>
                </tr>
                <tr>
                  <td>bao.tran</td>
                  <td>Headphone</td>
                  <td>₫930K</td>
                  <td><span className="badge badge-danger">{t('status_rejected')}</span></td>
                  <td>₫0</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
