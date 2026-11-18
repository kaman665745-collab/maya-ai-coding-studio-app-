export interface PasswordStrengthResult {
  valid: boolean;
  score: number;
  checks: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
  };
  message: string | null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 254) return false;
  return EMAIL_PATTERN.test(trimmed);
}

export function validateFullName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return 'Full name must be at least 2 characters.';
  }
  if (trimmed.length > 80) {
    return 'Full name must be 80 characters or fewer.';
  }
  return null;
}

export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;
  let message: string | null = null;
  if (!checks.minLength) {
    message = 'Password must be at least 8 characters.';
  } else if (!checks.hasUppercase || !checks.hasLowercase || !checks.hasNumber) {
    message = 'Password must include uppercase, lowercase, and at least one number.';
  }

  return {
    valid: checks.minLength && checks.hasUppercase && checks.hasLowercase && checks.hasNumber,
    score,
    checks,
    message,
  };
}

export function sanitizeRedirectPath(rawPath: string | null | undefined): string {
  if (!rawPath) return '/';
  const trimmed = rawPath.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.includes('\\')) {
    return '/';
  }
  if (
    trimmed === '/login' ||
    trimmed === '/signup' ||
    trimmed === '/forgot-password' ||
    trimmed === '/reset-password'
  ) {
    return '/';
  }
  return trimmed;
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const rawVal = part.slice(eqIndex + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

export function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const msg = error instanceof Error ? error.message : String(error || '');

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email address or password. Please verify your credentials and try again.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please log in instead.';
    case 'auth/weak-password':
      return 'Password is too weak. Choose at least 8 characters with letters and numbers.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a few minutes or reset your password.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact workspace support.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in window was closed before completing authentication.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Allow popups for this site and try again.';
    case 'auth/cancelled-popup-request':
      return 'Another authentication window is already open.';
    case 'auth/expired-action-code':
      return 'This reset or verification link has expired. Please request a new link.';
    case 'auth/invalid-action-code':
      return 'This reset or verification link is invalid or has already been used.';
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not yet enabled in Firebase Console (Authentication > Sign-in method).';
    case 'auth/network-request-failed':
      return 'Network error while contacting authentication servers. Check your connection and retry.';
    default:
      if (msg.includes('auth/')) {
        return msg.replace(/^Firebase:\s*/i, '');
      }
      return msg || 'Authentication failed. Please try again.';
  }
}
