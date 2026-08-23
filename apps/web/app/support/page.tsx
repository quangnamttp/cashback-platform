'use client';

import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';
import { mockFaq } from '../../lib/mock-data';

export default function SupportPage() {
  const { t } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <AppShell showRightPanel={false}>
      <div className="page-shell">
        <div className="page-header">
          <div>
            <span className="eyebrow dark">{t('sidebar_support')}</span>
            <h1>{t('support_title')}</h1>
          </div>
        </div>

        <section className="two-column-grid">
          <div className="panel support-contact-card">
            <span className="promo-icon-badge">💬</span>
            <h3>{t('support_contact_title')}</h3>
            <p className="muted-copy">{t('support_contact_desc')}</p>
            <a href="mailto:support@cashback-platform.example" className="button button-primary wide-button">
              ✉️ {t('support_email_btn')}
            </a>
          </div>

          <div className="panel support-contact-card">
            <span className="promo-icon-badge">📖</span>
            <h3>{t('support_guide_title')}</h3>
            <p className="muted-copy">{t('support_guide_desc')}</p>
            <a href="/#guide" className="button button-secondary wide-button">
              📱 {t('guide_title')}
            </a>
          </div>
        </section>

        <section className="panel">
          <h3>{t('support_faq_title')}</h3>
          <div className="faq-list">
            {mockFaq.map((item, index) => (
              <div key={item.question} className="faq-item">
                <button
                  type="button"
                  className="faq-question"
                  onClick={() => setOpenIndex(openIndex === index ? null : index)}
                  aria-expanded={openIndex === index}
                >
                  {item.question}
                  <span>{openIndex === index ? '−' : '+'}</span>
                </button>
                {openIndex === index && <p className="faq-answer">{item.answer}</p>}
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
