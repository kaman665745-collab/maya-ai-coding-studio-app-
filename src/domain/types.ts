export type AgentRole = 'planner' | 'coder' | 'reviewer' | 'tester' | 'debugger' | 'docs';

export type ThinkingLevelName = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export type ProposalStatus =
  | 'planned'
  | 'awaiting_approval'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'rolled_back'
  | 'failed';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface ProjectSummary {
  id: number;
  workspaceId: number;
  ownerUid: string;
  name: string;
  slug: string;
  description: string;
  template: string;
  framework: string;
  status: string;
  activeBranch: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFileRecord {
  id: number;
  projectId: number;
  path: string;
  language: string;
  content: string;
  sha256: string;
  sizeBytes: number;
  isEntry: boolean;
  updatedByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileVersionRecord {
  id: number;
  projectId: number;
  fileId: number;
  path: string;
  versionNumber: number;
  content: string;
  sha256: string;
  commitMessage: string;
  authorUid: string;
  createdAt: string;
}

export interface ProposedFileChange {
  path: string;
  action: 'create' | 'update' | 'delete';
  language: string;
  originalContent: string;
  proposedContent: string;
  unifiedDiff: string;
  rationale: string;
}

export interface PlanStep {
  id: string;
  title: string;
  detail: string;
  targetFiles: string[];
  status: 'pending' | 'in_progress' | 'completed';
}

export interface AgentTaskRecord {
  id: number;
  projectId: number;
  conversationId: number | null;
  ownerUid: string;
  agentRole: AgentRole;
  title: string;
  description: string;
  status: ProposalStatus;
  planSteps: PlanStep[];
  changes: ProposedFileChange[];
  checkpointId: number | null;
  verificationSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroundingCitation {
  title: string;
  uri: string;
}

export interface ChatMessageRecord {
  id: number;
  conversationId: number;
  projectId: number;
  role: 'user' | 'assistant' | 'system';
  agentRole: AgentRole;
  modelId: string;
  content: string;
  citations?: GroundingCitation[];
  proposalTaskId?: number | null;
  thinkingSummary?: string;
  createdAt: string;
}

export interface ReviewFindingRecord {
  id: number;
  reportId: number;
  projectId: number;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  severity: FindingSeverity;
  category: string;
  title: string;
  description: string;
  suggestedPatch: string | null;
  status: 'open' | 'resolved' | 'ignored';
  createdAt: string;
}

export interface ReviewReportRecord {
  id: number;
  projectId: number;
  ownerUid: string;
  targetPath: string;
  modelId: string;
  summary: string;
  overallStatus: 'clean' | 'warnings' | 'critical';
  findingCount: number;
  findings: ReviewFindingRecord[];
  createdAt: string;
}

export interface BuildRunRecord {
  id: number;
  projectId: number;
  ownerUid: string;
  command: string;
  status: 'queued' | 'running' | 'passed' | 'failed';
  exitCode: number | null;
  logs: string;
  durationMs: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface TestRunRecord {
  id: number;
  projectId: number;
  ownerUid: string;
  suiteName: string;
  status: 'queued' | 'running' | 'passed' | 'failed';
  totalCount: number;
  passedCount: number;
  failedCount: number;
  logs: string;
  durationMs: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface CheckpointRecord {
  id: number;
  projectId: number;
  ownerUid: string;
  label: string;
  reason: string;
  fileCount: number;
  storageKey: string | null;
  createdAt: string;
}

export interface PreviewSessionState {
  sessionId: string;
  projectId: number;
  status: 'starting' | 'running' | 'error' | 'stopped';
  previewUrl: string | null;
  logs: string[];
  errorMessage: string | null;
  startedAt: string;
}

export interface ModelConfigRecord {
  id: number;
  agentRole: AgentRole;
  provider: string;
  modelId: string;
  thinkingLevel: ThinkingLevelName;
  searchGrounding: boolean;
  isDefault: boolean;
}

export interface PluginRecord {
  id: number;
  manifestId: string;
  name: string;
  version: string;
  description: string;
  permissions: string[];
  enabled: boolean;
}

export interface UsageRecordItem {
  id: number;
  projectId: number | null;
  provider: string;
  modelId: string;
  agentRole: string;
  promptTokens: number;
  outputTokens: number;
  latencyMs: number;
  createdAt: string;
}

export interface AuditLogItem {
  id: number;
  projectId: number | null;
  actorUid: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface GitConnectionRecord {
  id: number;
  projectId: number;
  provider: string;
  repoUrl: string;
  defaultBranch: string;
  currentBranch: string;
  lastCommitSha: string | null;
  lastSyncAt: string | null;
}
