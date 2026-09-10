'use client';

import { useEffect, useState } from 'react';

// Branded boot splash. This is a static-export app (next.config.mjs's
// output:'export') — every page's real HTML is already fully rendered
// into the SAME initial document at build time, so there is no blank
// screen while JS loads, only a brief pre-hydration window. This splash
// covers the page for exactly that window, then gets out of the way.
//
// `hidden` starts false identically on the server render and the first
// client render (no hydration mismatch), then flips true the instant this
// component mounts — a plain empty-deps useEffect always fires exactly
// once, right after hydration, so there is no possible re-trigger loop.
// The short fallback timeout is pure defense-in-depth; in practice the
// effect always wins first. Purely a CSS overlay with no dependency on
// auth/theme/language/Firestore state, so it can never block or be
// blocked by login, wallet, orders, ACCESSTRADE, or admin flows.
export function AppLoadingScreen() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(true);
    const fallback = setTimeout(() => setHidden(true), 1500);
    return () => clearTimeout(fallback);
  }, []);

  return (
    <div className={`app-boot-splash${hidden ? ' app-boot-splash-hidden' : ''}`} aria-hidden={hidden}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="Hoàn Tiền DV" width={72} height={72} />
    </div>
  );
}
