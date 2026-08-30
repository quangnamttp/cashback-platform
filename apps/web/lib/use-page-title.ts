'use client';

import { useEffect } from 'react';

const SITE_NAME = 'Cashback Platform';

/**
 * Sets the browser tab title for the current page. Needed because these
 * pages are Client Components (they use hooks like useLanguage/useAuth),
 * so the Next.js App Router `export const metadata` API — which only
 * works in Server Components — isn't available here.
 */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} - ${SITE_NAME}` : SITE_NAME;
  }, [title]);
}
