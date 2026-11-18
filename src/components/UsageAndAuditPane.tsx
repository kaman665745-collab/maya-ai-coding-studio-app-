import React, { useState } from 'react';
import type { AuditLogItem, UsageRecordItem } from '../domain/types.ts';

interface UsageAndAuditPaneProps {
  usage: UsageRecordItem[];
  auditLogs: AuditLogItem[];
}

export function UsageAndAuditPane({ usage, auditLogs }: UsageAndAuditPaneProps) {
  const [auditFilter, setAuditFilter] = useState('');

  const totalPromptTokens = usage.reduce((sum, u) => sum + u.promptTokens, 0);
  const totalOutputTokens = usage.reduce((sum, u) => sum + u.outputTokens, 0);
  const avgLatencyMs =
    usage.length > 0
      ? Math.round(usage.reduce((sum, u) => sum + u.latencyMs, 0) / usage.length)
      : 0;

  const filteredAudit = auditLogs.filter((a) => {
    const q = auditFilter.trim().toLowerCase();
    if (!q) return true;
    return (
      a.action.toLowerCase().includes(q) ||
      a.resourceType.toLowerCase().includes(q) ||
      a.resourceId.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#0D131F] space-y-8">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-lg font-semibold text-slate-100">Usage &amp; Audit Dashboard</h2>
        <p className="text-xs text-slate-400 mt-1">
          Recorded token consumption, agent latency telemetry, and immutable workspace audit events.
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
          <div className="text-xs text-slate-400">Agent Runs</div>
          <div className="text-2xl font-semibold text-slate-100 mt-1 tabular-nums">{usage.length}</div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
          <div className="text-xs text-slate-400">Prompt Tokens</div>
          <div className="text-2xl font-semibold text-slate-100 mt-1 tabular-nums">
            {totalPromptTokens.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
          <div className="text-xs text-slate-400">Output Tokens</div>
          <div className="text-2xl font-semibold text-slate-100 mt-1 tabular-nums">
            {totalOutputTokens.toLocaleString()}
          </div>
        </div>
        <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
          <div className="text-xs text-slate-400">Mean Response Latency</div>
          <div className="text-2xl font-semibold text-sky-400 mt-1 tabular-nums">{avgLatencyMs} ms</div>
        </div>
      </div>

      {/* Usage Table */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-100">Model Usage Records</h3>
        {usage.length === 0 ? (
          <p className="text-xs text-slate-400">No AI invocations recorded in this workspace yet.</p>
        ) : (
          <div className="border border-slate-800 rounded-lg overflow-x-auto bg-[#111827]">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-[#0B0F17] text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium text-right">Prompt</th>
                  <th className="px-3 py-2 font-medium text-right">Output</th>
                  <th className="px-3 py-2 font-medium text-right">Latency</th>
                  <th className="px-3 py-2 font-medium text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {usage.slice(0, 25).map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/40">
                    <td className="px-3 py-2 capitalize text-slate-200">{u.agentRole}</td>
                    <td className="px-3 py-2 font-mono text-sky-300">{u.modelId}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">{u.promptTokens}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">{u.outputTokens}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">{u.latencyMs} ms</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {new Date(u.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Audit Log */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-100">Security &amp; Action Audit Log</h3>
          <div>
            <label htmlFor="audit-filter" className="sr-only">
              Filter audit logs
            </label>
            <input
              id="audit-filter"
              type="text"
              value={auditFilter}
              onChange={(e) => setAuditFilter(e.target.value)}
              placeholder="Filter action or resource..."
              className="rounded border border-slate-700 bg-[#111827] px-3 py-1.5 text-xs text-slate-100"
            />
          </div>
        </div>

        <div className="border border-slate-800 rounded-lg overflow-x-auto bg-[#111827]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-[#0B0F17] text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Resource</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredAudit.slice(0, 30).map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/40">
                  <td className="px-3 py-2 font-mono text-emerald-300">{log.action}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">
                    {log.resourceType}:{log.resourceId}
                  </td>
                  <td className="px-3 py-2 text-slate-400">{log.actorUid}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                    {new Date(log.createdAt).toLocaleString()}
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
