import type { FastifyReply, FastifyRequest } from 'fastify';
import { parseCookieHeader } from '../../domain/auth.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { SESSION_COOKIE_NAME, verifySessionToken } from '../services/sessionCookie.ts';

export interface AuthenticatedPrincipal {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  authProvider: string;
  isDemo: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    principal?: AuthenticatedPrincipal;
  }
}

export async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  const queryToken =
    typeof (request.query as Record<string, unknown>)?.token === 'string'
      ? ((request.query as Record<string, unknown>).token as string)
      : null;

  const bearerToken =
    authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length).trim()
      : queryToken;

  if (bearerToken) {
    try {
      const decoded = await adminAuth.verifyIdToken(bearerToken);
      const signInProvider =
        typeof (decoded.firebase as { sign_in_provider?: unknown } | undefined)?.sign_in_provider === 'string'
          ? String((decoded.firebase as { sign_in_provider: string }).sign_in_provider)
          : 'firebase';

      request.principal = {
        uid: decoded.uid,
        email: decoded.email || `${decoded.uid}@users.acs.local`,
        displayName: decoded.name || decoded.email?.split('@')[0] || 'Developer',
        avatarUrl: decoded.picture || null,
        emailVerified: Boolean(decoded.email_verified),
        authProvider: signInProvider,
        isDemo: false,
      };
      return;
    } catch {
      // Fall through to verify whether a valid signed session cookie is present
    }
  }

  const cookies = parseCookieHeader(request.headers.cookie);
  const cookiePrincipal = verifySessionToken(cookies[SESSION_COOKIE_NAME]);
  if (cookiePrincipal) {
    request.principal = cookiePrincipal;
    return;
  }

  reply.code(401).send({
    error: 'Unauthorized',
    message: 'Authentication required. Please log in to continue.',
  });
}
