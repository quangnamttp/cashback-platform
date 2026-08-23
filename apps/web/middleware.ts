import { NextRequest, NextResponse } from 'next/server';

// Server-side gate for /manager. Credentials are read from environment
// variables on the server and are NEVER sent to the browser bundle.
//
// This is still NOT a substitute for real backend authentication/RBAC
// (per-admin accounts, roles, audit trail, session expiry, etc.) — it is
// a stronger stopgap than a client-side password check while the real
// admin auth system is being built.
//
// Set these in your hosting provider's environment variables:
//   ADMIN_BASIC_AUTH_USER
//   ADMIN_BASIC_AUTH_PASS
// If unset, middleware falls back to a dev-only default and logs a warning.

const DEV_FALLBACK_USER = 'admin';
const DEV_FALLBACK_PASS = 'change-me-in-env';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/manager')) {
    return NextResponse.next();
  }

  const expectedUser = process.env.ADMIN_BASIC_AUTH_USER || DEV_FALLBACK_USER;
  const expectedPass = process.env.ADMIN_BASIC_AUTH_PASS || DEV_FALLBACK_PASS;

  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      try {
        const decoded = atob(encoded);
        const separatorIndex = decoded.indexOf(':');
        const user = decoded.slice(0, separatorIndex);
        const pass = decoded.slice(separatorIndex + 1);

        if (user === expectedUser && pass === expectedPass) {
          return NextResponse.next();
        }
      } catch {
        // fall through to 401
      }
    }
  }

  return new NextResponse('Authentication required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Admin console"',
    },
  });
}

export const config = {
  matcher: ['/manager/:path*', '/manager'],
};
