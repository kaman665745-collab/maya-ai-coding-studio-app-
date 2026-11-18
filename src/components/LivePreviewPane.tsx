import React, { useState } from 'react';
import { Monitor, Play, RefreshCw, Smartphone, Square, Tablet } from 'lucide-react';
import type { PreviewSessionState } from '../domain/types.ts';
import type { PreviewConsoleEntry } from './BottomPanel.tsx';

interface LivePreviewPaneProps {
  session: PreviewSessionState | null;
  busy: boolean;
  consoleEntries: PreviewConsoleEntry[];
  onStartOrRebuild: () => Promise<void>;
  onStop: () => Promise<void>;
}

type ViewportSize = 'desktop' | 'tablet' | 'mobile';

export function LivePreviewPane({
  session,
  busy,
  consoleEntries,
  onStartOrRebuild,
  onStop,
}: LivePreviewPaneProps) {
  const [viewport, setViewport] = useState<ViewportSize>('desktop');

  const frameWidth =
    viewport === 'mobile' ? '390px' : viewport === 'tablet' ? '768px' : '100%';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0D131F]">
      {/* Preview Toolbar */}
      <div className="px-4 py-2.5 border-b border-slate-800 bg-[#0B0F17] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-slate-200">Sandbox Live Preview</h2>
          <span className="text-xs text-slate-400">
            Status: <strong className="text-slate-200 capitalize">{session?.status || 'stopped'}</strong>
          </span>
        </div>

        {/* Viewport Controls */}
        <div className="flex items-center gap-1 p-0.5 rounded-md border border-slate-800 bg-[#111827]">
          <button
            type="button"
            onClick={() => setViewport('desktop')}
            aria-label="Desktop preview viewport"
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded ${
              viewport === 'desktop' ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            Desktop
          </button>
          <button
            type="button"
            onClick={() => setViewport('tablet')}
            aria-label="Tablet preview viewport"
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded ${
              viewport === 'tablet' ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Tablet className="w-3.5 h-3.5" />
            Tablet
          </button>
          <button
            type="button"
            onClick={() => setViewport('mobile')}
            aria-label="Mobile preview viewport"
            className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded ${
              viewport === 'mobile' ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            Mobile
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onStartOrRebuild}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
          >
            {session?.status === 'running' ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                {busy ? 'Rebuilding...' : 'Rebuild Preview'}
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                {busy ? 'Starting...' : 'Start Preview'}
              </>
            )}
          </button>
          {session?.status === 'running' && (
            <button
              type="button"
              onClick={onStop}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Square className="w-3.5 h-3.5" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Preview Canvas + Console Split */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <div className="flex-1 min-h-[260px] bg-[#090D14] p-4 flex justify-center overflow-auto">
          {session?.status === 'running' && session.previewUrl ? (
            <iframe
              key={session.sessionId}
              title="ACS Sandbox Live Preview"
              src={session.previewUrl}
              sandbox="allow-scripts allow-same-origin"
              style={{ width: frameWidth, maxWidth: '100%' }}
              className="h-full min-h-[380px] rounded-lg border border-slate-700 bg-slate-950 transition-all"
            />
          ) : (
            <div className="self-center max-w-md text-center space-y-3 p-6 rounded-lg border border-slate-800 bg-[#111827]">
              <h3 className="text-sm font-semibold text-slate-100">
                {session?.status === 'error' ? 'Preview Build Failed' : 'Preview Session Stopped'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {session?.errorMessage ||
                  'Start the sandbox preview to bundle your workspace project with esbuild and render it with live console capture.'}
              </p>
              <button
                type="button"
                onClick={onStartOrRebuild}
                disabled={busy}
                className="px-4 py-2 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white"
              >
                {busy ? 'Bundling...' : 'Launch Sandbox Preview'}
              </button>
            </div>
          )}
        </div>

        {/* Preview Build Logs & Runtime Console */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-slate-800 bg-[#0B0F17] flex flex-col shrink-0">
          <div className="px-3 py-2 border-b border-slate-800 text-xs font-semibold text-slate-300">
            Session Logs &amp; Browser Console
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-[11px]">
            {(session?.logs || []).map((line, i) => (
              <div key={`log-${i}`} className="text-slate-400 break-words">
                {line}
              </div>
            ))}
            {consoleEntries.map((c, i) => (
              <div
                key={`con-${i}`}
                className={
                  c.level === 'error'
                    ? 'text-rose-400'
                    : c.level === 'warn'
                      ? 'text-amber-300'
                      : 'text-sky-300'
                }
              >
                [{c.level}] {c.text}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
