'use client';

import { useState } from 'react';
import { displayOrderId } from '../../lib/orderId';

/** Compact one-tap copy chip for table cells — tap to copy an ID/code straight
 * into the clipboard, so an admin can paste it into AdminSearchToolbar the
 * moment a customer reads it out over chat. Strips the `accesstrade_`
 * prefix an AFFILIATE order's id carries (see lib/orderId.ts) — search
 * matching elsewhere still works since it's a substring match against the
 * full underlying id, unaffected by what's shown/copied here. */
export function CopyIdChip({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const displayValue = displayOrderId(value);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(displayValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="copy-id-chip" onClick={handleClick} title="Sao chép">
      <span className={mono ? 'copy-id-chip-code' : undefined}>{displayValue}</span>
      <span className="copy-id-chip-icon">{copied ? '✓' : '📋'}</span>
    </button>
  );
}
