'use client';

import { useEffect } from 'react';

/**
 * Full-screen image viewer — reuses the exact same `src` the thumbnail
 * already loaded (browser cache serves it instantly, no re-fetch). Click
 * on the backdrop or the close button to dismiss; clicking the image
 * itself does nothing (so a stray tap while viewing doesn't close it).
 */
export function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="image-lightbox-overlay" onClick={onClose}>
      <button type="button" className="image-lightbox-close" onClick={onClose} aria-label="Đóng">
        ✕
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="image-lightbox-img" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
