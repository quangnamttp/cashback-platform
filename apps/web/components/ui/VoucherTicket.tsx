'use client';

import { CopyCodeButton } from './CopyCodeButton';

const PLATFORM_ACCENT: Record<string, string> = {
  Facebook: '#1877f2',
  Instagram: '#c13584',
  YouTube: '#ff0000',
  TikTok: '#111827',
};

const PLATFORM_ICON: Record<string, string> = {
  Facebook: '📘',
  Instagram: '📷',
  YouTube: '▶️',
  TikTok: '🎵',
};

type Voucher = {
  platform: string;
  title: string;
  code: string;
  discount: string;
  condition: string;
  expiry: string;
  status: string;
  usedPercent?: number;
};

export function VoucherTicket({ voucher, applyLabel }: { voucher: Voucher; applyLabel: string }) {
  const accent = PLATFORM_ACCENT[voucher.platform] ?? 'var(--primary)';
  const icon = PLATFORM_ICON[voucher.platform] ?? '🎟️';

  return (
    <div className="voucher-ticket">
      <div className="voucher-ticket-side" style={{ background: accent }}>
        <span>{icon}</span>
        {voucher.platform}
      </div>

      <div className="voucher-ticket-body">
        <div className="voucher-ticket-top">
          <div>
            <h3>{voucher.discount}</h3>
            <p>{voucher.condition}</p>
          </div>
          {voucher.status === 'Limited' && <span className="voucher-ticket-new">Mới</span>}
        </div>

        <div className="voucher-ticket-meta">
          <span className="voucher-ticket-exclusive" style={{ color: accent, borderColor: accent }}>
            Độc quyền {voucher.platform}
          </span>
          <span className="voucher-ticket-expiry">HSD: {voucher.expiry}</span>
        </div>

        {typeof voucher.usedPercent === 'number' && (
          <div className="voucher-ticket-progress">
            <div className="voucher-ticket-progress-bar" style={{ width: `${voucher.usedPercent}%`, background: accent }} />
          </div>
        )}

        <div className="voucher-ticket-footer">
          <span className="coupon-code">{voucher.code}</span>
          <CopyCodeButton code={voucher.code} label={applyLabel} />
        </div>
      </div>
    </div>
  );
}
