import crypto from 'node:crypto';
import type { AuthenticatedPrincipal } from '../middleware/auth.ts';

export const SESSION_COOKIE_NAME = 'acs_session';

const EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  return process.env.ACS_SESSION_SECRET || process.env.SESSION_SECRET || EPHEMERAL_FALLBACK_SECRET;
}

interface SessionPayload {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  authProvider: string;
  exp: number;
}

function signPayload(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(encodedPayload)
    .digest('base64url');
}

export function createSessionToken(
  principal: AuthenticatedPrincipal,
  ttlSeconds = 60 * 60 * 24 * 7
): string {
  const payload: SessionPayload = {
    uid: principal.uid,
    email: principal.email,
    displayName: principal.displayName,
    avatarUrl: principal.avatarUrl,
    emailVerified: Boolean(principal.emailVerified),
    authProvider: principal.authProvider || 'password',
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = signPayload(encoded);
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string | undefined): AuthenticatedPrincipal | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  const expectedSig = signPayload(encoded);
  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.uid || !parsed.email || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return {
      uid: parsed.uid,
      email: parsed.email,
      displayName: parsed.displayName || parsed.email.split('@')[0] || 'Developer',
      avatarUrl: parsed.avatarUrl ?? null,
      emailVerified: Boolean(parsed.emailVerified),
      authProvider: parsed.authProvider || 'password',
      isDemo: false,
    };
  } catch {
    return null;
  }
}

export function serializeSessionCookie(
  token: string,
  options: { rememberMe: boolean; isSecure: boolean }
): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (options.rememberMe) {
    parts.push(`Max-Age=${60 * 60 * 24 * 7}`);
  }
  if (options.isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function serializeClearSessionCookie(isSecure: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}
