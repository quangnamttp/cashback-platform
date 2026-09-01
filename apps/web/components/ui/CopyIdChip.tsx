'use client';

import { useState } from 'react';

/** Compact one-tap copy chip for table cells — tap to copy an ID/code straight
 * into the clipboard, so an admin can paste it into AdminSearchToolbar the
 * moment a customer reads it out over chat. */
export function CopyIdChip({ value, mono = true }: { value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button type="button" className="copy-id-chip" onClick={handleClick} title="Sao chép">
      <span className={mono ? 'copy-id-chip-code' : undefined}>{value}</span>
      <span className="copy-id-chip-icon">{copied ? '✓' : '📋'}</span>
    </button>
  );
}
