import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, FlaskConical, Play, Terminal } from 'lucide-react';
import type { BuildRunRecord, TestRunRecord } from '../domain/types.ts';

export interface PreviewConsoleEntry {
  level: string;
  text: string;
  timestamp: string;
}

interface BottomPanelProps {
  builds: BuildRunRecord[];
  tests: TestRunRecord[];
  consoleEntries: PreviewConsoleEntry[];
  diagnostics: string[];
  runningTests: boolean;
  onRunTests: () => Promise<void>;
  onExecSandboxCommand: (command: string) => Promise<{ status: string; exitCode: number; logs: string }>;
}

type BottomTab = 'builds' | 'tests' | 'terminal' | 'console' | 'diagnostics';

export function BottomPanel({
  builds,
  tests,
  consoleEntries,
  diagnostics,
  runningTests,
  onRunTests,
  onExecSandboxCommand,
}: BottomPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<BottomTab>('builds');
  const [cmdInput, setCmdInput] = useState('node -v');
  const [terminalLog, setTerminalLog] = useState<string[]>([
    'Isolated sandbox ready (allowlist: node, esbuild, tsc, npm, vitest · network egress denied).',
  ]);
  const [execBusy, setExecBusy] = useState(false);
  const prevBuildCountRef = useRef(builds.length);

  useEffect(() => {
    if (builds.length > prevBuildCountRef.current) {
      setActiveTab('builds');
      setCollapsed(false);
    }
    prevBuildCountRef.current = builds.length;
  }, [builds.length]);

  useEffect(() => {
    if (runningTests) {
      setActiveTab('tests');
      setCollapsed(false);
    }
  }, [runningTests]);

  const handleExec = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdInput.trim() || execBusy) return;
    setExecBusy(true);
    const command = cmdInput.trim();
    try {
      const res = await onExecSandboxCommand(command);
      setTerminalLog((prev) => [
        ...prev,
        `$ ${command} (exit ${res.exitCode})`,
        res.logs,
      ]);
    } catch (err) {
      setTerminalLog((prev) => [
        ...prev,
        `$ ${command}`,
        err instanceof Error ? err.message : 'Execution failed',
      ]);
    } finally {
      setExecBusy(false);
    }
  };

  return (
    <section
      aria-label="Workspace Diagnostics and Logs"
      className={`border-t border-slate-800 bg-[#0B0F17] flex flex-col shrink-0 ${
        collapsed ? 'h-9' : 'flex-1 min-h-0 md:flex-none md:h-56'
      }`}
    >
      {/* Header Tabs */}
      <div className="h-9 px-3 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div role="tablist" aria-label="Bottom panel views" className="flex items-center gap-2 overflow-x-auto">
          {(
            [
              { id: 'builds', label: `Build Logs (${builds.length})` },
              { id: 'tests', label: `Test Results (${tests.length})` },
              { id: 'terminal', label: 'Sandbox Terminal' },
              { id: 'console', label: `Preview Console (${consoleEntries.length})` },
              { id: 'diagnostics', label: `Diagnostics (${diagnostics.length})` },
            ] as Array<{ id: BottomTab; label: string }>
          ).map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveTab(t.id);
                  if (collapsed) setCollapsed(false);
                }}
                className={`px-2 py-1 text-xs font-medium whitespace-nowrap rounded transition-colors ${
                  active ? 'bg-slate-800 text-sky-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRunTests}
            disabled={runningTests}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50"
          >
            <FlaskConical className="w-3.5 h-3.5 text-emerald-400" />
            {runningTests ? 'Running...' : 'Run Tests'}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand bottom panel' : 'Collapse bottom panel'}
            className="p-1 text-slate-400 hover:text-slate-200"
          >
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto p-3 font-mono text-xs">
          {activeTab === 'builds' && (
            <div className="space-y-3">
              {builds.length === 0 ? (
                <p className="text-slate-500 font-sans">Click &ldquo;Run Build&rdquo; in the top bar to bundle and validate this project inside an isolated sandbox.</p>
              ) : (
                builds.map((b) => (
                  <div key={b.id} className="rounded border border-slate-800 bg-[#111827] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <span className={b.status === 'passed' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        Build #{b.id} · {b.status.toUpperCase()} (exit {b.exitCode})
                      </span>
                      <span className="text-slate-400 tabular-nums font-mono">
                        {b.durationMs} ms · {new Date(b.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed">{b.logs}</pre>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'tests' && (
            <div className="space-y-3">
              {tests.length === 0 ? (
                <p className="text-slate-500 font-sans">No test runs yet. Click &ldquo;Run Tests&rdquo; to execute workspace unit tests in the sandbox.</p>
              ) : (
                tests.map((t) => (
                  <div key={t.id} className="rounded border border-slate-800 bg-[#111827] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-sans">
                      <span className={t.status === 'passed' ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                        {t.suiteName} · {t.passedCount}/{t.totalCount} passed
                      </span>
                      <span className="text-slate-400 tabular-nums font-mono">{t.durationMs} ms</span>
                    </div>
                    <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed">{t.logs}</pre>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'terminal' && (
            <div className="space-y-2 h-full flex flex-col">
              <div className="flex-1 overflow-y-auto space-y-1.5 text-slate-300">
                {terminalLog.map((line, i) => (
                  <pre key={i} className="whitespace-pre-wrap">{line}</pre>
                ))}
              </div>
              <form onSubmit={handleExec} className="flex items-center gap-2 pt-1 border-t border-slate-800">
                <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <label htmlFor="sandbox-cmd-input" className="sr-only">
                  Sandbox command
                </label>
                <input
                  id="sandbox-cmd-input"
                  type="text"
                  value={cmdInput}
                  onChange={(e) => setCmdInput(e.target.value)}
                  placeholder="node -v"
                  className="flex-1 bg-transparent text-slate-100 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={execBusy}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-sans"
                >
                  <Play className="w-3 h-3" />
                  Run
                </button>
              </form>
            </div>
          )}

          {activeTab === 'console' && (
            <div className="space-y-1">
              {consoleEntries.length === 0 ? (
                <p className="text-slate-500 font-sans">Start Live Preview to capture runtime browser console logs and errors.</p>
              ) : (
                consoleEntries.map((entry, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 px-2 py-1 rounded ${
                      entry.level === 'error'
                        ? 'text-rose-300 bg-rose-950/30'
                        : entry.level === 'warn'
                          ? 'text-amber-300 bg-amber-950/20'
                          : 'text-slate-300'
                    }`}
                  >
                    <span className="text-slate-500 shrink-0 tabular-nums">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="uppercase text-[10px] shrink-0">[{entry.level}]</span>
                    <span className="break-all">{entry.text}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-1.5">
              {diagnostics.length === 0 ? (
                <p className="text-emerald-400 font-sans">No active diagnostics or policy violations.</p>
              ) : (
                diagnostics.map((d, i) => (
                  <div key={i} className="text-amber-300">
                    {d}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
