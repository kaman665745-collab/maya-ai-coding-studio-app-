import React from 'react';
import { LogOut, Play, User } from 'lucide-react';

export type StudioViewMode =
  | 'code'
  | 'preview'
  | 'review'
  | 'history'
  | 'usage'
  | 'workspace'
  | 'settings'
  | 'profile';

interface TopBarProps {
  activeView: StudioViewMode;
  onSelectView: (view: StudioViewMode) => void;
  onRunBuild: () => void;
  isBuilding: boolean;
  userDisplayName: string | null;
  userEmail: string | null;
  onSignOut: () => void;
}

const NAV_ITEMS: Array<{ id: StudioViewMode; label: string }> = [
  { id: 'code', label: 'Code' },
  { id: 'preview', label: 'Preview' },
  { id: 'review', label: 'Review' },
  { id: 'history', label: 'History' },
  { id: 'usage', label: 'Usage' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'settings', label: 'Settings' },
  { id: 'profile', label: 'Profile' },
];

export function TopBar({
  activeView,
  onSelectView,
  onRunBuild,
  isBuilding,
  userDisplayName,
  userEmail,
  onSignOut,
}: TopBarProps) {
  return (
    <header className="h-13 px-3 md:px-4 border-b border-slate-800 bg-[#0B0F17] flex items-center justify-between gap-2 md:gap-4 lg:gap-6 shrink-0">
      {/* Zone 1: Single-element brand wordmark + mobile view switcher */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        <span className="text-sm lg:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          <span className="sm:hidden">ACS</span>
          <span className="hidden sm:inline">Advanced Coding Studio</span>
        </span>
        <label htmlFor="mobile-view-select" className="sr-only">
          Workspace View
        </label>
        <select
          id="mobile-view-select"
          value={activeView}
          onChange={(e) => onSelectView(e.target.value as StudioViewMode)}
          className="md:hidden rounded border border-slate-700 bg-[#111827] px-2 py-1 text-xs text-slate-100"
        >
          {NAV_ITEMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      {/* Zone 2: Clean single-line navigation links */}
      <nav aria-label="Workspace Views" className="hidden md:flex items-center gap-4 lg:gap-5 overflow-x-auto">
        {NAV_ITEMS.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`py-1.5 text-xs font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                active
                  ? 'text-sky-400 border-sky-400'
                  : 'text-slate-400 border-transparent hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Run Build + User Profile Info + Logout */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <button
          type="button"
          onClick={onRunBuild}
          disabled={isBuilding}
          className="inline-flex items-center gap-1.5 px-2.5 md:px-3.5 py-1.5 text-xs font-semibold rounded-md bg-sky-600 hover:bg-sky-500 text-white transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5" />
          <span className="sm:hidden">{isBuilding ? '...' : 'Build'}</span>
          <span className="hidden sm:inline">{isBuilding ? 'Building...' : 'Run Build'}</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectView('profile')}
          aria-label="Open account profile"
          className="inline-flex items-center gap-2 px-2 py-1 rounded-md border border-slate-800 bg-[#111827] hover:border-slate-700 text-left transition-colors"
        >
          <User className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <div className="hidden sm:block max-w-[150px] leading-tight">
            <div className="text-xs font-medium text-slate-200 truncate">
              {userDisplayName || userEmail?.split('@')[0] || 'Account'}
            </div>
            {userEmail && (
              <div className="text-[10px] text-slate-400 truncate">{userEmail}</div>
            )}
          </div>
        </button>

        <button
          type="button"
          onClick={onSignOut}
          aria-label="Logout"
          title="Logout"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
