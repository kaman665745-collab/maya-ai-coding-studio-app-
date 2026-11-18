import React, { useState } from 'react';
import {
  CheckCircle2,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  User as UserIcon,
} from 'lucide-react';
import { validateFullName } from '../domain/auth.ts';
import { updateServerDisplayName, type ServerUserProfile } from '../lib/apiClient.ts';
import {
  reloadCurrentFirebaseUser,
  resendCurrentUserVerification,
  updateFirebaseDisplayName,
} from '../lib/firebase.ts';

interface ProfilePaneProps {
  profile: ServerUserProfile;
  onProfileUpdated: (next: ServerUserProfile) => void;
  onRefreshVerification: (emailVerified: boolean) => void;
  onSignOut: () => Promise<void>;
}

export function ProfilePane({
  profile,
  onProfileUpdated,
  onRefreshVerification,
  onSignOut,
}: ProfilePaneProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const initials = (profile.displayName || profile.email || 'U')
    .trim()
    .slice(0, 2)
    .toUpperCase();

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateFullName(displayName);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await updateFirebaseDisplayName(displayName.trim());
      const updated = await updateServerDisplayName(displayName.trim());
      onProfileUpdated(updated);
      setStatusMsg('Profile display name saved.');
    } catch (e2) {
      setErrorMsg(e2 instanceof Error ? e2.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleResendVerification = async () => {
    setVerifying(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await resendCurrentUserVerification();
      setStatusMsg(`Verification link sent to ${profile.email}. Check your inbox.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send verification email.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCheckVerification = async () => {
    setVerifying(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const reloaded = await reloadCurrentFirebaseUser();
      const isVerified = Boolean(reloaded?.emailVerified);
      onRefreshVerification(isVerified);
      setStatusMsg(
        isVerified
          ? 'Email address is now verified.'
          : 'Email is still pending verification. Click the link in your inbox first.'
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to refresh status.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#0D131F] space-y-6">
      <div className="max-w-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.displayName}
                referrerPolicy="no-referrer"
                className="w-14 h-14 rounded-full border border-slate-700 object-cover"
              />
            ) : (
              <div className="w-14 h-14 rounded-full border border-sky-500/40 bg-sky-600/20 flex items-center justify-center text-base font-bold text-sky-300">
                {initials}
              </div>
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-100">{profile.displayName}</h2>
              <p className="text-xs text-slate-400">{profile.email}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md border border-rose-800 bg-rose-950/40 text-rose-200 hover:bg-rose-900/50 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>

        {statusMsg && (
          <div className="rounded border border-emerald-800/70 bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-300">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="rounded border border-rose-800/70 bg-rose-950/30 px-4 py-2.5 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* Account Security & Verification Card */}
        <section className="rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100">Account &amp; Verification Status</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-slate-400">Email Verification</div>
              <div className="mt-1 flex items-center gap-1.5 font-medium">
                {profile.emailVerified ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">Verified</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span className="text-amber-300">Pending Verification</span>
                  </>
                )}
              </div>
            </div>

            <div>
              <div className="text-slate-400">Sign-In Provider</div>
              <div className="mt-1 font-mono text-slate-200">{profile.authProvider}</div>
            </div>

            <div>
              <div className="text-slate-400">User ID (UID)</div>
              <div className="mt-1 font-mono text-slate-300 truncate">{profile.uid}</div>
            </div>

            <div>
              <div className="text-slate-400">Active Projects</div>
              <div className="mt-1 tabular-nums text-slate-200">
                {profile.projectCount ?? 1}
              </div>
            </div>
          </div>

          {!profile.emailVerified && (
            <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={verifying}
                onClick={() => void handleResendVerification()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
              >
                <Mail className="w-3.5 h-3.5" />
                Resend Verification Email
              </button>
              <button
                type="button"
                disabled={verifying}
                onClick={() => void handleCheckVerification()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh Status
              </button>
            </div>
          )}
        </section>

        {/* Update Profile Name */}
        <section className="rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-sky-400" />
            Profile Information
          </h3>

          <form onSubmit={handleSaveName} className="space-y-3">
            <div>
              <label htmlFor="profile-display-name" className="block text-xs text-slate-400 mb-1">
                Display Name
              </label>
              <input
                id="profile-display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#0B0F17] px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Update Profile'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
