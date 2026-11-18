import { getFirebaseIdToken } from './firebase.ts';

export interface ServerUserProfile {
  uid: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  authProvider: string;
  workspaceId?: number;
  projectCount?: number;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 45_000, ...fetchOptions } = options;
  const token = await getFirebaseIdToken();
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string> | undefined),
  };

  if (fetchOptions.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      ...fetchOptions,
      credentials: 'include',
      headers,
      signal: fetchOptions.signal || controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request to /api/v1${path} timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutHandle);
  }

  const rawText = await res.text();
  let payload: unknown = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      if (res.ok) {
        throw new Error(`Expected JSON from /api/v1${path}, received unexpected response format.`);
      }
    }
  }

  if (!res.ok) {
    const errObj = (payload && typeof payload === 'object' ? payload : {}) as {
      message?: string;
      error?: string;
    };
    const msg = errObj.message || errObj.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return payload as T;
}

export async function syncServerAuthSession(input: {
  idToken: string;
  rememberMe: boolean;
  fullName?: string;
}): Promise<ServerUserProfile> {
  const res = await apiRequest<{ user: ServerUserProfile }>('/auth/session', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.user;
}

export async function logoutServerAuthSession(): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST' });
}

export async function fetchServerProfile(): Promise<ServerUserProfile> {
  const res = await apiRequest<{ user: ServerUserProfile }>('/auth/me');
  return res.user;
}

export async function updateServerDisplayName(displayName: string): Promise<ServerUserProfile> {
  const res = await apiRequest<{ user: ServerUserProfile }>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  });
  return res.user;
}

export async function getEventStreamUrl(): Promise<string> {
  const token = await getFirebaseIdToken();
  if (token) {
    return `/api/v1/events/stream?token=${encodeURIComponent(token)}`;
  }
  return '/api/v1/events/stream';
}
