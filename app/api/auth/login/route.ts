import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionCookieValue,
  isAllowedDashboardEmail,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  verifyStaffPassword,
} from '../../../session';

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: 'invalid request' }, { status: 400 });
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !password) {
    return NextResponse.json({ detail: 'email and password are required' }, { status: 400 });
  }

  const allowed = isAllowedDashboardEmail(email);
  let correct = false;
  try {
    correct = await verifyStaffPassword(password);
  } catch {
    return NextResponse.json({ detail: 'sign-in is not configured' }, { status: 503 });
  }

  // One message for both failures, so this cannot be used to discover which
  // addresses are staff.
  if (!allowed || !correct) {
    return NextResponse.json({ detail: 'invalid email or password' }, { status: 401 });
  }

  const response = NextResponse.json({ email });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionCookieValue(email),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return response;
}
