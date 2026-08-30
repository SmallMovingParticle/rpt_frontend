import { cookies } from 'next/headers';

/**
 * Staff session for hosts that are not OpenAI Sites.
 *
 * The previous implementation trusted `oai-authenticated-user-*` request
 * headers. Those are set by OpenAI's hosting proxy and are safe only there:
 * on any other host a client can send them itself and be treated as staff.
 * This replaces them with a cookie the server signs, so a session can only be
 * created by someone who knows DASHBOARD_STAFF_PASSWORD.
 */

export type StaffUser = {
  userId: string;
  displayName: string;
  email: string;
  fullName: string | null;
};

const COOKIE = 'rpt_staff_session';
const MAX_AGE_SECONDS = 60 * 60 * 12;

function secret(): string {
  const value = process.env.DASHBOARD_SESSION_SECRET ?? '';
  if (value.length < 32) {
    throw new Error('DASHBOARD_SESSION_SECRET must be at least 32 characters');
  }
  return value;
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return base64url(new Uint8Array(signature));
}

/** Length-independent comparison so a wrong value leaks no timing signal. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAllowedDashboardEmail(email: string): boolean {
  const allowed = (process.env.DASHBOARD_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  // An empty allowlist denies everyone rather than admitting everyone.
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}

export async function verifyStaffPassword(candidate: string): Promise<boolean> {
  const expected = process.env.DASHBOARD_STAFF_PASSWORD ?? '';
  if (expected.length < 12) return false;
  // Compare digests so differing lengths cannot short-circuit the check.
  const [a, b] = await Promise.all([sign(`pw:${candidate}`), sign(`pw:${expected}`)]);
  return safeEqual(a, b);
}

export async function createSessionCookieValue(email: string): Promise<string> {
  const payload = JSON.stringify({
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS,
  });
  const encoded = base64url(new TextEncoder().encode(payload));
  return `${encoded}.${await sign(encoded)}`;
}

async function readSession(raw: string | undefined): Promise<StaffUser | null> {
  if (!raw) return null;
  const [encoded, signature] = raw.split('.');
  if (!encoded || !signature) return null;
  if (!safeEqual(signature, await sign(encoded))) return null;

  let parsed: { email?: string; exp?: number };
  try {
    parsed = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(encoded.replace(/-/g, '+').replace(/_/g, '/')),
          (character) => character.charCodeAt(0),
        ),
      ),
    );
  } catch {
    return null;
  }

  const email = parsed.email;
  if (!email || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
  // Re-checked on every request so removing an address revokes live sessions.
  if (!isAllowedDashboardEmail(email)) return null;

  return { userId: email, displayName: email, email, fullName: null };
}

export async function getStaffUser(): Promise<StaffUser | null> {
  try {
    return await readSession((await cookies()).get(COOKIE)?.value);
  } catch {
    // A missing or malformed secret must fail closed, never open.
    return null;
  }
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = MAX_AGE_SECONDS;
