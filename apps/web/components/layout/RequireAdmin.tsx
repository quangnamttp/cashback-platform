'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';

const ADMIN_LOGIN_PATH = '/manager/login';

/**
 * Replaces the old middleware.ts Basic Auth gate, which never actually ran
 * on the deployed site (Next.js middleware doesn't execute against a static
 * `output: 'export'` build served from Firebase Hosting). Checks the
 * `role` field on the signed-in user's own Firestore doc (no Cloud
 * Functions/custom claims in this architecture) — the real protection for
 * admin-only data lives in firestore.rules, not in this gate (this only
 * prevents the page from rendering for the wrong user, it isn't the
 * security boundary).
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, authLoading, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isLoginPage = pathname === ADMIN_LOGIN_PATH;

  useEffect(() => {
    if (isLoginPage || authLoading) return;
    if (!isLoggedIn) {
      router.replace(ADMIN_LOGIN_PATH);
      return;
    }
    if (!isAdmin) {
      router.replace('/');
    }
  }, [isLoginPage, authLoading, isLoggedIn, isAdmin, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  if (authLoading || !isLoggedIn || !isAdmin) {
    return null;
  }

  return <>{children}</>;
}
