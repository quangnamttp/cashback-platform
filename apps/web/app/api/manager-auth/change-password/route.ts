import { NextRequest, NextResponse } from 'next/server';

// Handles password changes for the /manager Basic Auth gate.
//
// Scope/limitations (disclosed honestly): this stores the new password in
// a single httpOnly cookie on the browser that changed it — there is no
// database, no per-admin accounts, and no audit trail. Anyone who already
// knows the current /manager password can change it. Clearing cookies (or
// using a different browser) reverts to the env-configured default. This
// is a step up from a fixed password, not a substitute for real admin
// accounts + RBAC.

const DEFAULT_USER = 'admin';
const DEFAULT_PASS = '31102001';
const OVERRIDE_COOKIE = 'manager_pw_override';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.currentPassword !== 'string' || typeof body.newPassword !== 'string') {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const { currentPassword, newPassword } = body;

  if (newPassword.length < 6) {
    return NextResponse.json({ error: 'password_too_short' }, { status: 400 });
  }

  const expectedPass = process.env.ADMIN_BASIC_AUTH_PASS || DEFAULT_PASS;
  const overridePass = request.cookies.get(OVERRIDE_COOKIE)?.value;

  const currentIsValid = currentPassword === expectedPass || (overridePass !== undefined && currentPassword === overridePass);

  if (!currentIsValid) {
    return NextResponse.json({ error: 'wrong_current_password' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(OVERRIDE_COOKIE, newPassword, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 180, // 180 days
  });

  return response;
}

export const runtime = 'nodejs';
