import { NextRequest, NextResponse } from 'next/server';
import { getChatGPTUser, isAllowedDashboardEmail } from '../../../chatgpt-auth';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const ALLOWED_PATH = /^(snapshot|leads(?:\/[0-9a-f-]+(?:\/(?:cadence|sms|outreach-events\/\d+|message-overrides\/\d+))?)?|review\/[0-9a-f-]+\/resolve|cadence-steps\/\d+|message-templates\/\d+)$/i;

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  if (!ALLOWED_METHODS.has(request.method)) {
    return NextResponse.json({ detail: 'method not allowed' }, { status: 405 });
  }

  const user = await getChatGPTUser();
  const localPreview =
    process.env.NODE_ENV !== 'production' &&
    process.env.DASHBOARD_ALLOW_LOCAL_DEMO === 'true';
  if (!user && !localPreview) {
    return NextResponse.json({ detail: 'authentication required' }, { status: 401 });
  }

  if (process.env.NODE_ENV === 'production' && (!user || !isAllowedDashboardEmail(user.email))) {
    return NextResponse.json({ detail: 'workspace access required' }, { status: 403 });
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

  const response = await fetch(`${origin}/api/v1/dashboard/${relativePath}`, {
    method: request.method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'X-Dashboard-Token': token,
      'X-Dashboard-User-ID': user?.userId ?? 'local-preview',
      'X-Dashboard-User-Email': user?.email ?? 'local-preview@localhost',
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
