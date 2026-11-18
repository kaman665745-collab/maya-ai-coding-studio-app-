import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Code2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User as UserIcon,
  X,
} from 'lucide-react';
import {
  evaluatePasswordStrength,
  isValidEmail,
  mapFirebaseAuthError,
  validateFullName,
} from '../domain/auth.ts';
import { syncServerAuthSession } from '../lib/apiClient.ts';
import {
  confirmResetPassword,
  registerWithEmailCredentials,
  sendPasswordResetForEmail,
  signInWithEmailCredentials,
  signInWithGoogleAccount,
  verifyEmailWithCode,
  verifyResetPasswordCode,
} from '../lib/firebase.ts';
import { OwnerInstagramCard } from './OwnerInstagramCard.tsx';

export type AuthRouteMode = 'login' | 'signup' | 'forgot-password' | 'reset-password';

interface AuthPagesProps {
  mode: AuthRouteMode;
  actionCode: string | null;
  actionType: string | null;
  onNavigateAuth: (nextMode: AuthRouteMode) => void;
  onAuthSuccess: (redirectHint?: string) => Promise<void>;
}

function AcsLogo() {
  return (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-sky-600/15 border border-sky-500/40 flex items-center justify-center shrink-0">
        <Code2 className="w-5 h-5 text-sky-400" />
      </div>
      <div>
        <div className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
          Advanced Coding Studio
        </div>
        <div className="text-xs text-slate-400">Developer Workbench</div>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className="w-4 h-4 shrink-0"
      aria-hidden="true"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

export function AuthPages({
  mode,
  actionCode,
  actionType,
  onNavigateAuth,
  onAuthSuccess,
}: AuthPagesProps) {
  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  // Registration state
  const [fullName, setFullName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  // Forgot & Reset password state
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetTargetEmail, setResetTargetEmail] = useState<string | null>(null);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const passwordStrength = evaluatePasswordStrength(
    mode === 'signup' ? signupPassword : newPassword
  );

  // Clear banners when switching between auth routes
  useEffect(() => {
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [mode]);

  // Verify incoming Firebase oobCode for resetPassword or verifyEmail
  useEffect(() => {
    if (mode !== 'reset-password') return;
    if (!actionCode) {
      setErrorMsg('No password reset or verification token was found in the URL.');
      return;
    }

    let cancelled = false;
    const validateCode = async () => {
      setVerifyingCode(true);
      setErrorMsg(null);
      try {
        if (actionType === 'verifyEmail') {
          await verifyEmailWithCode(actionCode);
          if (!cancelled) {
            setSuccessMsg('Your email address has been verified. You can log in now.');
            setResetSuccess(true);
          }
        } else {
          const email = await verifyResetPasswordCode(actionCode);
          if (!cancelled) {
            setResetTargetEmail(email);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(mapFirebaseAuthError(err));
        }
      } finally {
        if (!cancelled) {
          setVerifyingCode(false);
        }
      }
    };
    void validateCode();

    return () => {
      cancelled = true;
    };
  }, [mode, actionCode, actionType]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isValidEmail(loginEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    if (!loginPassword) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const cred = await signInWithEmailCredentials({
        email: loginEmail,
        password: loginPassword,
        rememberMe,
      });
      await syncServerAuthSession({
        idToken: cred.idToken,
        rememberMe,
        fullName: cred.user.displayName || undefined,
      });
      await onAuthSuccess();
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleContinue = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setSubmitting(true);
    try {
      const cred = await signInWithGoogleAccount(rememberMe);
      await syncServerAuthSession({
        idToken: cred.idToken,
        rememberMe,
        fullName: cred.user.displayName || undefined,
      });
      await onAuthSuccess();
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const nameErr = validateFullName(fullName);
    if (nameErr) {
      setErrorMsg(nameErr);
      return;
    }
    if (!isValidEmail(signupEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }
    const strength = evaluatePasswordStrength(signupPassword);
    if (!strength.valid && strength.message) {
      setErrorMsg(strength.message);
      return;
    }
    if (signupPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (!acceptedTerms) {
      setErrorMsg('Please accept the Terms of Service and Privacy Policy to create an account.');
      return;
    }

    setSubmitting(true);
    try {
      const cred = await registerWithEmailCredentials({
        fullName: fullName.trim(),
        email: signupEmail,
        password: signupPassword,
      });
      await syncServerAuthSession({
        idToken: cred.idToken,
        rememberMe: true,
        fullName: fullName.trim(),
      });
      await onAuthSuccess();
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!isValidEmail(forgotEmail)) {
      setErrorMsg('Please enter the email address registered with your account.');
      return;
    }

    setSubmitting(true);
    try {
      await sendPasswordResetForEmail(forgotEmail);
      setSuccessMsg(
        `Password reset instructions have been sent to ${forgotEmail.trim()}. Check your inbox and follow the reset link.`
      );
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionCode) return;
    setErrorMsg(null);

    const strength = evaluatePasswordStrength(newPassword);
    if (!strength.valid && strength.message) {
      setErrorMsg(strength.message);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await confirmResetPassword(actionCode, newPassword);
      setResetSuccess(true);
      setSuccessMsg('Your password has been updated. Sign in with your new password.');
    } catch (err) {
      setErrorMsg(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full overflow-y-auto bg-[#0B0F17] text-slate-100 flex flex-col justify-center py-5 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Desktop Editorial Context Panel */}
        <section className="hidden lg:block lg:col-span-6 space-y-6 pr-4">
          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-wider uppercase text-sky-400">
              Isolated AI Engineering Workspace
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-slate-100 leading-tight [text-wrap:balance]">
              Build, inspect, and ship code with checkpointed safety.
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed max-w-lg">
              Sign in to access your private projects, server-side Gemini coding agents, diff-approved patches, isolated esbuild previews, and version history.
            </p>
          </div>

          <div className="border-t border-slate-800 pt-6 grid grid-cols-2 gap-6 text-xs">
            <div className="space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                Zero-Trust Backend Auth
              </div>
              <p className="text-slate-400 leading-relaxed">
                Every workspace API route verifies your Firebase ID token and signed HttpOnly session cookie.
              </p>
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-slate-200 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                Diff-Gated Edits
              </div>
              <p className="text-slate-400 leading-relaxed">
                AI patches are validated in ephemeral sandboxes and require explicit approval before touching files.
              </p>
            </div>
          </div>
        </section>

        {/* Auth Interactive Column */}
        <main className="lg:col-span-6 w-full max-w-md mx-auto">
          <div className="rounded-xl border border-slate-800 bg-[#111827] p-6 sm:p-7 shadow-xl space-y-4">
            {/* ==================== 1. LOGIN PAGE (STRICT ORDER 1-11) ==================== */}
            {mode === 'login' && (
              <>
                {/* 1. Website logo and name */}
                <AcsLogo />

                {/* 2. Welcome heading & 3. Short description */}
                <div className="space-y-1">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                    Welcome Back
                  </h1>
                  <p className="text-sm text-slate-400">
                    Login to continue to your account
                  </p>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-800/80 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200 flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleEmailLogin} noValidate className="space-y-4">
                  {/* 4. Email address input */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-email"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  {/* 5. Password input + Show/Hide button */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="login-password"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="login-password"
                        type={showLoginPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        required
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="Enter your password"
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-9 pr-10 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowLoginPassword((s) => !s)}
                        aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 rounded"
                      >
                        {showLoginPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 6. Remember me & Forgot Password */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                      <input
                        id="remember-me-checkbox"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-slate-700 bg-[#0B0F17] text-sky-500"
                      />
                      <span>Remember me</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('forgot-password')}
                      className="text-sky-400 hover:text-sky-300 font-medium hover:underline"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {/* 7. Login button */}
                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Logging in...' : 'Login'}
                  </button>
                </form>

                {/* 8. OR separator */}
                <div className="relative flex items-center py-0.5">
                  <div className="flex-grow border-t border-slate-800" />
                  <span className="mx-3 text-xs font-medium text-slate-500 shrink-0">OR</span>
                  <div className="flex-grow border-t border-slate-800" />
                </div>

                {/* 9. Continue with Google button */}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleGoogleContinue()}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-700 bg-[#0B0F17] hover:bg-slate-800 text-sm font-medium text-slate-100 inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
                >
                  <GoogleMark />
                  <span>Continue with Google</span>
                </button>

                {/* 10. Create New Account / Sign Up link */}
                <div className="text-center text-xs text-slate-400">
                  Don&apos;t have an account?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigateAuth('signup')}
                    className="text-sky-400 hover:text-sky-300 font-semibold hover:underline"
                  >
                    Create New Account / Sign Up
                  </button>
                </div>

                {/* 11. Owner Instagram section */}
                <OwnerInstagramCard />
              </>
            )}

            {/* ==================== 2. REGISTRATION PAGE ==================== */}
            {mode === 'signup' && (
              <>
                <AcsLogo />

                <div className="space-y-1">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                    Create Your Account
                  </h1>
                  <p className="text-sm text-slate-400">
                    Sign up to start building in Advanced Coding Studio
                  </p>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-800/80 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200 flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                <form onSubmit={handleSignup} noValidate className="space-y-3.5">
                  <div className="space-y-1">
                    <label
                      htmlFor="signup-name"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Full name
                    </label>
                    <div className="relative">
                      <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="signup-name"
                        type="text"
                        autoComplete="name"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Deepak Yadav"
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="signup-email"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Email address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="signup-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={signupEmail}
                        onChange={(e) => setSignupEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="signup-password"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="signup-password"
                        type={showSignupPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={signupPassword}
                        onChange={(e) => setSignupPassword(e.target.value)}
                        placeholder="At least 8 chars, upper, lower & number"
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-9 pr-10 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignupPassword((s) => !s)}
                        aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 rounded"
                      >
                        {showSignupPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    {signupPassword && (
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-0.5">
                        <span
                          className={
                            passwordStrength.valid ? 'text-emerald-400' : 'text-amber-400'
                          }
                        >
                          Strength: {passwordStrength.score}/4
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>8+ chars, A-Z, a-z, 0-9</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label
                      htmlFor="signup-confirm-password"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="signup-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-9 pr-10 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((s) => !s)}
                        aria-label={
                          showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                        }
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 rounded"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer pt-1">
                    <input
                      id="terms-checkbox"
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 bg-[#0B0F17] text-sky-500"
                    />
                    <span>
                      I accept the{' '}
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="text-sky-400 hover:underline font-medium"
                      >
                        Terms of Service &amp; Privacy Policy
                      </button>
                      .
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Creating Account...' : 'Create Account'}
                  </button>
                </form>

                <div className="relative flex items-center">
                  <div className="flex-grow border-t border-slate-800" />
                  <span className="mx-3 text-xs font-medium text-slate-500 shrink-0">OR</span>
                  <div className="flex-grow border-t border-slate-800" />
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleGoogleContinue()}
                  className="w-full py-2.5 px-4 rounded-lg border border-slate-700 bg-[#0B0F17] hover:bg-slate-800 text-sm font-medium text-slate-100 inline-flex items-center justify-center gap-2.5 transition-colors disabled:opacity-50"
                >
                  <GoogleMark />
                  <span>Continue with Google</span>
                </button>

                <div className="text-center text-xs text-slate-400">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => onNavigateAuth('login')}
                    className="text-sky-400 hover:text-sky-300 font-semibold hover:underline"
                  >
                    Login
                  </button>
                </div>

                <OwnerInstagramCard />
              </>
            )}

            {/* ==================== 3. FORGOT PASSWORD PAGE ==================== */}
            {mode === 'forgot-password' && (
              <>
                <AcsLogo />

                <div className="space-y-1">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                    Reset Your Password
                  </h1>
                  <p className="text-sm text-slate-400">
                    Enter your registered email and we&apos;ll send a secure recovery link.
                  </p>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-800/80 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200 flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div
                    role="status"
                    className="rounded-lg border border-emerald-800/80 bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-200 flex items-start gap-2.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{successMsg}</span>
                  </div>
                )}

                <form onSubmit={handleForgotPassword} noValidate className="space-y-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="forgot-email"
                      className="block text-xs font-medium text-slate-300"
                    >
                      Registered email address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        id="forgot-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-9 pr-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Sending Reset Link...' : 'Send Password Reset Email'}
                  </button>
                </form>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => onNavigateAuth('login')}
                    className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Login
                  </button>
                </div>

                <OwnerInstagramCard />
              </>
            )}

            {/* ==================== 4. RESET PASSWORD / ACTION HANDLER ==================== */}
            {mode === 'reset-password' && (
              <>
                <AcsLogo />

                <div className="space-y-1">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                    {actionType === 'verifyEmail' ? 'Email Verification' : 'Create New Password'}
                  </h1>
                  <p className="text-sm text-slate-400">
                    {resetTargetEmail
                      ? `Setting a new password for ${resetTargetEmail}`
                      : 'Validating your security link'}
                  </p>
                </div>

                {verifyingCode && (
                  <div className="text-xs text-slate-400 py-4">
                    Verifying security link...
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="rounded-lg border border-rose-800/80 bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-200 flex items-start gap-2.5"
                  >
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </div>
                )}

                {successMsg && (
                  <div
                    role="status"
                    className="rounded-lg border border-emerald-800/80 bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-200 flex items-start gap-2.5"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{successMsg}</span>
                  </div>
                )}

                {!verifyingCode && !resetSuccess && resetTargetEmail && (
                  <form onSubmit={handleConfirmResetPassword} noValidate className="space-y-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="reset-new-password"
                        className="block text-xs font-medium text-slate-300"
                      >
                        New password
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="reset-new-password"
                          type={showNewPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          required
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="At least 8 chars, upper, lower & number"
                          className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] pl-9 pr-10 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((s) => !s)}
                          aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 rounded"
                        >
                          {showNewPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor="reset-confirm-password"
                        className="block text-xs font-medium text-slate-300"
                      >
                        Confirm new password
                      </label>
                      <input
                        id="reset-confirm-password"
                        type={showNewPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Re-enter new password"
                        className="w-full rounded-lg border border-slate-700 bg-[#0B0F17] px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full py-2.5 px-4 text-sm font-semibold rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors disabled:opacity-50"
                    >
                      {submitting ? 'Updating Password...' : 'Save New Password'}
                    </button>
                  </form>
                )}

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={() => onNavigateAuth('login')}
                    className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Return to Login
                  </button>
                  {errorMsg && (
                    <button
                      type="button"
                      onClick={() => onNavigateAuth('forgot-password')}
                      className="text-slate-300 hover:text-white underline"
                    >
                      Request new reset email
                    </button>
                  )}
                </div>

                <OwnerInstagramCard />
              </>
            )}
          </div>
        </main>
      </div>

      {/* Terms & Privacy Summary Modal */}
      {showTermsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="terms-dialog-title"
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div className="max-w-lg w-full rounded-xl border border-slate-700 bg-[#111827] p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="terms-dialog-title" className="text-base font-semibold text-slate-100">
                Terms of Service &amp; Privacy Notice
              </h2>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                aria-label="Close terms modal"
                className="p-1 text-slate-400 hover:text-slate-200 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-300 space-y-2.5 leading-relaxed">
              <p>
                Authentication credentials are managed exclusively by Firebase Authentication and never stored in plain text on Advanced Coding Studio servers.
              </p>
              <p>
                Your workspace files, checkpoints, code reviews, and audit logs are tenant-isolated by your authenticated user ID (`uid`) and protected behind verified server-side authorization checks.
              </p>
              <p>
                AI edits are never applied directly without your explicit diff review and checkpoint confirmation.
              </p>
            </div>
            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setAcceptedTerms(true);
                  setShowTermsModal(false);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-md bg-sky-600 hover:bg-sky-500 text-white"
              >
                Accept &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
