'use client';

import { useEffect } from 'react';

export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="app-modal-overlay" onClick={onClose}>
      <div className="app-modal-panel" onClick={(e) => e.stopPropagation()}>
        <button className="app-modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {children}
      </div>
    </div>
  );
}
