'use client';

import { useState } from 'react';
import { AppShell } from '../../components/layout/AppShell';
import { useLanguage } from '../../lib/i18n';
import { mockFaq } from '../../lib/mock-data';
import { RequireAuth } from '../../components/layout/RequireAuth';
import { usePageTitle } from '../../lib/use-page-title';
import { useAuth } from '../../lib/auth';
import { CopyCodeButton } from '../../components/ui/CopyCodeButton';

const SUPPORT_EMAIL = 'hoantiendv@gmail.com';

export default function SupportPage() {
  const { t } = useLanguage();
  const { userEmail } = useAuth();
  usePageTitle(t('support_title'));
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const mailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Hỗ trợ khách hàng - Hoàn Tiền DV')}&body=${encodeURIComponent(
    `Xin chào đội ngũ Hoàn Tiền DV,\n\nTài khoản của tôi: ${userEmail || '(chưa đăng nhập)'}\n\nNội dung cần hỗ trợ:\n`,
  )}`;

  return (
    <RequireAuth>
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
            <a href={mailtoHref} className="button button-primary wide-button">
              ✉️ {t('support_email_btn')}
            </a>
            <div className="support-email-fallback">
              <span>{SUPPORT_EMAIL}</span>
              <CopyCodeButton code={SUPPORT_EMAIL} label="📋 Sao chép" className="button-secondary" />
            </div>
            <p className="muted-copy" style={{ fontSize: '0.75rem', marginTop: 4 }}>
              Nếu máy chưa cài sẵn ứng dụng email, hãy copy địa chỉ trên và gửi thủ công từ Gmail/Outlook của bạn.
            </p>
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
    </RequireAuth>
  );
}
