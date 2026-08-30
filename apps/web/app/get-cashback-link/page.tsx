'use client';

import Link from 'next/link';
import { useState } from 'react';
import { mockPlatforms } from '../../lib/mock-data';
import { AppShell } from '../../components/layout/AppShell';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { PlatformBadge } from '../../components/ui/PlatformBadge';
import { useLanguage } from '../../lib/i18n';
import { formatCurrency } from '../../lib/currency';
import { usePageTitle } from '../../lib/use-page-title';

const PLATFORM_DOMAINS: { match: RegExp; platform: string; rate: number }[] = [
  { match: /shopee\.(vn|com)/i, platform: 'Shopee', rate: 0.04 },
  { match: /(tiktok\.com\/.*shop|vt\.tiktok\.com|shop\.tiktok\.com)/i, platform: 'TikTok Shop', rate: 0.03 },
  { match: /lazada\.(vn|com)/i, platform: 'Lazada', rate: 0.05 },
];

const ASSUMED_ORDER_VALUE = 100000;

type CheckResult =
  | { status: 'unsupported' }
  | { status: 'supported'; platform: string; estimatedCashback: number; trackingLink: string };

export default function GetCashbackLinkPage() {
  const { t, lang } = useLanguage();
  usePageTitle(t('get_link_title'));
  const [link, setLink] = useState('');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handlePasteOrClear = async () => {
    if (link) {
      setLink('');
      setResult(null);
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
    } catch {
      // clipboard access may be blocked; user can paste manually
    }
  };

  const handleCheck = () => {
    if (!link) return;
    const found = PLATFORM_DOMAINS.find((p) => p.match.test(link));
    if (!found) {
      setResult({ status: 'unsupported' });
      return;
    }
    const estimatedCashback = Math.round(ASSUMED_ORDER_VALUE * found.rate);
    const trackingLink = `https://s.cashback-platform.example/${btoa(link).replace(/=+$/, '').slice(0, 10)}`;
    setResult({ status: 'supported', platform: found.platform, estimatedCashback, trackingLink });
  };

  const copyTrackingLink = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const resetForm = () => {
    setLink('');
    setResult(null);
  };

  return (
    <RequireAuth>
      <AppShell showRightPanel={false}>
        <div className="page-shell">
          <section className="get-link-card">
            <div className="get-link-card-head">
              <div className="promo-icon-badge">🔗</div>
              <div>
                <h1>{t('get_link_title')}</h1>
                <p>{t('get_link_subtitle')}</p>
              </div>
            </div>

            <div className="get-link-platform-grid">
              {mockPlatforms.map((platform) => (
                <span key={platform.name} className="get-link-platform-chip">
                  <PlatformBadge name={platform.name} size={20} />
                  <span>{platform.name}</span>
                </span>
              ))}
            </div>

            <div className="get-link-input-block">
              <label className="field-label" htmlFor="product-link">{t('paste_label')}</label>
              <div className="get-link-input-row">
                <span className="get-link-input-icon">🔗</span>
                <input
                  id="product-link"
                  placeholder={t('get_link_input_placeholder')}
                  value={link}
                  onChange={(event) => {
                    setLink(event.target.value);
                    setResult(null);
                  }}
                />
                <button type="button" className="get-link-paste-btn" onClick={handlePasteOrClear}>
                  {link ? `✕ ${t('sv_clear_link')}` : `📋 ${t('get_link_paste')}`}
                </button>
              </div>
            </div>

            <button className="button button-primary get-link-cta" onClick={handleCheck} disabled={!link}>
              ✨ {t('get_link_btn')}
            </button>

            {result?.status === 'unsupported' && (
              <div className="get-link-result-error">
                ⚠️ {t('get_link_unsupported')}
              </div>
            )}

            {result?.status === 'supported' && (
              <div className="get-link-result-card">
                <div className="get-link-result-amount-row">
                  <span>{t('get_link_estimated')}</span>
                  <strong>+{formatCurrency(result.estimatedCashback, lang)}</strong>
                </div>
                <p className="get-link-result-disclaimer">{t('get_link_disclaimer')}</p>

                <div className="wd-notice" style={{ marginTop: 12 }}>
                  ⚠️ {t('get_link_precaution_title')}
                  <p>{t('get_link_precaution_desc')}</p>
                </div>

                <label className="field-label" style={{ display: 'block', marginTop: 14 }}>{t('get_link_your_link')}</label>
                <div className="get-link-input-row" style={{ marginTop: 6 }}>
                  <span className="get-link-input-icon">🔗</span>
                  <input readOnly value={result.trackingLink} />
                </div>

                <div className="get-link-result-actions">
                  <button type="button" className="button button-secondary" onClick={() => copyTrackingLink(result.trackingLink)}>
                    {copied ? '✓' : '📋'} {t('get_link_copy')}
                  </button>
                  <a href={link} target="_blank" rel="noreferrer" className="button button-primary">
                    🛒 {t('get_link_buy_now')}
                  </a>
                </div>

                <button type="button" className="text-link" style={{ marginTop: 12 }} onClick={resetForm}>
                  ➕ {t('get_link_create_another')}
                </button>
              </div>
            )}

            <div className="get-link-helper-row">
              <Link href="/#guide">▶ {t('get_link_how_to')}</Link>
              <a href="#important-rule-section">⚠ {t('get_link_note')}</a>
            </div>
          </section>

          <div className="get-link-quicklinks">
            <Link href="/social-vouchers" className="quick-utility-item">
              <span>📱</span>{t('sidebar_social_vouchers')}
            </Link>
            <Link href="/orders" className="quick-utility-item">
              <span>🕐</span>{t('get_link_history')}
            </Link>
            <Link href="/referrals" className="quick-utility-item">
              <span>👥</span>{t('sidebar_referrals')}
            </Link>
          </div>

          <section className="two-column-grid">
            <div className="panel">
              <h3>{t('how_it_works')}</h3>
              <ol className="ordered-list">
                <li>{t('step1')}</li>
                <li>{t('step2')}</li>
                <li>{t('step3')}</li>
                <li>{t('step4')}</li>
              </ol>
            </div>

            <div className="panel" id="important-rule-section">
              <h3>{t('important_rule')}</h3>
              <p className="muted-copy">{t('important_rule_desc')}</p>
            </div>
          </section>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
