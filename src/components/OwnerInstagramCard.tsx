import React from 'react';
import { ExternalLink } from 'lucide-react';

export const OWNER_INSTAGRAM_URL = 'https://www.instagram.com/its_sk_deepak_06/';
export const OWNER_INSTAGRAM_HANDLE = '@its_sk_deepak_06';

export function OwnerInstagramCard() {
  return (
    <div className="pt-4 border-t border-slate-800">
      <div className="rounded-lg border border-slate-800 bg-[#0B0F17] px-3.5 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Official-style Instagram glyph */}
          <span
            aria-hidden="true"
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background:
                'linear-gradient(135deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
          </span>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium text-slate-400 whitespace-nowrap">
              Website Owner Instagram
            </div>
            <a
              href={OWNER_INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Website Owner Instagram @its_sk_deepak_06 (opens in new tab)"
              className="inline-flex items-center gap-1.5 max-w-full text-xs sm:text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors focus-visible:outline-none focus-visible:underline"
            >
              <span className="truncate">{OWNER_INSTAGRAM_HANDLE}</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
        </div>

        <a
          href={OWNER_INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          <span className="sm:hidden">Visit</span>
          <span className="hidden sm:inline">Visit Profile</span>
        </a>
      </div>
    </div>
  );
}
