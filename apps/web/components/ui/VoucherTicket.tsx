'use client';

import { CopyCodeButton } from './CopyCodeButton';
import { SocialPlatformIcon } from './SocialPlatformIcons';

export const PLATFORM_ACCENT: Record<string, string> = {
  Facebook: '#1877f2',
  Instagram: '#c13584',
  YouTube: '#ff0000',
  TikTok: '#111827',
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
  matched = false,
  disabled = false,
  disabledReason,
  onApply,
}: {
  voucher: Voucher;
  applyLabel: string;
  featured?: boolean;
  /** True when this ticket was surfaced by matching a pasted product link — gets a glowing highlight. */
  matched?: boolean;
  /** True when this voucher doesn't apply to the currently-detected marketplace — dims the whole card and blocks the apply action. */
  disabled?: boolean;
  disabledReason?: string;
  /** Fires after the code is copied — used to also open the cashback-tracked purchase link. */
  onApply?: () => void;
}) {
  const accent = PLATFORM_ACCENT[voucher.platform] ?? 'var(--primary)';

  return (
    <div
      className={`voucher-ticket-v2${matched ? ' matched' : ''}${disabled ? ' disabled' : ''}`}
      style={matched && !disabled ? ({ ['--voucher-glow' as any]: accent }) : undefined}
    >
      {featured && !disabled && <span className="voucher-ticket-v2-ribbon">⭐ Ưu đãi tốt nhất</span>}
      {voucher.status === 'Limited' && !featured && !disabled && <span className="voucher-ticket-v2-ribbon warning">Mới</span>}

      <div className="voucher-ticket-v2-side" style={{ background: accent }}>
        <span className="voucher-ticket-v2-icon"><SocialPlatformIcon name={voucher.platform} size={30} /></span>
        <span className="voucher-ticket-v2-platform">{voucher.platform}</span>
      </div>

      <div className="voucher-ticket-v2-body">
        <div className="voucher-ticket-v2-top">
          <h3>{voucher.discount}</h3>
          <span className="voucher-ticket-v2-exclusive" style={{ color: accent, borderColor: accent }}>
            Độc quyền {voucher.platform}
          </span>
        </div>

        {voucher.title && <p className="voucher-ticket-v2-title">{voucher.title}</p>}
        <p className="voucher-ticket-v2-condition">{voucher.condition}</p>
        {disabled && disabledReason && <p className="voucher-ticket-v2-disabled-note">{disabledReason}</p>}

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
          <CopyCodeButton code={voucher.code} label={applyLabel} disabled={disabled} onAfterCopy={onApply} />
        </div>
      </div>
    </div>
  );
}
