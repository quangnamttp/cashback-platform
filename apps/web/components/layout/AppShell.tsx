'use client';

import { useState } from 'react';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';
import { SidebarNav } from './Sidebar';
import { RightPanel } from './RightPanel';
import { MobileBottomNav } from './MobileBottomNav';

export function AppShell({
  children,
  showRightPanel = true,
}: {
  children: React.ReactNode;
  showRightPanel?: boolean;
}) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <div className="app-shell">
      <SiteHeader onMenuToggle={() => setIsDrawerOpen(true)} />

      {isDrawerOpen && (
        <div className="mobile-drawer-overlay" onClick={() => setIsDrawerOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <button className="mobile-drawer-close" onClick={() => setIsDrawerOpen(false)} aria-label="Close menu">
              ✕
            </button>
            <SidebarNav onNavigate={() => setIsDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className={`app-body container${showRightPanel ? '' : ' no-right-panel'}`}>
        <aside className="app-sidebar">
          <SidebarNav />
        </aside>

        <main className="app-main">{children}</main>

        {showRightPanel && <RightPanel />}
      </div>

      <SiteFooter />

      <MobileBottomNav onMoreClick={() => setIsDrawerOpen(true)} />
    </div>
  );
}
