import { NextRequest, NextResponse } from 'next/server';
import { getStaffUser } from '../../../session';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
// Every backend route the browser may reach, listed explicitly. A path missing
// from here is rejected with "dashboard path not allowed", so this must be
// updated whenever a new dashboard endpoint is added.
const ALLOWED_PATH = /^(snapshot|leads(?:\/[0-9a-f-]+(?:\/(?:cadence|cadence-mode|stage|sms|outreach-events\/\d+|message-overrides\/\d+))?)?|review\/[0-9a-f-]+\/resolve|cadence-versions(?:\/\d+(?:\/(?:activate|name|permanent))?)?|cadence-steps\/\d+|message-templates(?:\/\d+)?)$/i;

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return NextResponse.json({ detail: 'method not allowed' }, { status: 405 });
  }

  // A valid signed session is required in every environment. The old build
  // allowed an unauthenticated local preview here; that is deliberately gone,
  // because this route reaches real patient data whatever NODE_ENV says.
  const user = await getStaffUser();
  if (!user) {
    return NextResponse.json({ detail: 'authentication required' }, { status: 401 });
  }

  const { path = [] } = await context.params;
  const relativePath = path.join('/');
  if (!ALLOWED_PATH.test(relativePath)) {
    return NextResponse.json({ detail: 'dashboard path not allowed' }, { status: 404 });
  }
  if (relativePath === 'leads' && request.method !== 'POST') {
    return NextResponse.json({ detail: 'method not allowed' }, { status: 405 });
  }

  const origin = process.env.DASHBOARD_API_ORIGIN?.replace(/\/$/, '');
  const token = process.env.DASHBOARD_API_TOKEN;
  if (!origin || !token) {
    return NextResponse.json({ detail: 'dashboard API is not configured' }, { status: 503 });
  }
  if (process.env.NODE_ENV === 'production' && !origin.startsWith('https://')) {
    return NextResponse.json({ detail: 'dashboard API must use HTTPS' }, { status: 503 });
  }

  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 20_000) {
    return NextResponse.json({ detail: 'request too large' }, { status: 413 });
  }

  const response = await fetch(`${origin}/api/v1/dashboard/${relativePath}${request.nextUrl.search}`, {
    method: request.method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Dashboard-Token': token,
      'X-Dashboard-User-ID': user.userId,
      'X-Dashboard-User-Email': user.email,
      'X-Trace-ID': crypto.randomUUID(),
    },
    body: request.method === 'GET' ? undefined : await request.text(),
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
