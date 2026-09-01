'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../lib/auth';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      // usePathname() alone drops the query string, which used to strand
      // e.g. /go?code=X redirects at a bare /go with no code. Reading
      // window.location.search directly (rather than useSearchParams())
      // keeps every RequireAuth-wrapped page eligible for static export —
      // that hook forces a page out of static rendering unless it has its
      // own Suspense boundary, which most callers here don't.
      const query = typeof window !== 'undefined' ? window.location.search : '';
      const next = query ? `${pathname}${query}` : pathname;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [authLoading, isLoggedIn, router, pathname]);

  if (authLoading || !isLoggedIn) {
    return null;
  }

  return <>{children}</>;
}
