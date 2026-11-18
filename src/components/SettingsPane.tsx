import React, { useState } from 'react';
import { Cpu, Puzzle, Shield } from 'lucide-react';
import { AGENT_ROLE_PROFILES, AVAILABLE_GEMINI_MODELS } from '../domain/agents.ts';
import type {
  AgentRole,
  ModelConfigRecord,
  PluginRecord,
  ThinkingLevelName,
} from '../domain/types.ts';
import { detectRuntimePlatform } from '../platform/bridge.ts';

interface SettingsPaneProps {
  modelConfigs: ModelConfigRecord[];
  plugins: PluginRecord[];
  onUpdateModelConfig: (input: {
    agentRole: AgentRole;
    modelId: string;
    thinkingLevel: ThinkingLevelName;
    searchGrounding: boolean;
  }) => Promise<void>;
  onTogglePlugin: (manifestId: string, enabled: boolean) => Promise<void>;
}

export function SettingsPane({
  modelConfigs,
  plugins,
  onUpdateModelConfig,
  onTogglePlugin,
}: SettingsPaneProps) {
  const [savingRole, setSavingRole] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const platform = detectRuntimePlatform();

  const handleModelChange = async (
    role: AgentRole,
    patch: Partial<{ modelId: string; thinkingLevel: ThinkingLevelName; searchGrounding: boolean }>
  ) => {
    const existing = modelConfigs.find((m) => m.agentRole === role);
    const profile = AGENT_ROLE_PROFILES[role];
    const next = {
      agentRole: role,
      modelId: patch.modelId ?? existing?.modelId ?? profile.defaultModel,
      thinkingLevel: patch.thinkingLevel ?? existing?.thinkingLevel ?? profile.defaultThinkingLevel,
      searchGrounding: patch.searchGrounding ?? existing?.searchGrounding ?? profile.supportsSearchGrounding,
    };

    setSavingRole(role);
    setStatusNote('');
    try {
      await onUpdateModelConfig(next);
      setStatusNote(`Saved configuration for ${profile.label}.`);
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : 'Failed to update model config');
    } finally {
      setSavingRole(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#0D131F] space-y-8">
      <div className="border-b border-slate-800 pb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Studio Settings &amp; Extensions</h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure server-side Gemini agent routing, plugin manifests, and sandbox policies.
          </p>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          Client Runtime: {platform}
        </span>
      </div>

      {statusNote && (
        <div className="rounded border border-sky-800/60 bg-sky-950/30 px-4 py-2 text-xs text-sky-300">
          {statusNote}
        </div>
      )}

      {/* AI Model Provider Configuration */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-100">Agent Model Provider Matrix (Server-Side)</h3>
        </div>

        <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 bg-[#111827]">
          {(Object.keys(AGENT_ROLE_PROFILES) as AgentRole[]).map((role) => {
            const profile = AGENT_ROLE_PROFILES[role];
            const current = modelConfigs.find((m) => m.agentRole === role);
            const modelId = current?.modelId ?? profile.defaultModel;
            const thinkingLevel = current?.thinkingLevel ?? profile.defaultThinkingLevel;
            const searchGrounding = current?.searchGrounding ?? profile.supportsSearchGrounding;

            return (
              <div key={role} className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                <div className="lg:col-span-5">
                  <div className="text-xs font-semibold text-slate-100">{profile.label}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{profile.description}</div>
                </div>

                <div className="lg:col-span-3">
                  <label htmlFor={`model-select-${role}`} className="block text-[11px] text-slate-400 mb-1">
                    Model ID
                  </label>
                  <select
                    id={`model-select-${role}`}
                    value={modelId}
                    disabled={savingRole === role}
                    onChange={(e) => handleModelChange(role, { modelId: e.target.value })}
                    className="w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
                  >
                    {AVAILABLE_GEMINI_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.tier === 'paid' ? 'Paid Key' : 'Standard'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label htmlFor={`thinking-select-${role}`} className="block text-[11px] text-slate-400 mb-1">
                    Thinking Level
                  </label>
                  <select
                    id={`thinking-select-${role}`}
                    value={thinkingLevel}
                    disabled={savingRole === role}
                    onChange={(e) =>
                      handleModelChange(role, { thinkingLevel: e.target.value as ThinkingLevelName })
                    }
                    className="w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
                  >
                    <option value="MINIMAL">Minimal</option>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="XHIGH">Extra High</option>
                  </select>
                </div>

                <div className="lg:col-span-2 flex items-center justify-end">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={searchGrounding}
                      disabled={savingRole === role}
                      onChange={(e) => handleModelChange(role, { searchGrounding: e.target.checked })}
                      className="rounded border-slate-700 bg-[#0B0F17] text-sky-500"
                    />
                    <span>Search Grounding</span>
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Plugins & Extensions */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-100">Plugin &amp; Extension Manifests</h3>
        </div>

        <div className="border border-slate-800 rounded-lg divide-y divide-slate-800 bg-[#111827]">
          {plugins.map((plg) => (
            <div key={plg.manifestId} className="p-4 flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-slate-100">
                  {plg.name} <span className="font-mono text-slate-400">v{plg.version}</span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{plg.description}</p>
                <div className="text-[11px] font-mono text-slate-500 mt-1">
                  {plg.manifestId} · Permissions: {plg.permissions.join(', ')}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onTogglePlugin(plg.manifestId, !plg.enabled)}
                aria-pressed={plg.enabled}
                className={`px-3 py-1.5 text-xs font-semibold rounded border transition-colors ${
                  plg.enabled
                    ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300'
                    : 'border-slate-700 bg-[#0B0F17] text-slate-400'
                }`}
              >
                {plg.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Sandbox Security Profile */}
      <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
          <Shield className="w-4 h-4 text-sky-400" />
          <span>Ephemeral Sandbox &amp; Cross-Platform Policy</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 text-xs text-slate-400">
          <div>Execution Timeout: <span className="text-slate-200 font-mono tabular-nums">15,000 ms</span></div>
          <div>Heap Cap: <span className="text-slate-200 font-mono tabular-nums">256 MB</span></div>
          <div>Packaging Targets: <span className="text-slate-200">Web · Tauri 2 · Capacitor</span></div>
        </div>
      </section>
    </div>
  );
}
