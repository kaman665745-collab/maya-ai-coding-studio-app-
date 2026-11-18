import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull().default('Developer'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const workspaces = pgTable(
  'workspaces',
  {
    id: serial('id').primaryKey(),
    ownerUid: text('owner_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    plan: text('plan').notNull().default('standard'),
    featureFlagsJson: jsonb('feature_flags_json')
      .$type<Record<string, boolean>>()
      .notNull()
      .default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_workspaces_owner_uid').on(t.ownerUid),
    uniqueIndex('uq_workspaces_owner_slug').on(t.ownerUid, t.slug),
  ]
);

export const projects = pgTable(
  'projects',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid')
      .references(() => users.uid, { onDelete: 'cascade' })
      .notNull(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    template: text('template').notNull().default('react-vite-ts'),
    framework: text('framework').notNull().default('react'),
    status: text('status').notNull().default('active'),
    activeBranch: text('active_branch').notNull().default('main'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_projects_workspace').on(t.workspaceId),
    index('idx_projects_owner_uid').on(t.ownerUid),
    uniqueIndex('uq_projects_ws_slug').on(t.workspaceId, t.slug),
  ]
);

export const projectFiles = pgTable(
  'project_files',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    path: text('path').notNull(),
    language: text('language').notNull().default('typescript'),
    content: text('content').notNull(),
    sha256: text('sha256').notNull(),
    sizeBytes: integer('size_bytes').notNull().default(0),
    isEntry: boolean('is_entry').notNull().default(false),
    updatedByUid: text('updated_by_uid').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_project_files_project').on(t.projectId),
    uniqueIndex('uq_project_files_path').on(t.projectId, t.path),
  ]
);

export const fileVersions = pgTable(
  'file_versions',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    fileId: integer('file_id')
      .references(() => projectFiles.id, { onDelete: 'cascade' })
      .notNull(),
    path: text('path').notNull(),
    versionNumber: integer('version_number').notNull(),
    content: text('content').notNull(),
    sha256: text('sha256').notNull(),
    commitMessage: text('commit_message').notNull().default('Snapshot'),
    authorUid: text('author_uid').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_file_versions_file').on(t.fileId),
    index('idx_file_versions_project').on(t.projectId),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    title: text('title').notNull(),
    activeRole: text('active_role').notNull().default('coder'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('idx_conversations_project').on(t.projectId)]
);

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull(),
    agentRole: text('agent_role').notNull().default('coder'),
    modelId: text('model_id').notNull().default('gemini-4-hydrogen'),
    content: text('content').notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_messages_conversation').on(t.conversationId),
    index('idx_messages_project').on(t.projectId),
  ]
);

export const checkpoints = pgTable(
  'checkpoints',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    label: text('label').notNull(),
    reason: text('reason').notNull().default('Manual checkpoint'),
    snapshotJson: jsonb('snapshot_json')
      .$type<Array<{ path: string; content: string; language: string; sha256: string }>>()
      .notNull(),
    storageKey: text('storage_key'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_checkpoints_project').on(t.projectId)]
);

export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    conversationId: integer('conversation_id').references(() => conversations.id, {
      onDelete: 'set null',
    }),
    ownerUid: text('owner_uid').notNull(),
    agentRole: text('agent_role').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('awaiting_approval'),
    planStepsJson: jsonb('plan_steps_json').$type<Array<Record<string, unknown>>>().notNull().default([]),
    proposalJson: jsonb('proposal_json').$type<Record<string, unknown>>().notNull().default({}),
    checkpointId: integer('checkpoint_id').references(() => checkpoints.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_agent_tasks_project').on(t.projectId),
    index('idx_agent_tasks_status').on(t.status),
  ]
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id').references(() => agentTasks.id, { onDelete: 'set null' }),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    agentRole: text('agent_role').notNull(),
    modelId: text('model_id').notNull(),
    thinkingLevel: text('thinking_level').notNull().default('MEDIUM'),
    groundingUsed: boolean('grounding_used').notNull().default(false),
    status: text('status').notNull().default('completed'),
    inputSummary: text('input_summary').notNull(),
    outputSummary: text('output_summary').notNull().default(''),
    durationMs: integer('duration_ms').notNull().default(0),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_agent_runs_project').on(t.projectId)]
);

export const reviewReports = pgTable(
  'review_reports',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    targetPath: text('target_path').notNull().default('*'),
    modelId: text('model_id').notNull().default('gemini-4-hydrogen'),
    summary: text('summary').notNull(),
    overallStatus: text('overall_status').notNull().default('warnings'),
    findingCount: integer('finding_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_review_reports_project').on(t.projectId)]
);

export const reviewFindings = pgTable(
  'review_findings',
  {
    id: serial('id').primaryKey(),
    reportId: integer('report_id')
      .references(() => reviewReports.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    filePath: text('file_path').notNull(),
    lineStart: integer('line_start').notNull().default(1),
    lineEnd: integer('line_end').notNull().default(1),
    severity: text('severity').notNull().default('medium'),
    category: text('category').notNull().default('quality'),
    title: text('title').notNull(),
    description: text('description').notNull(),
    suggestedPatch: text('suggested_patch'),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_review_findings_report').on(t.reportId),
    index('idx_review_findings_project').on(t.projectId),
  ]
);

export const buildRuns = pgTable(
  'build_runs',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    command: text('command').notNull(),
    status: text('status').notNull().default('queued'),
    exitCode: integer('exit_code'),
    logs: text('logs').notNull().default(''),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    finishedAt: timestamp('finished_at'),
  },
  (t) => [index('idx_build_runs_project').on(t.projectId)]
);

export const testRuns = pgTable(
  'test_runs',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    suiteName: text('suite_name').notNull(),
    status: text('status').notNull().default('queued'),
    totalCount: integer('total_count').notNull().default(0),
    passedCount: integer('passed_count').notNull().default(0),
    failedCount: integer('failed_count').notNull().default(0),
    logs: text('logs').notNull().default(''),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    finishedAt: timestamp('finished_at'),
  },
  (t) => [index('idx_test_runs_project').on(t.projectId)]
);

export const environments = pgTable(
  'environments',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    name: text('name').notNull(),
    runtime: text('runtime').notNull().default('node-22-sandbox'),
    cpuLimitMillicores: integer('cpu_limit_millicores').notNull().default(500),
    memoryLimitMb: integer('memory_limit_mb').notNull().default(256),
    timeoutMs: integer('timeout_ms').notNull().default(15000),
    networkPolicy: text('network_policy').notNull().default('isolated-egress-deny'),
    status: text('status').notNull().default('stopped'),
    previewUrl: text('preview_url'),
    lastActiveAt: timestamp('last_active_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_environments_project').on(t.projectId)]
);

export const gitConnections = pgTable(
  'git_connections',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .references(() => projects.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    provider: text('provider').notNull().default('local-git'),
    repoUrl: text('repo_url').notNull().default(''),
    defaultBranch: text('default_branch').notNull().default('main'),
    currentBranch: text('current_branch').notNull().default('main'),
    lastCommitSha: text('last_commit_sha'),
    lastSyncAt: timestamp('last_sync_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_git_connections_project').on(t.projectId)]
);

export const plugins = pgTable(
  'plugins',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    manifestId: text('manifest_id').notNull(),
    name: text('name').notNull(),
    version: text('version').notNull().default('1.0.0'),
    description: text('description').notNull().default(''),
    permissionsJson: jsonb('permissions_json').$type<string[]>().notNull().default([]),
    enabled: boolean('enabled').notNull().default(true),
    configJson: jsonb('config_json').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_plugins_workspace').on(t.workspaceId),
    uniqueIndex('uq_plugins_ws_manifest').on(t.workspaceId, t.manifestId),
  ]
);

export const modelConfigs = pgTable(
  'model_configs',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    ownerUid: text('owner_uid').notNull(),
    agentRole: text('agent_role').notNull(),
    provider: text('provider').notNull().default('gemini'),
    modelId: text('model_id').notNull(),
    thinkingLevel: text('thinking_level').notNull().default('MEDIUM'),
    searchGrounding: boolean('search_grounding').notNull().default(false),
    isDefault: boolean('is_default').notNull().default(true),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_model_configs_workspace').on(t.workspaceId),
    uniqueIndex('uq_model_configs_ws_role').on(t.workspaceId, t.agentRole),
  ]
);

export const usageRecords = pgTable(
  'usage_records',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    ownerUid: text('owner_uid').notNull(),
    provider: text('provider').notNull().default('gemini'),
    modelId: text('model_id').notNull(),
    agentRole: text('agent_role').notNull(),
    promptTokens: integer('prompt_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    latencyMs: integer('latency_ms').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_usage_records_workspace').on(t.workspaceId),
    index('idx_usage_records_owner').on(t.ownerUid),
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: serial('id').primaryKey(),
    workspaceId: integer('workspace_id')
      .references(() => workspaces.id, { onDelete: 'cascade' })
      .notNull(),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
    actorUid: text('actor_uid').notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    detailsJson: jsonb('details_json').$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_audit_logs_workspace').on(t.workspaceId),
    index('idx_audit_logs_actor').on(t.actorUid),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  workspaces: many(workspaces),
  projects: many(projects),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerUid], references: [users.uid] }),
  projects: many(projects),
  plugins: many(plugins),
  modelConfigs: many(modelConfigs),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [projects.workspaceId], references: [workspaces.id] }),
  files: many(projectFiles),
  checkpoints: many(checkpoints),
  agentTasks: many(agentTasks),
  reviewReports: many(reviewReports),
  buildRuns: many(buildRuns),
  testRuns: many(testRuns),
}));
