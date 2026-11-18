import React, { useEffect, useState } from 'react';
import { GitBranch, GitCommitHorizontal, History, RotateCcw } from 'lucide-react';
import type {
  CheckpointRecord,
  FileVersionRecord,
  GitConnectionRecord,
} from '../domain/types.ts';

interface HistoryAndGitPaneProps {
  checkpoints: CheckpointRecord[];
  versions: FileVersionRecord[];
  git: GitConnectionRecord | null;
  onCreateCheckpoint: (label: string) => Promise<void>;
  onRollbackCheckpoint: (checkpointId: number) => Promise<void>;
  onCommitGit: (message: string, branch?: string) => Promise<void>;
}

export function HistoryAndGitPane({
  checkpoints,
  versions,
  git,
  onCreateCheckpoint,
  onRollbackCheckpoint,
  onCommitGit,
}: HistoryAndGitPaneProps) {
  const [cpLabel, setCpLabel] = useState('');
  const [commitMsg, setCommitMsg] = useState('');
  const [branchName, setBranchName] = useState(git?.currentBranch || 'main');
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setBranchName(git?.currentBranch || 'main');
  }, [git?.currentBranch]);

  const handleCreateCp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpLabel.trim() || busy) return;
    setBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      await onCreateCheckpoint(cpLabel.trim());
      setStatusMsg(`Saved checkpoint "${cpLabel.trim()}".`);
      setCpLabel('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create checkpoint');
    } finally {
      setBusy(false);
    }
  };

  const handleGitCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMsg.trim() || busy) return;
    setBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      await onCommitGit(commitMsg.trim(), branchName.trim() || 'main');
      setStatusMsg(`Committed snapshot to branch "${branchName.trim() || 'main'}".`);
      setCommitMsg('');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to commit Git snapshot');
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (checkpointId: number) => {
    if (busy) return;
    setBusy(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      await onRollbackCheckpoint(checkpointId);
      setStatusMsg(`Rolled back workspace to Checkpoint #${checkpointId}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Rollback failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#0D131F] space-y-8">
      {statusMsg && (
        <div className="rounded border border-emerald-800/70 bg-emerald-950/30 px-4 py-2 text-xs text-emerald-300">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="rounded border border-rose-800/70 bg-rose-950/30 px-4 py-2 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}
      {/* Git Snapshot & Branch Control */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Git &amp; Version History</h2>
            <p className="text-xs text-slate-400 mt-1">
              Create versioned Git commits, switch workspace branches, and roll back to any checkpoint.
            </p>
          </div>
          {git && (
            <div className="text-xs text-slate-300 font-mono flex items-center gap-2">
              <GitBranch className="w-3.5 h-3.5 text-sky-400" />
              <span>{git.currentBranch}</span>
              {git.lastCommitSha && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-slate-400">{git.lastCommitSha.slice(0, 8)}</span>
                </>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleGitCommit} className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-lg border border-slate-800 bg-[#111827] p-4">
          <div>
            <label htmlFor="git-branch-input" className="block text-xs text-slate-400 mb-1">
              Branch
            </label>
            <input
              id="git-branch-input"
              type="text"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              className="w-full rounded border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs font-mono text-slate-100"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="git-commit-msg" className="block text-xs text-slate-400 mb-1">
              Commit Message
            </label>
            <input
              id="git-commit-msg"
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="feat: update service latency metrics"
              className="w-full rounded border border-slate-700 bg-[#0B0F17] px-3 py-1.5 text-xs text-slate-100"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={busy || !commitMsg.trim()}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"
            >
              <GitCommitHorizontal className="w-4 h-4" />
              Commit Snapshot
            </button>
          </div>
        </form>
      </section>

      {/* Checkpoints & Rollback */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-100">Checkpoints &amp; Rollback</h3>
          <form onSubmit={handleCreateCp} className="flex items-center gap-2">
            <label htmlFor="checkpoint-label-input" className="sr-only">
              Checkpoint label
            </label>
            <input
              id="checkpoint-label-input"
              type="text"
              value={cpLabel}
              onChange={(e) => setCpLabel(e.target.value)}
              placeholder="Checkpoint label..."
              className="rounded border border-slate-700 bg-[#111827] px-3 py-1.5 text-xs text-slate-100"
            />
            <button
              type="submit"
              disabled={busy || !cpLabel.trim()}
              className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
            >
              Save Checkpoint
            </button>
          </form>
        </div>

        {checkpoints.length === 0 ? (
          <p className="text-xs text-slate-400">No checkpoints saved yet. Approving an AI proposal automatically creates one.</p>
        ) : (
          <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 bg-[#111827]">
            {checkpoints.map((cp) => (
              <div key={cp.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    #{cp.id} · {cp.label}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                    {cp.reason} · {cp.fileCount} file(s) · {new Date(cp.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleRollback(cp.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-amber-700/70 text-amber-300 hover:bg-amber-950/40 disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Rollback
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* File Revision History */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          Recent File Revisions
        </h3>
        <div className="border border-slate-800 rounded-lg overflow-hidden bg-[#111827]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 text-slate-400 bg-[#0B0F17]">
              <tr>
                <th className="px-3 py-2 font-medium">File</th>
                <th className="px-3 py-2 font-medium">Rev</th>
                <th className="px-3 py-2 font-medium">Message</th>
                <th className="px-3 py-2 font-medium text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {versions.slice(0, 20).map((v) => (
                <tr key={v.id} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-mono text-sky-300">{v.path}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-300">v{v.versionNumber}</td>
                  <td className="px-3 py-2 text-slate-300">{v.commitMessage}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {new Date(v.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
