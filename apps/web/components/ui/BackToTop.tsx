'use client';

import { useEffect, useState } from 'react';

const SHOW_AFTER_PX = 400;
const RADIUS = 19;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY;
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(scrollable > 0 ? Math.min(100, (scrollTop / scrollable) * 100) : 0);
      setVisible(scrollTop > SHOW_AFTER_PX);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const offset = CIRCUMFERENCE * (1 - progress / 100);

  return (
    <button
      type="button"
      className={`back-to-top-btn${visible ? ' visible' : ''}`}
      aria-label="Lên đầu trang"
      tabIndex={visible ? 0 : -1}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <svg width="44" height="44" viewBox="0 0 44 44" className="back-to-top-ring">
        <circle cx="22" cy="22" r={RADIUS} className="back-to-top-ring-track" />
        <circle
          cx="22"
          cy="22"
          r={RADIUS}
          className="back-to-top-ring-progress"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="back-to-top-arrow">
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
