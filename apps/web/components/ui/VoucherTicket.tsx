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

export function VoucherTicket({
  voucher,
  applyLabel,
  featured = false,
}: {
  voucher: Voucher;
  applyLabel: string;
  featured?: boolean;
}) {
  const accent = PLATFORM_ACCENT[voucher.platform] ?? 'var(--primary)';
  const icon = PLATFORM_ICON[voucher.platform] ?? '🎟️';

  return (
    <div className="voucher-ticket-v2">
      {featured && <span className="voucher-ticket-v2-ribbon">⭐ Ưu đãi tốt nhất</span>}
      {voucher.status === 'Limited' && !featured && <span className="voucher-ticket-v2-ribbon warning">Mới</span>}

      <div className="voucher-ticket-v2-side" style={{ background: accent }}>
        <span className="voucher-ticket-v2-icon">{icon}</span>
        <span className="voucher-ticket-v2-platform">{voucher.platform}</span>
      </div>

      <div className="voucher-ticket-v2-body">
        <div className="voucher-ticket-v2-top">
          <h3>{voucher.discount}</h3>
          <span className="voucher-ticket-v2-exclusive" style={{ color: accent, borderColor: accent }}>
            Độc quyền {voucher.platform}
          </span>
        </div>

        <p className="voucher-ticket-v2-condition">{voucher.condition}</p>

        {typeof voucher.usedPercent === 'number' && (
          <div className="voucher-ticket-v2-progress-row">
            <div className="voucher-ticket-v2-progress">
              <div className="voucher-ticket-v2-progress-bar" style={{ width: `${voucher.usedPercent}%`, background: accent }} />
            </div>
            <span>Đã dùng {voucher.usedPercent}%</span>
          </div>
        )}

        <div className="voucher-ticket-v2-footer">
          <div>
            <span className="voucher-ticket-v2-expiry">HSD: {voucher.expiry}</span>
            <span className="coupon-code">{voucher.code}</span>
          </div>
          <CopyCodeButton code={voucher.code} label={applyLabel} />
        </div>
      </div>
    </div>
  );
}
