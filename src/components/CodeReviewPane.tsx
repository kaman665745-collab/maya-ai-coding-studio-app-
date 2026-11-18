import React, { useState } from 'react';
import { ShieldAlert, Sparkles } from 'lucide-react';
import type { FindingSeverity, ReviewReportRecord } from '../domain/types.ts';

interface CodeReviewPaneProps {
  reports: ReviewReportRecord[];
  running: boolean;
  onRunReview: (targetPath?: string) => Promise<void>;
  onUpdateFindingStatus: (findingId: number, status: 'open' | 'resolved' | 'ignored') => Promise<void>;
  onOpenFile: (path: string) => void;
  onProposeFix: (findingSummary: string) => void;
}

export function CodeReviewPane({
  reports,
  running,
  onRunReview,
  onUpdateFindingStatus,
  onOpenFile,
  onProposeFix,
}: CodeReviewPaneProps) {
  const [severityFilter, setSeverityFilter] = useState<'all' | FindingSeverity>('all');
  const latestReport = reports[0] || null;

  const filteredFindings = (latestReport?.findings || []).filter((f) =>
    severityFilter === 'all' ? true : f.severity === severityFilter
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#0D131F] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Live Code &amp; Security Review</h2>
          <p className="text-xs text-slate-400 mt-1">
            Deep multi-file inspection using High Thinking reasoning across security, strict typing, and reliability.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onRunReview()}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
        >
          <ShieldAlert className="w-4 h-4" />
          {running ? 'Scanning Workspace...' : 'Run Live Review'}
        </button>
      </div>

      {/* Severity Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg border border-slate-800 bg-[#111827]">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                severityFilter === sev
                  ? 'bg-slate-800 text-sky-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        {latestReport && (
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Model: {latestReport.modelId}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{latestReport.findingCount} total finding(s)</span>
          </div>
        )}
      </div>

      {!latestReport ? (
        <div className="rounded-lg border border-slate-800 bg-[#111827] p-8 text-center space-y-3">
          <p className="text-sm font-medium text-slate-200">No review reports recorded for this project yet</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Click &ldquo;Run Live Review&rdquo; to inspect your project files and generate actionable findings with suggested fixes.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
            <div className="text-xs font-semibold text-slate-200 mb-1">
              Review Summary ({latestReport.overallStatus.toUpperCase()})
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{latestReport.summary}</p>
          </div>

          {filteredFindings.length === 0 ? (
            <p className="text-xs text-slate-400">No findings match the selected severity filter.</p>
          ) : (
            <div className="space-y-3">
              {filteredFindings.map((finding) => (
                <div
                  key={finding.id}
                  className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`font-semibold uppercase ${
                            finding.severity === 'critical' || finding.severity === 'high'
                              ? 'text-rose-400'
                              : finding.severity === 'medium'
                                ? 'text-amber-400'
                                : 'text-sky-400'
                          }`}
                        >
                          {finding.severity}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-slate-400 capitalize">{finding.category}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <button
                          type="button"
                          onClick={() => onOpenFile(finding.filePath)}
                          className="font-mono text-sky-400 hover:underline"
                        >
                          {finding.filePath}:{finding.lineStart}
                        </button>
                      </div>
                      <h4 className="text-sm font-semibold text-slate-100">{finding.title}</h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        aria-label={`Status for finding ${finding.title}`}
                        value={finding.status}
                        onChange={(e) =>
                          onUpdateFindingStatus(
                            finding.id,
                            e.target.value as 'open' | 'resolved' | 'ignored'
                          )
                        }
                        className="rounded border border-slate-700 bg-[#0B0F17] px-2 py-1 text-xs text-slate-200"
                      >
                        <option value="open">Open</option>
                        <option value="resolved">Resolved</option>
                        <option value="ignored">Ignored</option>
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          onProposeFix(
                            `Fix review finding in ${finding.filePath} (line ${finding.lineStart}): ${finding.title}. ${finding.description}`
                          )
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white"
                      >
                        <Sparkles className="w-3 h-3" />
                        Propose Fix
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">{finding.description}</p>

                  {finding.suggestedPatch && (
                    <pre className="rounded border border-slate-800 bg-[#0B0F17] p-2.5 text-xs font-mono text-emerald-300 overflow-x-auto">
                      {finding.suggestedPatch}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
