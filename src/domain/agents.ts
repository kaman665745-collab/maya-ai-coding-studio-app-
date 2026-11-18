import type { AgentRole, FindingSeverity, ModelConfigRecord, ThinkingLevelName } from './types.ts';

export interface AgentRoleProfile {
  role: AgentRole;
  label: string;
  description: string;
  defaultModel: string;
  defaultThinkingLevel: ThinkingLevelName;
  supportsSearchGrounding: boolean;
  requiresApprovalForEdits: boolean;
}

export const AGENT_ROLE_PROFILES: Record<AgentRole, AgentRoleProfile> = {
  planner: {
    role: 'planner',
    label: 'Task Planner',
    description: 'Breaks engineering goals into sequenced implementation steps and file targets.',
    defaultModel: 'gemini-4-hydrogen',
    defaultThinkingLevel: 'HIGH',
    supportsSearchGrounding: true,
    requiresApprovalForEdits: true,
  },
  coder: {
    role: 'coder',
    label: 'Code Architect',
    description: 'Proposes validated multi-file patches for review before touching workspace files.',
    defaultModel: 'gemini-4-hydrogen',
    defaultThinkingLevel: 'MEDIUM',
    supportsSearchGrounding: false,
    requiresApprovalForEdits: true,
  },
  reviewer: {
    role: 'reviewer',
    label: 'Security & Code Reviewer',
    description: 'Audits workspace files for bugs, security risks, accessibility, and strict typing.',
    defaultModel: 'gemini-4-hydrogen',
    defaultThinkingLevel: 'HIGH',
    supportsSearchGrounding: false,
    requiresApprovalForEdits: true,
  },
  tester: {
    role: 'tester',
    label: 'Test Engineer',
    description: 'Designs unit & integration test suites and evaluates sandbox test runs.',
    defaultModel: 'gemini-3.1-flash-lite',
    defaultThinkingLevel: 'LOW',
    supportsSearchGrounding: false,
    requiresApprovalForEdits: true,
  },
  debugger: {
    role: 'debugger',
    label: 'Root-Cause Debugger',
    description: 'Analyzes stack traces, build failures, and runtime console logs with deep thinking.',
    defaultModel: 'gemini-4-hydrogen',
    defaultThinkingLevel: 'HIGH',
    supportsSearchGrounding: true,
    requiresApprovalForEdits: true,
  },
  docs: {
    role: 'docs',
    label: 'Docs & Research',
    description: 'Fast documentation lookups and grounded web references via Google Search.',
    defaultModel: 'gemini-3.1-flash-lite',
    defaultThinkingLevel: 'LOW',
    supportsSearchGrounding: true,
    requiresApprovalForEdits: true,
  },
};

export const AVAILABLE_GEMINI_MODELS = [
  {
    id: 'gemini-4-hydrogen',
    label: 'Gemini 4 Hydrogen',
    tier: 'standard',
    description: 'Balanced intelligence, Search Grounding, and HIGH/XHIGH thinking.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    tier: 'standard',
    description: 'Ultra low-latency responses for inline explanations, tests, and quick edits.',
  },
  {
    id: 'gemini-4-carbon',
    label: 'Gemini 4 Carbon',
    tier: 'paid',
    description: 'Deepest reasoning for root-cause debugging and architecture (requires paid key).',
  },
  {
    id: 'gemini-4-argon',
    label: 'Gemini 4 Argon',
    tier: 'paid',
    description: 'Complex multi-file coding and STEM synthesis (requires paid key).',
  },
] as const;

export function resolveModelForRole(
  role: AgentRole,
  configs: ModelConfigRecord[]
): { modelId: string; thinkingLevel: ThinkingLevelName; searchGrounding: boolean } {
  const custom = configs.find((c) => c.agentRole === role);
  const profile = AGENT_ROLE_PROFILES[role];
  if (!custom) {
    return {
      modelId: profile.defaultModel,
      thinkingLevel: profile.defaultThinkingLevel,
      searchGrounding: profile.supportsSearchGrounding,
    };
  }

  let thinkingLevel = custom.thinkingLevel;
  // Enforce model-specific thinkingLevel compatibility
  if (custom.modelId === 'gemini-3.1-flash-lite' && thinkingLevel !== 'MINIMAL' && thinkingLevel !== 'LOW') {
    thinkingLevel = 'LOW';
  }
  if (custom.modelId !== 'gemini-4-hydrogen' && thinkingLevel === 'XHIGH') {
    thinkingLevel = 'HIGH';
  }

  return {
    modelId: custom.modelId,
    thinkingLevel,
    searchGrounding: custom.searchGrounding,
  };
}

export function normalizeSeverity(value: string): FindingSeverity {
  const lower = value.toLowerCase();
  if (lower === 'critical') return 'critical';
  if (lower === 'high') return 'high';
  if (lower === 'low') return 'low';
  return 'medium';
}

export function extractJsonSafely<T>(rawText: string, fallback: T): T {
  try {
    const trimmed = rawText.trim();
    const cleaned = trimmed
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}
