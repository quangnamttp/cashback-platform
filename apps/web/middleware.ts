import { NextRequest, NextResponse } from 'next/server';

// Server-side gate for /manager. Credentials are read from environment
// variables on the server and are NEVER sent to the browser bundle.
//
// This is still NOT a substitute for real backend authentication/RBAC
// (per-admin accounts, roles, audit trail, session expiry, etc.) — it is
// a stronger stopgap than a client-side password check while the real
// admin auth system is being built.
//
// Set these in your hosting provider's environment variables to override
// the defaults below:
//   ADMIN_BASIC_AUTH_USER
//   ADMIN_BASIC_AUTH_PASS
//
// The password can also be changed from /manager/settings, which stores
// the new password in a signed, httpOnly cookie (see /api/manager-auth).
// That cookie is checked here IN ADDITION to the env-based password, so
// either the original password or a changed one will work. Clearing
// cookies resets the password back to the env/default value.

const DEFAULT_USER = 'admin';
const DEFAULT_PASS = '31102001';
const OVERRIDE_COOKIE = 'manager_pw_override';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/manager')) {
    return NextResponse.next();
  }

  const expectedUser = process.env.ADMIN_BASIC_AUTH_USER || DEFAULT_USER;
  const expectedPass = process.env.ADMIN_BASIC_AUTH_PASS || DEFAULT_PASS;
  const overridePass = request.cookies.get(OVERRIDE_COOKIE)?.value;

  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      try {
        const decoded = atob(encoded);
        const separatorIndex = decoded.indexOf(':');
        const user = decoded.slice(0, separatorIndex);
        const pass = decoded.slice(separatorIndex + 1);

        const passwordMatches = pass === expectedPass || (overridePass !== undefined && pass === overridePass);

        if (user === expectedUser && passwordMatches) {
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
