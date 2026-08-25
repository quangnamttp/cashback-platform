'use client';

import { useState } from 'react';

export function CopyCodeButton({
  code,
  label,
  className = 'button-secondary',
}: {
  code: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className={`button ${className} coupon-btn`} onClick={handleClick}>
      {copied ? '✓ Copied' : label}
    </button>
  );
}
