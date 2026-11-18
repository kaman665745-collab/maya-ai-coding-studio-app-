import React, { useEffect, useRef, useState } from 'react';
import { Globe, Send, Sparkles } from 'lucide-react';
import { AGENT_ROLE_PROFILES } from '../domain/agents.ts';
import type {
  AgentRole,
  AgentTaskRecord,
  ChatMessageRecord,
  ThinkingLevelName,
} from '../domain/types.ts';
import { DiffApprovalPanel } from './DiffApprovalPanel.tsx';

interface AiAssistantPanelProps {
  messages: ChatMessageRecord[];
  proposals: AgentTaskRecord[];
  activityEvents: Array<{ id: string; type: string; message: string; timestamp: string }>;
  activeFilePath: string | null;
  sending: boolean;
  busyTaskId: number | null;
  onSendChat: (input: {
    prompt: string;
    agentRole: AgentRole;
    searchGroundingOverride: boolean;
    thinkingLevelOverride: ThinkingLevelName;
  }) => Promise<void>;
  onApproveProposal: (taskId: number) => void;
  onRejectProposal: (taskId: number) => void;
  onRollbackCheckpoint: (checkpointId: number) => void;
}

type RightTab = 'chat' | 'proposals' | 'plans' | 'activity';

export function AiAssistantPanel({
  messages,
  proposals,
  activityEvents,
  activeFilePath,
  sending,
  busyTaskId,
  onSendChat,
  onApproveProposal,
  onRejectProposal,
  onRollbackCheckpoint,
}: AiAssistantPanelProps) {
  const [rightTab, setRightTab] = useState<RightTab>('chat');
  const [agentRole, setAgentRole] = useState<AgentRole>('coder');
  const [searchGrounding, setSearchGrounding] = useState(false);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevelName>('MEDIUM');
  const [prompt, setPrompt] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const pendingProposalsCount = proposals.filter((p) => p.status === 'awaiting_approval').length;
  const planTasks = proposals.filter((p) => p.planSteps.length > 0);
  const prevPendingRef = useRef(pendingProposalsCount);

  useEffect(() => {
    if (pendingProposalsCount > prevPendingRef.current) {
      setRightTab('proposals');
    }
    prevPendingRef.current = pendingProposalsCount;
  }, [pendingProposalsCount]);

  const handleRoleChange = (nextRole: AgentRole) => {
    setAgentRole(nextRole);
    const profile = AGENT_ROLE_PROFILES[nextRole];
    setThinkingLevel(profile.defaultThinkingLevel);
    setSearchGrounding(profile.supportsSearchGrounding);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || sending) return;
    setErrorMsg('');
    const currentPrompt = prompt.trim();
    setPrompt('');
    try {
      await onSendChat({
        prompt: currentPrompt,
        agentRole,
        searchGroundingOverride: searchGrounding,
        thinkingLevelOverride: thinkingLevel,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI request failed');
      setPrompt(currentPrompt);
    }
  };

  return (
    <aside className="h-full w-full md:w-[360px] bg-[#111827] border-l border-slate-800 flex flex-col shrink-0">
      {/* Right Sidebar Tabs */}
      <div
        role="tablist"
        aria-label="AI Assistant Panels"
        className="h-10 px-2 border-b border-slate-800 bg-[#0B0F17] flex items-center gap-1 shrink-0"
      >
        {(
          [
            { id: 'chat', label: 'AI Chat' },
            {
              id: 'proposals',
              label: pendingProposalsCount > 0 ? `Diffs (${pendingProposalsCount})` : 'Diffs',
            },
            { id: 'plans', label: 'Plans' },
            { id: 'activity', label: 'Activity' },
          ] as Array<{ id: RightTab; label: string }>
        ).map((tab) => {
          const active = rightTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setRightTab(tab.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                active
                  ? 'bg-slate-800 text-sky-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      {rightTab === 'chat' && (
        <div className="flex-1 min-h-0 flex flex-col">
          {/* Agent Controls */}
          <div className="p-3 border-b border-slate-800 space-y-2 bg-[#0E1420]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="agent-role-select" className="block text-[11px] text-slate-400 mb-1">
                  Agent Role
                </label>
                <select
                  id="agent-role-select"
                  value={agentRole}
                  onChange={(e) => handleRoleChange(e.target.value as AgentRole)}
                  className="w-full rounded border border-slate-700 bg-[#0B0F17] px-2 py-1.5 text-xs text-slate-100"
                >
                  {Object.values(AGENT_ROLE_PROFILES).map((p) => (
                    <option key={p.role} value={p.role}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="thinking-level-select" className="block text-[11px] text-slate-400 mb-1">
                  Thinking Depth
                </label>
                <select
                  id="thinking-level-select"
                  value={thinkingLevel}
                  onChange={(e) => setThinkingLevel(e.target.value as ThinkingLevelName)}
                  className="w-full rounded border border-slate-700 bg-[#0B0F17] px-2 py-1.5 text-xs text-slate-100"
                >
                  <option value="LOW">Low (Fast)</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High Thinking</option>
                  <option value="XHIGH">Extra High</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-0.5">
              <label className="inline-flex items-center gap-2 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={searchGrounding}
                  onChange={(e) => setSearchGrounding(e.target.checked)}
                  className="rounded border-slate-700 bg-[#0B0F17] text-sky-500"
                />
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span>Google Search Grounding</span>
              </label>
              {activeFilePath && (
                <span className="text-[11px] font-mono text-slate-400 truncate max-w-[120px]">
                  {activeFilePath}
                </span>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-lg border p-3 space-y-2 ${
                  msg.role === 'user'
                    ? 'border-sky-900/60 bg-sky-950/20 ml-4'
                    : 'border-slate-800 bg-[#0B0F17] mr-2'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-medium text-slate-300">
                    {msg.role === 'user' ? 'You' : `${AGENT_ROLE_PROFILES[msg.agentRole]?.label || msg.agentRole}`}
                  </span>
                  <span className="font-mono">{msg.modelId}</span>
                </div>

                {msg.thinkingSummary && (
                  <p className="text-[11px] text-slate-400 italic border-b border-slate-800 pb-1.5">
                    {msg.thinkingSummary}
                  </p>
                )}

                <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </p>

                {msg.citations && msg.citations.length > 0 && (
                  <div className="pt-1.5 border-t border-slate-800 space-y-1">
                    <div className="text-[11px] text-slate-400">Sources:</div>
                    {msg.citations.slice(0, 4).map((c, idx) => (
                      <a
                        key={`${c.uri}-${idx}`}
                        href={c.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-[11px] text-sky-400 hover:underline truncate"
                      >
                        {c.title}
                      </a>
                    ))}
                  </div>
                )}

                {msg.proposalTaskId && (
                  <button
                    type="button"
                    onClick={() => setRightTab('proposals')}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 pt-1"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Inspect Edit Proposal #{msg.proposalTaskId}
                  </button>
                )}
              </div>
            ))}
            {sending && (
              <div className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 text-xs text-slate-400">
                Inspecting workspace files and preparing structured response...
              </div>
            )}
          </div>

          {/* Prompt Form */}
          <form onSubmit={handleSubmit} className="p-3 border-t border-slate-800 bg-[#0B0F17] space-y-2">
            {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}
            <label htmlFor="ai-prompt-input" className="sr-only">
              Ask ACS AI agent
            </label>
            <textarea
              id="ai-prompt-input"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void handleSubmit(e as unknown as React.FormEvent);
                }
              }}
              placeholder={`Ask ${AGENT_ROLE_PROFILES[agentRole].label} to plan, review, debug, or propose a diff...`}
              className="w-full rounded-md border border-slate-700 bg-[#111827] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Edits always require diff approval
              </span>
              <button
                type="submit"
                disabled={sending || !prompt.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"
              >
                <Send className="w-3.5 h-3.5" />
                {sending ? 'Running...' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      )}

      {rightTab === 'proposals' && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <DiffApprovalPanel
            proposals={proposals}
            busyTaskId={busyTaskId}
            onApprove={onApproveProposal}
            onReject={onRejectProposal}
            onRollbackCheckpoint={onRollbackCheckpoint}
          />
        </div>
      )}

      {rightTab === 'plans' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {planTasks.length === 0 ? (
            <p className="text-xs text-slate-400">
              Switch Agent Role to &ldquo;Task Planner&rdquo; to break complex features into tracked implementation steps.
            </p>
          ) : (
            planTasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-slate-800 bg-[#0B0F17] p-3 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-100">{task.title}</span>
                  <span className="text-slate-400 capitalize">{task.status.replace('_', ' ')}</span>
                </div>
                <ol className="space-y-2">
                  {task.planSteps.map((step, idx) => (
                    <li key={step.id} className="text-xs border-t border-slate-800/80 pt-2">
                      <div className="font-medium text-slate-200">
                        {idx + 1}. {step.title}
                      </div>
                      <p className="text-slate-400 mt-0.5">{step.detail}</p>
                      {step.targetFiles.length > 0 && (
                        <div className="text-[11px] font-mono text-sky-400 mt-1">
                          {step.targetFiles.join(' · ')}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))
          )}
        </div>
      )}

      {rightTab === 'activity' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {activityEvents.length === 0 ? (
            <p className="text-xs text-slate-400">Live server SSE events will stream here as tasks execute.</p>
          ) : (
            activityEvents.map((ev) => (
              <div key={ev.id} className="rounded border border-slate-800 bg-[#0B0F17] px-3 py-2 text-xs space-y-0.5">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono text-sky-400">{ev.type}</span>
                  <span className="tabular-nums">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
                <p className="text-slate-200">{ev.message}</p>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
