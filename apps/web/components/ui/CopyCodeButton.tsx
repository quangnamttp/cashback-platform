'use client';

import { useState } from 'react';

export function CopyCodeButton({
  code,
  label,
  className = 'button-secondary',
  disabled = false,
  onAfterCopy,
}: {
  code: string;
  label: string;
  className?: string;
  disabled?: boolean;
  onAfterCopy?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
    onAfterCopy?.();
  };

  return (
    <button type="button" className={`button ${className} coupon-btn`} onClick={handleClick} disabled={disabled}>
      {copied ? '✓ Đã sao chép' : label}
    </button>
  );
}
