import React from 'react';
import { Check, RotateCcw, ShieldCheck, X } from 'lucide-react';
import type { AgentTaskRecord } from '../domain/types.ts';

interface DiffApprovalPanelProps {
  proposals: AgentTaskRecord[];
  busyTaskId: number | null;
  onApprove: (taskId: number) => void;
  onReject: (taskId: number) => void;
  onRollbackCheckpoint: (checkpointId: number) => void;
}

export function DiffApprovalPanel({
  proposals,
  busyTaskId,
  onApprove,
  onReject,
  onRollbackCheckpoint,
}: DiffApprovalPanelProps) {
  const editProposals = proposals.filter((p) => p.changes.length > 0);

  if (editProposals.length === 0) {
    return (
      <div className="p-4 text-xs text-slate-400">
        No edit proposals yet. Ask the AI Coder or Debugger to propose a change — every patch requires your diff review before touching workspace files.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-3 overflow-y-auto">
      {editProposals.map((task) => {
        const isPending = task.status === 'awaiting_approval';
        const isApplied = task.status === 'applied';
        const isBusy = busyTaskId === task.id;

        return (
          <div
            key={task.id}
            className="rounded-lg border border-slate-800 bg-[#111827] overflow-hidden"
          >
            <div className="px-3.5 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-slate-100">{task.title}</h4>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                  <span className="capitalize">{task.status.replace('_', ' ')}</span>
                  <span aria-hidden="true">·</span>
                  <span className="tabular-nums">{task.changes.length} file(s)</span>
                  {task.verificationSummary && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-emerald-400">{task.verificationSummary}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isPending && (
                  <>
                    <button
                      type="button"
                      onClick={() => onReject(task.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() => onApprove(task.id)}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {isBusy ? 'Applying...' : 'Approve & Apply'}
                    </button>
                  </>
                )}

                {isApplied && task.checkpointId && (
                  <button
                    type="button"
                    onClick={() => onRollbackCheckpoint(task.checkpointId!)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded border border-amber-700/70 text-amber-300 hover:bg-amber-950/40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Rollback Checkpoint #{task.checkpointId}
                  </button>
                )}
              </div>
            </div>

            {isPending && (
              <div className="px-3.5 py-2 bg-[#0B0F17] border-b border-slate-800 flex items-center gap-2 text-xs text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>
                  Approving creates an automatic checkpoint, applies patches in an isolated sandbox, and verifies build & tests.
                </span>
              </div>
            )}

            <div className="divide-y divide-slate-800">
              {task.changes.map((chg) => (
                <div key={chg.path} className="p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-medium text-sky-300">
                      [{chg.action.toUpperCase()}] {chg.path}
                    </span>
                    <span className="text-slate-400">{chg.rationale}</span>
                  </div>
                  <pre className="rounded border border-slate-800 bg-[#0B0F17] p-2.5 text-xs font-mono overflow-x-auto leading-relaxed">
                    {chg.unifiedDiff.split('\n').map((line, i) => {
                      let colorClass = 'text-slate-300';
                      if (line.startsWith('+') && !line.startsWith('+++')) colorClass = 'text-emerald-400 bg-emerald-950/30';
                      else if (line.startsWith('-') && !line.startsWith('---')) colorClass = 'text-rose-400 bg-rose-950/30';
                      else if (line.startsWith('@@')) colorClass = 'text-sky-400';
                      return (
                        <div key={i} className={`px-1 ${colorClass}`}>
                          {line || ' '}
                        </div>
                      );
                    })}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
