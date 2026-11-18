import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, desc, eq } from 'drizzle-orm';
import { db, hasReachablePostgresConfig } from '../../db/index.ts';
import {
  agentRuns,
  agentTasks,
  auditLogs,
  buildRuns,
  checkpoints,
  conversations,
  environments,
  fileVersions,
  gitConnections,
  messages,
  modelConfigs,
  plugins,
  projectFiles,
  projects,
  reviewFindings,
  reviewReports,
  testRuns,
  usageRecords,
  users,
  workspaces,
} from '../../db/schema.ts';
import { getOrCreateUserAndWorkspace } from '../../db/users.ts';
import { computeSha256, inferLanguageFromPath, sanitizeProjectPath } from '../../domain/diff.ts';
import type {
  AgentRole,
  AgentTaskRecord,
  AuditLogItem,
  BuildRunRecord,
  ChatMessageRecord,
  CheckpointRecord,
  FileVersionRecord,
  GitConnectionRecord,
  ModelConfigRecord,
  PlanStep,
  PluginRecord,
  ProjectFileRecord,
  ProjectSummary,
  ProposedFileChange,
  ReviewFindingRecord,
  ReviewReportRecord,
  TestRunRecord,
  ThinkingLevelName,
  UsageRecordItem,
} from '../../domain/types.ts';
import type { AuthenticatedPrincipal } from '../middleware/auth.ts';
import { storageProvider } from '../services/storage.ts';

interface SeedFileSpec {
  path: string;
  content: string;
  isEntry?: boolean;
}

const PULSEBOARD_TEMPLATE_FILES: SeedFileSpec[] = [
  {
    path: 'index.html',
    isEntry: true,
    content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PulseBoard Service Monitor</title>
  </head>
  <body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  },
  {
    path: 'src/styles.css',
    content: `.pb-shell {
  min-height: 100vh;
  padding: 24px;
  background: #0f172a;
  color: #f1f5f9;
  font-family: system-ui, -apple-system, sans-serif;
}
.pb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 16px;
}
.pb-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.pb-card {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 16px;
}
.pb-label {
  font-size: 12px;
  color: #94a3b8;
  margin-bottom: 6px;
}
.pb-value {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.pb-btn {
  background: #0284c7;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
}
.pb-btn:hover { background: #0369a1; }
`,
  },
  {
    path: 'src/utils/metrics.ts',
    content: `export interface ServiceSample {
  name: string;
  latencyMs: number;
  errorRatePct: number;
  requestsPerMin: number;
}

export function calculateAverageLatency(samples: ServiceSample[]): number {
  if (samples.length === 0) return 0;
  const total = samples.reduce((sum, item) => sum + item.latencyMs, 0);
  return Math.round(total / samples.length);
}

export function countHealthyServices(samples: ServiceSample[], maxErrorPct = 1.0): number {
  return samples.filter((s) => s.errorRatePct <= maxErrorPct).length;
}
`,
  },
  {
    path: 'src/utils/metrics.test.ts',
    content: `import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAverageLatency, countHealthyServices } from './metrics';

test('calculateAverageLatency returns rounded mean latency', () => {
  const avg = calculateAverageLatency([
    { name: 'auth', latencyMs: 42, errorRatePct: 0.1, requestsPerMin: 320 },
    { name: 'billing', latencyMs: 58, errorRatePct: 0.4, requestsPerMin: 180 },
  ]);
  assert.equal(avg, 50);
  assert.equal(calculateAverageLatency([]), 0);
});

test('countHealthyServices filters by error rate threshold', () => {
  const count = countHealthyServices([
    { name: 'auth', latencyMs: 42, errorRatePct: 0.1, requestsPerMin: 320 },
    { name: 'ingest', latencyMs: 120, errorRatePct: 2.5, requestsPerMin: 910 },
  ]);
  assert.equal(count, 1);
});
`,
  },
  {
    path: 'src/App.tsx',
    content: `import React, { useState } from 'react';
import { calculateAverageLatency, countHealthyServices, type ServiceSample } from './utils/metrics';
import './styles.css';

const INITIAL_SERVICES: ServiceSample[] = [
  { name: 'Gateway API', latencyMs: 38, errorRatePct: 0.12, requestsPerMin: 1420 },
  { name: 'Auth Verifier', latencyMs: 24, errorRatePct: 0.05, requestsPerMin: 890 },
  { name: 'Job Worker', latencyMs: 64, errorRatePct: 0.85, requestsPerMin: 410 },
];

export default function App() {
  const [samples, setSamples] = useState<ServiceSample[]>(INITIAL_SERVICES);

  const avgLatency = calculateAverageLatency(samples);
  const healthyCount = countHealthyServices(samples);

  const handleSimulateSpike = () => {
    setSamples((prev) =>
      prev.map((item, idx) =>
        idx === 2 ? { ...item, latencyMs: item.latencyMs + 15 } : item
      )
    );
  };

  return (
    <main className="pb-shell">
      <header className="pb-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>PulseBoard Service Monitor</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#94a3b8' }}>
            Real sandbox preview of your workspace project
          </p>
        </div>
        <button className="pb-btn" onClick={handleSimulateSpike}>
          Test Latency Bump
        </button>
      </header>

      <section className="pb-grid">
        <div className="pb-card">
          <div className="pb-label">Average Latency</div>
          <div className="pb-value">{avgLatency} ms</div>
        </div>
        <div className="pb-card">
          <div className="pb-label">Healthy Services</div>
          <div className="pb-value">{healthyCount} / {samples.length}</div>
        </div>
      </section>

      <section className="pb-card">
        <div className="pb-label" style={{ marginBottom: 12 }}>Active Endpoints</div>
        {samples.map((s) => (
          <div
            key={s.name}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderTop: '1px solid #334155',
              fontSize: 14,
            }}
          >
            <span>{s.name}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#38bdf8' }}>
              {s.latencyMs} ms · {s.errorRatePct}% err
            </span>
          </div>
        ))}
      </section>
    </main>
  );
}
`,
  },
  {
    path: 'src/main.tsx',
    isEntry: true,
    content: `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
`,
  },
];

const NODE_API_TEMPLATE_FILES: SeedFileSpec[] = [
  {
    path: 'src/server.ts',
    isEntry: true,
    content: `export interface HealthPayload {
  status: 'ok';
  service: string;
}

export function buildHealthPayload(service: string): HealthPayload {
  return { status: 'ok', service };
}
`,
  },
  {
    path: 'src/server.test.ts',
    content: `import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHealthPayload } from './server';

test('buildHealthPayload returns ok status', () => {
  assert.deepEqual(buildHealthPayload('orders-api'), { status: 'ok', service: 'orders-api' });
});
`,
  },
];

// Durable local JSON store used transparently when Cloud SQL Auth Proxy socket is unavailable in preview
interface LocalStoreState {
  nextId: number;
  users: Array<{ uid: string; email: string; displayName: string; avatarUrl: string | null; createdAt: string }>;
  workspaces: Array<{
    id: number;
    ownerUid: string;
    name: string;
    slug: string;
    plan: string;
    featureFlags: Record<string, boolean>;
    createdAt: string;
  }>;
  projects: ProjectSummary[];
  files: ProjectFileRecord[];
  versions: FileVersionRecord[];
  conversations: Array<{ id: number; projectId: number; ownerUid: string; title: string; activeRole: AgentRole }>;
  messages: ChatMessageRecord[];
  tasks: AgentTaskRecord[];
  checkpoints: Array<CheckpointRecord & { snapshot: Array<{ path: string; content: string; language: string; sha256: string }> }>;
  reviews: ReviewReportRecord[];
  builds: BuildRunRecord[];
  tests: TestRunRecord[];
  git: GitConnectionRecord[];
  plugins: Array<PluginRecord & { workspaceId: number }>;
  modelConfigs: Array<ModelConfigRecord & { workspaceId: number }>;
  usage: Array<UsageRecordItem & { workspaceId: number; ownerUid: string }>;
  audit: Array<AuditLogItem & { workspaceId: number }>;
}

const STORE_FILE = path.resolve(process.cwd(), process.env.ACS_STORAGE_DIR || '.acs-storage', 'studio-store.json');

function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${(err as { cause?: Error }).cause?.message || ''}` : String(err);
  return (
    msg.includes('ENOENT') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('Connection terminated') ||
    msg.includes('timeout') ||
    msg.includes('Failed to synchronize user') ||
    msg.includes('SQL_HOST')
  );
}

class StudioRepository {
  private useLocalFallback = !hasReachablePostgresConfig();
  private localCache: LocalStoreState | null = null;
  private writeLock = Promise.resolve();

  private async loadLocalStore(): Promise<LocalStoreState> {
    if (this.localCache) return this.localCache;
    try {
      const raw = await fs.readFile(STORE_FILE, 'utf8');
      this.localCache = JSON.parse(raw) as LocalStoreState;
      return this.localCache;
    } catch {
      const fresh: LocalStoreState = {
        nextId: 100,
        users: [],
        workspaces: [],
        projects: [],
        files: [],
        versions: [],
        conversations: [],
        messages: [],
        tasks: [],
        checkpoints: [],
        reviews: [],
        builds: [],
        tests: [],
        git: [],
        plugins: [],
        modelConfigs: [],
        usage: [],
        audit: [],
      };
      this.localCache = fresh;
      await this.saveLocalStore(fresh);
      return fresh;
    }
  }

  private async saveLocalStore(state: LocalStoreState): Promise<void> {
    this.localCache = state;
    this.writeLock = this.writeLock.then(async () => {
      await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
      const tmp = `${STORE_FILE}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
      await fs.rename(tmp, STORE_FILE);
    });
    await this.writeLock;
  }

  private nextLocalId(state: LocalStoreState): number {
    state.nextId += 1;
    return state.nextId;
  }

  async ensureTenantSeeded(principal: AuthenticatedPrincipal): Promise<{
    workspaceId: number;
    projects: ProjectSummary[];
  }> {
    if (!this.useLocalFallback) {
      try {
        const { workspace } = await getOrCreateUserAndWorkspace(
          principal.uid,
          principal.email,
          principal.displayName,
          principal.avatarUrl
        );

        const existingProjects = await db
          .select()
          .from(projects)
          .where(and(eq(projects.workspaceId, workspace.id), eq(projects.ownerUid, principal.uid)))
          .orderBy(desc(projects.updatedAt));

        if (existingProjects.length === 0) {
          await this.createProject(principal, {
            name: 'PulseBoard Monitor',
            description: 'Starter React + TypeScript telemetry app with unit tests and live preview.',
            template: 'react-vite-ts',
          });
        }

        const list = await db
          .select()
          .from(projects)
          .where(and(eq(projects.workspaceId, workspace.id), eq(projects.ownerUid, principal.uid)))
          .orderBy(desc(projects.updatedAt));

        return {
          workspaceId: workspace.id,
          projects: list.map((p) => ({
            ...p,
            createdAt: p.createdAt.toISOString(),
            updatedAt: p.updatedAt.toISOString(),
          })),
        };
      } catch (err) {
        if (!isConnectionError(err)) throw err;
        this.useLocalFallback = true;
      }
    }

    const store = await this.loadLocalStore();
    let user = store.users.find((u) => u.uid === principal.uid);
    if (!user) {
      user = {
        uid: principal.uid,
        email: principal.email,
        displayName: principal.displayName,
        avatarUrl: principal.avatarUrl,
        createdAt: new Date().toISOString(),
      };
      store.users.push(user);
    }

    let ws = store.workspaces.find((w) => w.ownerUid === principal.uid);
    if (!ws) {
      const wsId = this.nextLocalId(store);
      ws = {
        id: wsId,
        ownerUid: principal.uid,
        name: 'Primary Studio Workspace',
        slug: `ws-${principal.uid.slice(0, 8).toLowerCase()}`,
        plan: 'standard',
        featureFlags: {
          sandboxIsolation: true,
          searchGrounding: true,
          workspaceSync: true,
          autoCheckpointOnApply: true,
          strictPathValidation: true,
        },
        createdAt: new Date().toISOString(),
      };
      store.workspaces.push(ws);

      const roles: Array<{
        role: AgentRole;
        modelId: string;
        thinkingLevel: ThinkingLevelName;
        searchGrounding: boolean;
      }> = [
        { role: 'planner', modelId: 'gemini-4-hydrogen', thinkingLevel: 'HIGH', searchGrounding: true },
        { role: 'coder', modelId: 'gemini-4-hydrogen', thinkingLevel: 'MEDIUM', searchGrounding: false },
        { role: 'reviewer', modelId: 'gemini-4-hydrogen', thinkingLevel: 'HIGH', searchGrounding: false },
        { role: 'tester', modelId: 'gemini-3.1-flash-lite', thinkingLevel: 'LOW', searchGrounding: false },
        { role: 'debugger', modelId: 'gemini-4-hydrogen', thinkingLevel: 'HIGH', searchGrounding: true },
        { role: 'docs', modelId: 'gemini-3.1-flash-lite', thinkingLevel: 'LOW', searchGrounding: true },
      ];
      for (const r of roles) {
        store.modelConfigs.push({
          id: this.nextLocalId(store),
          workspaceId: ws.id,
          agentRole: r.role,
          provider: 'gemini',
          modelId: r.modelId,
          thinkingLevel: r.thinkingLevel,
          searchGrounding: r.searchGrounding,
          isDefault: true,
        });
      }

      store.plugins.push(
        {
          id: this.nextLocalId(store),
          workspaceId: ws.id,
          manifestId: 'acs.security-scanner',
          name: 'Static Security & Secret Redactor',
          version: '1.2.0',
          description: 'Scans proposed patches for hardcoded credentials and path traversal.',
          permissions: ['read:files', 'write:findings'],
          enabled: true,
        },
        {
          id: this.nextLocalId(store),
          workspaceId: ws.id,
          manifestId: 'acs.workspace-exporter',
          name: 'Google Workspace Sync Adapter',
          version: '1.0.0',
          description: 'Exports build telemetry to Google Sheets and tasks to Google Tasks.',
          permissions: ['read:project', 'workspace:oauth'],
          enabled: true,
        },
        {
          id: this.nextLocalId(store),
          workspaceId: ws.id,
          manifestId: 'acs.cross-platform-packager',
          name: 'Tauri 2 & Capacitor Manifest Checker',
          version: '1.1.0',
          description: 'Validates responsive layouts and native bridge compatibility.',
          permissions: ['read:files', 'read:builds'],
          enabled: true,
        }
      );

      await this.saveLocalStore(store);
    }

    const userProjects = store.projects.filter((p) => p.ownerUid === principal.uid);
    if (userProjects.length === 0) {
      await this.createProject(principal, {
        name: 'PulseBoard Monitor',
        description: 'Starter React + TypeScript telemetry app with unit tests and live preview.',
        template: 'react-vite-ts',
      });
    }

    const refreshed = await this.loadLocalStore();
    return {
      workspaceId: ws.id,
      projects: refreshed.projects
        .filter((p) => p.ownerUid === principal.uid)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  async createProject(
    principal: AuthenticatedPrincipal,
    input: { name: string; description?: string; template: 'react-vite-ts' | 'node-api-ts' | 'blank-web' }
  ): Promise<ProjectSummary> {
    const slug = `${input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'}-${crypto.randomBytes(2).toString('hex')}`;

    const seedFiles: SeedFileSpec[] =
      input.template === 'node-api-ts'
        ? NODE_API_TEMPLATE_FILES
        : input.template === 'blank-web'
          ? [
              {
                path: 'index.html',
                isEntry: true,
                content: '<!doctype html><html><body><main id="app"><h1>New ACS Web App</h1></main></body></html>\n',
              },
              {
                path: 'src/main.ts',
                isEntry: true,
                content: 'console.log("ACS Web App initialized");\n',
              },
            ]
          : PULSEBOARD_TEMPLATE_FILES;

    const now = new Date().toISOString();

    if (!this.useLocalFallback) {
      try {
        const { workspace } = await getOrCreateUserAndWorkspace(principal.uid, principal.email);
        const inserted = await db
          .insert(projects)
          .values({
            workspaceId: workspace.id,
            ownerUid: principal.uid,
            name: input.name,
            slug,
            description: input.description || '',
            template: input.template,
            framework: input.template === 'node-api-ts' ? 'node' : 'react',
            status: 'active',
            activeBranch: 'main',
          })
          .returning();
        const proj = inserted[0];

        for (const sf of seedFiles) {
          const safePath = sanitizeProjectPath(sf.path);
          const sha = computeSha256(sf.content);
          const insertedFile = await db
            .insert(projectFiles)
            .values({
              projectId: proj.id,
              path: safePath,
              language: inferLanguageFromPath(safePath),
              content: sf.content,
              sha256: sha,
              sizeBytes: Buffer.byteLength(sf.content, 'utf8'),
              isEntry: Boolean(sf.isEntry),
              updatedByUid: principal.uid,
            })
            .returning();

          await db.insert(fileVersions).values({
            projectId: proj.id,
            fileId: insertedFile[0].id,
            path: safePath,
            versionNumber: 1,
            content: sf.content,
            sha256: sha,
            commitMessage: 'Initial template commit',
            authorUid: principal.uid,
          });
        }

        await db.insert(gitConnections).values({
          projectId: proj.id,
          ownerUid: principal.uid,
          provider: 'local-git',
          repoUrl: '',
          defaultBranch: 'main',
          currentBranch: 'main',
          lastCommitSha: crypto.randomBytes(8).toString('hex'),
          lastSyncAt: new Date(),
        });

        await db.insert(environments).values({
          projectId: proj.id,
          ownerUid: principal.uid,
          name: 'isolated-sandbox-default',
          runtime: 'node-22-sandbox',
          status: 'ready',
        });

        const conv = await db
          .insert(conversations)
          .values({
            projectId: proj.id,
            ownerUid: principal.uid,
            title: 'Studio Session',
            activeRole: 'coder',
          })
          .returning();

        await db.insert(messages).values({
          conversationId: conv[0].id,
          projectId: proj.id,
          role: 'assistant',
          agentRole: 'coder',
          modelId: 'gemini-4-hydrogen',
          content: `Workspace "${proj.name}" is ready. Ask me to plan features, propose multi-file diffs, run code reviews, or analyze tests.`,
          metadataJson: {},
        });

        await this.recordAudit(principal.uid, workspace.id, proj.id, 'project.create', 'project', String(proj.id), {
          name: proj.name,
          template: input.template,
        });

        return {
          ...proj,
          createdAt: proj.createdAt.toISOString(),
          updatedAt: proj.updatedAt.toISOString(),
        };
      } catch (err) {
        if (!isConnectionError(err)) throw err;
        this.useLocalFallback = true;
      }
    }

    const store = await this.loadLocalStore();
    let ws = store.workspaces.find((w) => w.ownerUid === principal.uid);
    if (!ws) {
      await this.ensureTenantSeeded(principal);
      ws = store.workspaces.find((w) => w.ownerUid === principal.uid)!;
    }

    const projId = this.nextLocalId(store);
    const project: ProjectSummary = {
      id: projId,
      workspaceId: ws.id,
      ownerUid: principal.uid,
      name: input.name,
      slug,
      description: input.description || '',
      template: input.template,
      framework: input.template === 'node-api-ts' ? 'node' : 'react',
      status: 'active',
      activeBranch: 'main',
      createdAt: now,
      updatedAt: now,
    };
    store.projects.push(project);

    for (const sf of seedFiles) {
      const safePath = sanitizeProjectPath(sf.path);
      const sha = computeSha256(sf.content);
      const fileId = this.nextLocalId(store);
      store.files.push({
        id: fileId,
        projectId: projId,
        path: safePath,
        language: inferLanguageFromPath(safePath),
        content: sf.content,
        sha256: sha,
        sizeBytes: Buffer.byteLength(sf.content, 'utf8'),
        isEntry: Boolean(sf.isEntry),
        updatedByUid: principal.uid,
        createdAt: now,
        updatedAt: now,
      });
      store.versions.push({
        id: this.nextLocalId(store),
        projectId: projId,
        fileId,
        path: safePath,
        versionNumber: 1,
        content: sf.content,
        sha256: sha,
        commitMessage: 'Initial template commit',
        authorUid: principal.uid,
        createdAt: now,
      });
    }

    store.git.push({
      id: this.nextLocalId(store),
      projectId: projId,
      provider: 'local-git',
      repoUrl: '',
      defaultBranch: 'main',
      currentBranch: 'main',
      lastCommitSha: crypto.randomBytes(8).toString('hex'),
      lastSyncAt: now,
    });

    const convId = this.nextLocalId(store);
    store.conversations.push({
      id: convId,
      projectId: projId,
      ownerUid: principal.uid,
      title: 'Studio Session',
      activeRole: 'coder',
    });

    store.messages.push({
      id: this.nextLocalId(store),
      conversationId: convId,
      projectId: projId,
      role: 'assistant',
      agentRole: 'coder',
      modelId: 'gemini-4-hydrogen',
      content: `Workspace "${project.name}" is ready. Ask me to plan features, propose multi-file diffs, run code reviews, or analyze tests.`,
      createdAt: now,
    });

    store.audit.push({
      id: this.nextLocalId(store),
      workspaceId: ws.id,
      projectId: projId,
      actorUid: principal.uid,
      action: 'project.create',
      resourceType: 'project',
      resourceId: String(projId),
      details: { name: project.name, template: input.template },
      createdAt: now,
    });

    await this.saveLocalStore(store);
    return project;
  }

  async requireOwnedProject(ownerUid: string, projectId: number): Promise<ProjectSummary> {
    if (!this.useLocalFallback) {
      try {
        const rows = await db
          .select()
          .from(projects)
          .where(and(eq(projects.id, projectId), eq(projects.ownerUid, ownerUid)))
          .limit(1);
        if (!rows[0]) {
          throw new Error('Project not found or access denied.');
        }
        return {
          ...rows[0],
          createdAt: rows[0].createdAt.toISOString(),
          updatedAt: rows[0].updatedAt.toISOString(),
        };
      } catch (err) {
        if (!isConnectionError(err)) throw err;
        this.useLocalFallback = true;
      }
    }

    const store = await this.loadLocalStore();
    const found = store.projects.find((p) => p.id === projectId && p.ownerUid === ownerUid);
    if (!found) {
      throw new Error('Project not found or access denied.');
    }
    return found;
  }

  async deleteProject(ownerUid: string, projectId: number): Promise<void> {
    const project = await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.ownerUid, ownerUid)));
      await this.recordAudit(ownerUid, project.workspaceId, null, 'project.delete', 'project', String(projectId), {
        name: project.name,
      });
      return;
    }

    const store = await this.loadLocalStore();
    store.projects = store.projects.filter((p) => p.id !== projectId);
    store.files = store.files.filter((f) => f.projectId !== projectId);
    store.versions = store.versions.filter((v) => v.projectId !== projectId);
    store.conversations = store.conversations.filter((c) => c.projectId !== projectId);
    store.messages = store.messages.filter((m) => m.projectId !== projectId);
    store.tasks = store.tasks.filter((t) => t.projectId !== projectId);
    store.checkpoints = store.checkpoints.filter((c) => c.projectId !== projectId);
    store.reviews = store.reviews.filter((r) => r.projectId !== projectId);
    store.builds = store.builds.filter((b) => b.projectId !== projectId);
    store.tests = store.tests.filter((t) => t.projectId !== projectId);
    store.git = store.git.filter((g) => g.projectId !== projectId);
    store.audit.push({
      id: this.nextLocalId(store),
      workspaceId: project.workspaceId,
      projectId: null,
      actorUid: ownerUid,
      action: 'project.delete',
      resourceType: 'project',
      resourceId: String(projectId),
      details: { name: project.name },
      createdAt: new Date().toISOString(),
    });
    await this.saveLocalStore(store);
  }

  async listProjectFiles(ownerUid: string, projectId: number): Promise<ProjectFileRecord[]> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(projectFiles)
        .where(eq(projectFiles.projectId, projectId))
        .orderBy(projectFiles.path);
      return rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }));
    }

    const store = await this.loadLocalStore();
    return store.files
      .filter((f) => f.projectId === projectId)
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async upsertProjectFile(
    ownerUid: string,
    projectId: number,
    rawPath: string,
    content: string,
    commitMessage = 'Direct editor save'
  ): Promise<ProjectFileRecord> {
    const project = await this.requireOwnedProject(ownerUid, projectId);
    const safePath = sanitizeProjectPath(rawPath);
    const language = inferLanguageFromPath(safePath);
    const sha = computeSha256(content);
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    const now = new Date().toISOString();

    if (!this.useLocalFallback) {
      const existing = await db
        .select()
        .from(projectFiles)
        .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, safePath)))
        .limit(1);

      let fileRow;
      if (existing[0]) {
        const updated = await db
          .update(projectFiles)
          .set({
            content,
            language,
            sha256: sha,
            sizeBytes,
            updatedByUid: ownerUid,
            updatedAt: new Date(),
          })
          .where(eq(projectFiles.id, existing[0].id))
          .returning();
        fileRow = updated[0];
      } else {
        const inserted = await db
          .insert(projectFiles)
          .values({
            projectId,
            path: safePath,
            language,
            content,
            sha256: sha,
            sizeBytes,
            isEntry: false,
            updatedByUid: ownerUid,
          })
          .returning();
        fileRow = inserted[0];
      }

      const prevVersions = await db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.fileId, fileRow.id));

      await db.insert(fileVersions).values({
        projectId,
        fileId: fileRow.id,
        path: safePath,
        versionNumber: prevVersions.length + 1,
        content,
        sha256: sha,
        commitMessage,
        authorUid: ownerUid,
      });

      await db.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
      await this.recordAudit(ownerUid, project.workspaceId, projectId, 'file.save', 'file', safePath, {
        sizeBytes,
        commitMessage,
      });

      return {
        ...fileRow,
        createdAt: fileRow.createdAt.toISOString(),
        updatedAt: fileRow.updatedAt.toISOString(),
      };
    }

    const store = await this.loadLocalStore();
    let existing = store.files.find((f) => f.projectId === projectId && f.path === safePath);
    if (existing) {
      existing.content = content;
      existing.language = language;
      existing.sha256 = sha;
      existing.sizeBytes = sizeBytes;
      existing.updatedByUid = ownerUid;
      existing.updatedAt = now;
    } else {
      existing = {
        id: this.nextLocalId(store),
        projectId,
        path: safePath,
        language,
        content,
        sha256: sha,
        sizeBytes,
        isEntry: false,
        updatedByUid: ownerUid,
        createdAt: now,
        updatedAt: now,
      };
      store.files.push(existing);
    }

    const prevVersions = store.versions.filter((v) => v.fileId === existing!.id);
    store.versions.push({
      id: this.nextLocalId(store),
      projectId,
      fileId: existing.id,
      path: safePath,
      versionNumber: prevVersions.length + 1,
      content,
      sha256: sha,
      commitMessage,
      authorUid: ownerUid,
      createdAt: now,
    });

    const pIdx = store.projects.findIndex((p) => p.id === projectId);
    if (pIdx >= 0) store.projects[pIdx].updatedAt = now;

    store.audit.push({
      id: this.nextLocalId(store),
      workspaceId: project.workspaceId,
      projectId,
      actorUid: ownerUid,
      action: 'file.save',
      resourceType: 'file',
      resourceId: safePath,
      details: { sizeBytes, commitMessage },
      createdAt: now,
    });

    await this.saveLocalStore(store);
    return existing;
  }

  async deleteProjectFile(ownerUid: string, projectId: number, rawPath: string): Promise<void> {
    const project = await this.requireOwnedProject(ownerUid, projectId);
    const safePath = sanitizeProjectPath(rawPath);

    if (!this.useLocalFallback) {
      await db
        .delete(projectFiles)
        .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, safePath)));
      await this.recordAudit(ownerUid, project.workspaceId, projectId, 'file.delete', 'file', safePath, {});
      return;
    }

    const store = await this.loadLocalStore();
    store.files = store.files.filter((f) => !(f.projectId === projectId && f.path === safePath));
    store.audit.push({
      id: this.nextLocalId(store),
      workspaceId: project.workspaceId,
      projectId,
      actorUid: ownerUid,
      action: 'file.delete',
      resourceType: 'file',
      resourceId: safePath,
      details: {},
      createdAt: new Date().toISOString(),
    });
    await this.saveLocalStore(store);
  }

  async listFileVersions(ownerUid: string, projectId: number): Promise<FileVersionRecord[]> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(fileVersions)
        .where(eq(fileVersions.projectId, projectId))
        .orderBy(desc(fileVersions.createdAt))
        .limit(100);
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    }
    const store = await this.loadLocalStore();
    return store.versions
      .filter((v) => v.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
  }

  async getOrCreateConversation(ownerUid: string, projectId: number): Promise<{
    conversationId: number;
    messages: ChatMessageRecord[];
  }> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      let convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.projectId, projectId))
        .limit(1);
      if (!convs[0]) {
        convs = await db
          .insert(conversations)
          .values({ projectId, ownerUid, title: 'Studio Session', activeRole: 'coder' })
          .returning();
      }
      const msgs = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, convs[0].id))
        .orderBy(messages.createdAt);

      return {
        conversationId: convs[0].id,
        messages: msgs.map((m) => ({
          id: m.id,
          conversationId: m.conversationId,
          projectId: m.projectId,
          role: m.role as 'user' | 'assistant' | 'system',
          agentRole: m.agentRole as AgentRole,
          modelId: m.modelId,
          content: m.content,
          citations: (m.metadataJson.citations as ChatMessageRecord['citations']) || undefined,
          proposalTaskId: (m.metadataJson.proposalTaskId as number | null) ?? null,
          thinkingSummary: (m.metadataJson.thinkingSummary as string | undefined) || undefined,
          createdAt: m.createdAt.toISOString(),
        })),
      };
    }

    const store = await this.loadLocalStore();
    let conv = store.conversations.find((c) => c.projectId === projectId);
    if (!conv) {
      conv = {
        id: this.nextLocalId(store),
        projectId,
        ownerUid,
        title: 'Studio Session',
        activeRole: 'coder',
      };
      store.conversations.push(conv);
      await this.saveLocalStore(store);
    }
    return {
      conversationId: conv.id,
      messages: store.messages.filter((m) => m.conversationId === conv!.id),
    };
  }

  async appendMessage(input: {
    conversationId: number;
    projectId: number;
    role: 'user' | 'assistant' | 'system';
    agentRole: AgentRole;
    modelId: string;
    content: string;
    citations?: ChatMessageRecord['citations'];
    proposalTaskId?: number | null;
    thinkingSummary?: string;
  }): Promise<ChatMessageRecord> {
    const now = new Date().toISOString();
    if (!this.useLocalFallback) {
      const inserted = await db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          projectId: input.projectId,
          role: input.role,
          agentRole: input.agentRole,
          modelId: input.modelId,
          content: input.content,
          metadataJson: {
            citations: input.citations || [],
            proposalTaskId: input.proposalTaskId ?? null,
            thinkingSummary: input.thinkingSummary || null,
          },
        })
        .returning();
      const m = inserted[0];
      return {
        id: m.id,
        conversationId: m.conversationId,
        projectId: m.projectId,
        role: m.role as 'user' | 'assistant' | 'system',
        agentRole: m.agentRole as AgentRole,
        modelId: m.modelId,
        content: m.content,
        citations: input.citations,
        proposalTaskId: input.proposalTaskId,
        thinkingSummary: input.thinkingSummary,
        createdAt: m.createdAt.toISOString(),
      };
    }

    const store = await this.loadLocalStore();
    const record: ChatMessageRecord = {
      id: this.nextLocalId(store),
      conversationId: input.conversationId,
      projectId: input.projectId,
      role: input.role,
      agentRole: input.agentRole,
      modelId: input.modelId,
      content: input.content,
      citations: input.citations,
      proposalTaskId: input.proposalTaskId,
      thinkingSummary: input.thinkingSummary,
      createdAt: now,
    };
    store.messages.push(record);
    await this.saveLocalStore(store);
    return record;
  }

  async createAgentTask(input: {
    projectId: number;
    conversationId: number | null;
    ownerUid: string;
    agentRole: AgentRole;
    title: string;
    description: string;
    status: AgentTaskRecord['status'];
    planSteps: PlanStep[];
    changes: ProposedFileChange[];
  }): Promise<AgentTaskRecord> {
    const now = new Date().toISOString();
    if (!this.useLocalFallback) {
      const inserted = await db
        .insert(agentTasks)
        .values({
          projectId: input.projectId,
          conversationId: input.conversationId,
          ownerUid: input.ownerUid,
          agentRole: input.agentRole,
          title: input.title,
          description: input.description,
          status: input.status,
          planStepsJson: input.planSteps as unknown as Array<Record<string, unknown>>,
          proposalJson: { changes: input.changes } as unknown as Record<string, unknown>,
        })
        .returning();
      const t = inserted[0];
      return {
        id: t.id,
        projectId: t.projectId,
        conversationId: t.conversationId,
        ownerUid: t.ownerUid,
        agentRole: t.agentRole as AgentRole,
        title: t.title,
        description: t.description,
        status: t.status as AgentTaskRecord['status'],
        planSteps: input.planSteps,
        changes: input.changes,
        checkpointId: t.checkpointId,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    }

    const store = await this.loadLocalStore();
    const task: AgentTaskRecord = {
      id: this.nextLocalId(store),
      projectId: input.projectId,
      conversationId: input.conversationId,
      ownerUid: input.ownerUid,
      agentRole: input.agentRole,
      title: input.title,
      description: input.description,
      status: input.status,
      planSteps: input.planSteps,
      changes: input.changes,
      checkpointId: null,
      createdAt: now,
      updatedAt: now,
    };
    store.tasks.push(task);
    await this.saveLocalStore(store);
    return task;
  }

  async listAgentTasks(ownerUid: string, projectId: number): Promise<AgentTaskRecord[]> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(agentTasks)
        .where(eq(agentTasks.projectId, projectId))
        .orderBy(desc(agentTasks.createdAt));
      return rows.map((t) => ({
        id: t.id,
        projectId: t.projectId,
        conversationId: t.conversationId,
        ownerUid: t.ownerUid,
        agentRole: t.agentRole as AgentRole,
        title: t.title,
        description: t.description,
        status: t.status as AgentTaskRecord['status'],
        planSteps: (t.planStepsJson as unknown as PlanStep[]) || [],
        changes: ((t.proposalJson as { changes?: ProposedFileChange[] })?.changes) || [],
        checkpointId: t.checkpointId,
        verificationSummary: (t.proposalJson as { verificationSummary?: string })?.verificationSummary,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }));
    }

    const store = await this.loadLocalStore();
    return store.tasks
      .filter((t) => t.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async updateAgentTaskStatus(
    ownerUid: string,
    projectId: number,
    taskId: number,
    status: AgentTaskRecord['status'],
    checkpointId?: number | null,
    verificationSummary?: string
  ): Promise<AgentTaskRecord> {
    await this.requireOwnedProject(ownerUid, projectId);
    const now = new Date().toISOString();

    if (!this.useLocalFallback) {
      const existing = await db
        .select()
        .from(agentTasks)
        .where(and(eq(agentTasks.id, taskId), eq(agentTasks.projectId, projectId)))
        .limit(1);
      if (!existing[0]) throw new Error('Proposal task not found.');

      const nextProposalJson = {
        ...(existing[0].proposalJson || {}),
        ...(verificationSummary ? { verificationSummary } : {}),
      };

      const updated = await db
        .update(agentTasks)
        .set({
          status,
          ...(checkpointId !== undefined ? { checkpointId } : {}),
          proposalJson: nextProposalJson,
          updatedAt: new Date(),
        })
        .where(eq(agentTasks.id, taskId))
        .returning();
      const t = updated[0];
      return {
        id: t.id,
        projectId: t.projectId,
        conversationId: t.conversationId,
        ownerUid: t.ownerUid,
        agentRole: t.agentRole as AgentRole,
        title: t.title,
        description: t.description,
        status: t.status as AgentTaskRecord['status'],
        planSteps: (t.planStepsJson as unknown as PlanStep[]) || [],
        changes: ((t.proposalJson as { changes?: ProposedFileChange[] })?.changes) || [],
        checkpointId: t.checkpointId,
        verificationSummary,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      };
    }

    const store = await this.loadLocalStore();
    const task = store.tasks.find((t) => t.id === taskId && t.projectId === projectId);
    if (!task) throw new Error('Proposal task not found.');
    task.status = status;
    if (checkpointId !== undefined) task.checkpointId = checkpointId;
    if (verificationSummary) task.verificationSummary = verificationSummary;
    task.updatedAt = now;
    await this.saveLocalStore(store);
    return task;
  }

  async createCheckpoint(
    ownerUid: string,
    projectId: number,
    label: string,
    reason: string
  ): Promise<CheckpointRecord> {
    const project = await this.requireOwnedProject(ownerUid, projectId);
    const files = await this.listProjectFiles(ownerUid, projectId);
    const snapshot = files.map((f) => ({
      path: f.path,
      content: f.content,
      language: f.language,
      sha256: f.sha256,
    }));

    const storageKey = `checkpoints/${ownerUid}/${projectId}/${Date.now()}-${crypto.randomBytes(3).toString('hex')}.json`;
    await storageProvider.putObject(storageKey, JSON.stringify({ projectId, label, reason, snapshot }));
    const now = new Date().toISOString();

    if (!this.useLocalFallback) {
      const inserted = await db
        .insert(checkpoints)
        .values({
          projectId,
          ownerUid,
          label,
          reason,
          snapshotJson: snapshot,
          storageKey,
        })
        .returning();
      const cp = inserted[0];
      await this.recordAudit(ownerUid, project.workspaceId, projectId, 'checkpoint.create', 'checkpoint', String(cp.id), {
        label,
        fileCount: snapshot.length,
      });
      return {
        id: cp.id,
        projectId: cp.projectId,
        ownerUid: cp.ownerUid,
        label: cp.label,
        reason: cp.reason,
        fileCount: snapshot.length,
        storageKey: cp.storageKey,
        createdAt: cp.createdAt.toISOString(),
      };
    }

    const store = await this.loadLocalStore();
    const cp = {
      id: this.nextLocalId(store),
      projectId,
      ownerUid,
      label,
      reason,
      fileCount: snapshot.length,
      storageKey,
      createdAt: now,
      snapshot,
    };
    store.checkpoints.push(cp);
    store.audit.push({
      id: this.nextLocalId(store),
      workspaceId: project.workspaceId,
      projectId,
      actorUid: ownerUid,
      action: 'checkpoint.create',
      resourceType: 'checkpoint',
      resourceId: String(cp.id),
      details: { label, fileCount: snapshot.length },
      createdAt: now,
    });
    await this.saveLocalStore(store);
    return {
      id: cp.id,
      projectId: cp.projectId,
      ownerUid: cp.ownerUid,
      label: cp.label,
      reason: cp.reason,
      fileCount: cp.fileCount,
      storageKey: cp.storageKey,
      createdAt: cp.createdAt,
    };
  }

  async listCheckpoints(ownerUid: string, projectId: number): Promise<CheckpointRecord[]> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(checkpoints)
        .where(eq(checkpoints.projectId, projectId))
        .orderBy(desc(checkpoints.createdAt));
      return rows.map((cp) => ({
        id: cp.id,
        projectId: cp.projectId,
        ownerUid: cp.ownerUid,
        label: cp.label,
        reason: cp.reason,
        fileCount: cp.snapshotJson.length,
        storageKey: cp.storageKey,
        createdAt: cp.createdAt.toISOString(),
      }));
    }

    const store = await this.loadLocalStore();
    return store.checkpoints
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ snapshot: _snap, ...rest }) => rest);
  }

  async rollbackToCheckpoint(
    ownerUid: string,
    projectId: number,
    checkpointId: number
  ): Promise<{ restoredFiles: number; safetyCheckpointId: number }> {
    const project = await this.requireOwnedProject(ownerUid, projectId);

    // Create a safety checkpoint before rolling back
    const safety = await this.createCheckpoint(
      ownerUid,
      projectId,
      `Pre-rollback safety snapshot (#${checkpointId})`,
      'Automatic snapshot before rollback'
    );

    let snapshot: Array<{ path: string; content: string; language: string; sha256: string }> = [];

    if (!this.useLocalFallback) {
      const found = await db
        .select()
        .from(checkpoints)
        .where(and(eq(checkpoints.id, checkpointId), eq(checkpoints.projectId, projectId)))
        .limit(1);
      if (!found[0]) throw new Error('Checkpoint not found.');
      snapshot = found[0].snapshotJson;

      await db.delete(projectFiles).where(eq(projectFiles.projectId, projectId));
      for (const sf of snapshot) {
        await this.upsertProjectFile(ownerUid, projectId, sf.path, sf.content, `Rollback to checkpoint #${checkpointId}`);
      }
      await this.recordAudit(ownerUid, project.workspaceId, projectId, 'checkpoint.rollback', 'checkpoint', String(checkpointId), {
        restoredFiles: snapshot.length,
      });
      return { restoredFiles: snapshot.length, safetyCheckpointId: safety.id };
    }

    const store = await this.loadLocalStore();
    const found = store.checkpoints.find((c) => c.id === checkpointId && c.projectId === projectId);
    if (!found) throw new Error('Checkpoint not found.');
    snapshot = found.snapshot;

    store.files = store.files.filter((f) => f.projectId !== projectId);
    await this.saveLocalStore(store);

    for (const sf of snapshot) {
      await this.upsertProjectFile(ownerUid, projectId, sf.path, sf.content, `Rollback to checkpoint #${checkpointId}`);
    }
    return { restoredFiles: snapshot.length, safetyCheckpointId: safety.id };
  }

  async saveReviewReport(
    ownerUid: string,
    projectId: number,
    input: {
      targetPath: string;
      modelId: string;
      summary: string;
      overallStatus: 'clean' | 'warnings' | 'critical';
      findings: Array<{
        filePath: string;
        lineStart: number;
        lineEnd: number;
        severity: ReviewFindingRecord['severity'];
        category: string;
        title: string;
        description: string;
        suggestedPatch: string | null;
      }>;
    }
  ): Promise<ReviewReportRecord> {
    const project = await this.requireOwnedProject(ownerUid, projectId);
    const now = new Date().toISOString();

    if (!this.useLocalFallback) {
      const rep = await db
        .insert(reviewReports)
        .values({
          projectId,
          ownerUid,
          targetPath: input.targetPath,
          modelId: input.modelId,
          summary: input.summary,
          overallStatus: input.overallStatus,
          findingCount: input.findings.length,
        })
        .returning();

      const savedFindings: ReviewFindingRecord[] = [];
      for (const f of input.findings) {
        const ins = await db
          .insert(reviewFindings)
          .values({
            reportId: rep[0].id,
            projectId,
            filePath: f.filePath,
            lineStart: f.lineStart,
            lineEnd: f.lineEnd,
            severity: f.severity,
            category: f.category,
            title: f.title,
            description: f.description,
            suggestedPatch: f.suggestedPatch,
            status: 'open',
          })
          .returning();
        savedFindings.push({
          ...ins[0],
          severity: ins[0].severity as ReviewFindingRecord['severity'],
          status: ins[0].status as ReviewFindingRecord['status'],
          createdAt: ins[0].createdAt.toISOString(),
        });
      }

      await this.recordAudit(ownerUid, project.workspaceId, projectId, 'review.run', 'review_report', String(rep[0].id), {
        findingCount: savedFindings.length,
        overallStatus: input.overallStatus,
      });

      return {
        ...rep[0],
        overallStatus: rep[0].overallStatus as ReviewReportRecord['overallStatus'],
        findings: savedFindings,
        createdAt: rep[0].createdAt.toISOString(),
      };
    }

    const store = await this.loadLocalStore();
    const reportId = this.nextLocalId(store);
    const findings: ReviewFindingRecord[] = input.findings.map((f) => ({
      id: this.nextLocalId(store),
      reportId,
      projectId,
      filePath: f.filePath,
      lineStart: f.lineStart,
      lineEnd: f.lineEnd,
      severity: f.severity,
      category: f.category,
      title: f.title,
      description: f.description,
      suggestedPatch: f.suggestedPatch,
      status: 'open',
      createdAt: now,
    }));
    const report: ReviewReportRecord = {
      id: reportId,
      projectId,
      ownerUid,
      targetPath: input.targetPath,
      modelId: input.modelId,
      summary: input.summary,
      overallStatus: input.overallStatus,
      findingCount: findings.length,
      findings,
      createdAt: now,
    };
    store.reviews.push(report);
    await this.saveLocalStore(store);
    return report;
  }

  async listReviewReports(ownerUid: string, projectId: number): Promise<ReviewReportRecord[]> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      const reps = await db
        .select()
        .from(reviewReports)
        .where(eq(reviewReports.projectId, projectId))
        .orderBy(desc(reviewReports.createdAt))
        .limit(15);

      const allFindings = await db
        .select()
        .from(reviewFindings)
        .where(eq(reviewFindings.projectId, projectId));

      return reps.map((r) => ({
        ...r,
        overallStatus: r.overallStatus as ReviewReportRecord['overallStatus'],
        findings: allFindings
          .filter((f) => f.reportId === r.id)
          .map((f) => ({
            ...f,
            severity: f.severity as ReviewFindingRecord['severity'],
            status: f.status as ReviewFindingRecord['status'],
            createdAt: f.createdAt.toISOString(),
          })),
        createdAt: r.createdAt.toISOString(),
      }));
    }

    const store = await this.loadLocalStore();
    return store.reviews
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 15);
  }

  async updateFindingStatus(
    ownerUid: string,
    projectId: number,
    findingId: number,
    status: 'open' | 'resolved' | 'ignored'
  ): Promise<void> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      await db
        .update(reviewFindings)
        .set({ status })
        .where(and(eq(reviewFindings.id, findingId), eq(reviewFindings.projectId, projectId)));
      return;
    }

    const store = await this.loadLocalStore();
    for (const rep of store.reviews) {
      if (rep.projectId !== projectId) continue;
      const found = rep.findings.find((f) => f.id === findingId);
      if (found) found.status = status;
    }
    await this.saveLocalStore(store);
  }

  async recordBuildRun(
    ownerUid: string,
    projectId: number,
    data: { command: string; status: 'passed' | 'failed'; exitCode: number; logs: string; durationMs: number }
  ): Promise<BuildRunRecord> {
    const project = await this.requireOwnedProject(ownerUid, projectId);
    const now = new Date().toISOString();
    if (!this.useLocalFallback) {
      const inserted = await db
        .insert(buildRuns)
        .values({
          projectId,
          ownerUid,
          command: data.command,
          status: data.status,
          exitCode: data.exitCode,
          logs: data.logs,
          durationMs: data.durationMs,
          finishedAt: new Date(),
        })
        .returning();
      await this.recordAudit(ownerUid, project.workspaceId, projectId, 'build.run', 'build', String(inserted[0].id), {
        status: data.status,
        durationMs: data.durationMs,
      });
      return {
        ...inserted[0],
        status: inserted[0].status as BuildRunRecord['status'],
        createdAt: inserted[0].createdAt.toISOString(),
        finishedAt: inserted[0].finishedAt?.toISOString() ?? null,
      };
    }

    const store = await this.loadLocalStore();
    const record: BuildRunRecord = {
      id: this.nextLocalId(store),
      projectId,
      ownerUid,
      command: data.command,
      status: data.status,
      exitCode: data.exitCode,
      logs: data.logs,
      durationMs: data.durationMs,
      createdAt: now,
      finishedAt: now,
    };
    store.builds.push(record);
    await this.saveLocalStore(store);
    return record;
  }

  async listBuildRuns(ownerUid: string, projectId: number): Promise<BuildRunRecord[]> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(buildRuns)
        .where(eq(buildRuns.projectId, projectId))
        .orderBy(desc(buildRuns.createdAt))
        .limit(20);
      return rows.map((r) => ({
        ...r,
        status: r.status as BuildRunRecord['status'],
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      }));
    }
    const store = await this.loadLocalStore();
    return store.builds
      .filter((b) => b.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
  }

  async recordTestRun(
    ownerUid: string,
    projectId: number,
    data: {
      suiteName: string;
      status: 'passed' | 'failed';
      totalCount: number;
      passedCount: number;
      failedCount: number;
      logs: string;
      durationMs: number;
    }
  ): Promise<TestRunRecord> {
    const project = await this.requireOwnedProject(ownerUid, projectId);
    const now = new Date().toISOString();
    if (!this.useLocalFallback) {
      const inserted = await db
        .insert(testRuns)
        .values({
          projectId,
          ownerUid,
          suiteName: data.suiteName,
          status: data.status,
          totalCount: data.totalCount,
          passedCount: data.passedCount,
          failedCount: data.failedCount,
          logs: data.logs,
          durationMs: data.durationMs,
          finishedAt: new Date(),
        })
        .returning();
      await this.recordAudit(ownerUid, project.workspaceId, projectId, 'test.run', 'test_run', String(inserted[0].id), {
        status: data.status,
        passedCount: data.passedCount,
        totalCount: data.totalCount,
      });
      return {
        ...inserted[0],
        status: inserted[0].status as TestRunRecord['status'],
        createdAt: inserted[0].createdAt.toISOString(),
        finishedAt: inserted[0].finishedAt?.toISOString() ?? null,
      };
    }

    const store = await this.loadLocalStore();
    const record: TestRunRecord = {
      id: this.nextLocalId(store),
      projectId,
      ownerUid,
      suiteName: data.suiteName,
      status: data.status,
      totalCount: data.totalCount,
      passedCount: data.passedCount,
      failedCount: data.failedCount,
      logs: data.logs,
      durationMs: data.durationMs,
      createdAt: now,
      finishedAt: now,
    };
    store.tests.push(record);
    await this.saveLocalStore(store);
    return record;
  }

  async listTestRuns(ownerUid: string, projectId: number): Promise<TestRunRecord[]> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(testRuns)
        .where(eq(testRuns.projectId, projectId))
        .orderBy(desc(testRuns.createdAt))
        .limit(20);
      return rows.map((r) => ({
        ...r,
        status: r.status as TestRunRecord['status'],
        createdAt: r.createdAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
      }));
    }
    const store = await this.loadLocalStore();
    return store.tests
      .filter((t) => t.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
  }

  async getGitConnection(ownerUid: string, projectId: number): Promise<GitConnectionRecord> {
    await this.requireOwnedProject(ownerUid, projectId);
    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(gitConnections)
        .where(eq(gitConnections.projectId, projectId))
        .limit(1);
      if (rows[0]) {
        return {
          ...rows[0],
          lastSyncAt: rows[0].lastSyncAt?.toISOString() ?? null,
        };
      }
      const inserted = await db
        .insert(gitConnections)
        .values({
          projectId,
          ownerUid,
          provider: 'local-git',
          repoUrl: '',
          defaultBranch: 'main',
          currentBranch: 'main',
          lastCommitSha: crypto.randomBytes(8).toString('hex'),
          lastSyncAt: new Date(),
        })
        .returning();
      return {
        ...inserted[0],
        lastSyncAt: inserted[0].lastSyncAt?.toISOString() ?? null,
      };
    }

    const store = await this.loadLocalStore();
    let conn = store.git.find((g) => g.projectId === projectId);
    if (!conn) {
      conn = {
        id: this.nextLocalId(store),
        projectId,
        provider: 'local-git',
        repoUrl: '',
        defaultBranch: 'main',
        currentBranch: 'main',
        lastCommitSha: crypto.randomBytes(8).toString('hex'),
        lastSyncAt: new Date().toISOString(),
      };
      store.git.push(conn);
      await this.saveLocalStore(store);
    }
    return conn;
  }

  async commitGitSnapshot(
    ownerUid: string,
    projectId: number,
    message: string,
    branch?: string
  ): Promise<{ commitSha: string; checkpointId: number; git: GitConnectionRecord }> {
    const project = await this.requireOwnedProject(ownerUid, projectId);
    const cp = await this.createCheckpoint(ownerUid, projectId, `Commit: ${message}`, message);
    const sha = crypto.randomBytes(8).toString('hex');
    const targetBranch = branch || project.activeBranch || 'main';
    const now = new Date().toISOString();

    if (!this.useLocalFallback) {
      await db
        .update(projects)
        .set({ activeBranch: targetBranch, updatedAt: new Date() })
        .where(eq(projects.id, projectId));
      const updated = await db
        .update(gitConnections)
        .set({ currentBranch: targetBranch, lastCommitSha: sha, lastSyncAt: new Date() })
        .where(eq(gitConnections.projectId, projectId))
        .returning();
      await this.recordAudit(ownerUid, project.workspaceId, projectId, 'git.commit', 'git', sha, {
        branch: targetBranch,
        message,
      });
      return {
        commitSha: sha,
        checkpointId: cp.id,
        git: {
          ...updated[0],
          lastSyncAt: updated[0].lastSyncAt?.toISOString() ?? null,
        },
      };
    }

    const store = await this.loadLocalStore();
    const p = store.projects.find((item) => item.id === projectId);
    if (p) {
      p.activeBranch = targetBranch;
      p.updatedAt = now;
    }
    const g = await this.getGitConnection(ownerUid, projectId);
    g.currentBranch = targetBranch;
    g.lastCommitSha = sha;
    g.lastSyncAt = now;
    store.audit.push({
      id: this.nextLocalId(store),
      workspaceId: project.workspaceId,
      projectId,
      actorUid: ownerUid,
      action: 'git.commit',
      resourceType: 'git',
      resourceId: sha,
      details: { branch: targetBranch, message },
      createdAt: now,
    });
    await this.saveLocalStore(store);
    return { commitSha: sha, checkpointId: cp.id, git: g };
  }

  async listModelConfigs(ownerUid: string): Promise<ModelConfigRecord[]> {
    const { workspaceId } = await this.ensureTenantSeeded({
      uid: ownerUid,
      email: `${ownerUid}@acs.local`,
      displayName: 'Developer',
      avatarUrl: null,
      emailVerified: true,
      authProvider: 'firebase',
      isDemo: false,
    });

    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(modelConfigs)
        .where(eq(modelConfigs.workspaceId, workspaceId));
      return rows.map((r) => ({
        id: r.id,
        agentRole: r.agentRole as AgentRole,
        provider: r.provider,
        modelId: r.modelId,
        thinkingLevel: r.thinkingLevel as ThinkingLevelName,
        searchGrounding: r.searchGrounding,
        isDefault: r.isDefault,
      }));
    }

    const store = await this.loadLocalStore();
    return store.modelConfigs
      .filter((m) => m.workspaceId === workspaceId)
      .map(({ workspaceId: _ws, ...rest }) => rest);
  }

  async updateModelConfig(
    ownerUid: string,
    input: { agentRole: AgentRole; modelId: string; thinkingLevel: ThinkingLevelName; searchGrounding: boolean }
  ): Promise<ModelConfigRecord> {
    const { workspaceId } = await this.ensureTenantSeeded({
      uid: ownerUid,
      email: `${ownerUid}@acs.local`,
      displayName: 'Developer',
      avatarUrl: null,
      emailVerified: true,
      authProvider: 'firebase',
      isDemo: false,
    });

    if (!this.useLocalFallback) {
      const updated = await db
        .insert(modelConfigs)
        .values({
          workspaceId,
          ownerUid,
          agentRole: input.agentRole,
          provider: 'gemini',
          modelId: input.modelId,
          thinkingLevel: input.thinkingLevel,
          searchGrounding: input.searchGrounding,
          isDefault: false,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [modelConfigs.workspaceId, modelConfigs.agentRole],
          set: {
            modelId: input.modelId,
            thinkingLevel: input.thinkingLevel,
            searchGrounding: input.searchGrounding,
            isDefault: false,
            updatedAt: new Date(),
          },
        })
        .returning();
      await this.recordAudit(ownerUid, workspaceId, null, 'model_config.update', 'model_config', input.agentRole, input);
      return {
        id: updated[0].id,
        agentRole: updated[0].agentRole as AgentRole,
        provider: updated[0].provider,
        modelId: updated[0].modelId,
        thinkingLevel: updated[0].thinkingLevel as ThinkingLevelName,
        searchGrounding: updated[0].searchGrounding,
        isDefault: updated[0].isDefault,
      };
    }

    const store = await this.loadLocalStore();
    let cfg = store.modelConfigs.find((m) => m.workspaceId === workspaceId && m.agentRole === input.agentRole);
    if (cfg) {
      cfg.modelId = input.modelId;
      cfg.thinkingLevel = input.thinkingLevel;
      cfg.searchGrounding = input.searchGrounding;
      cfg.isDefault = false;
    } else {
      cfg = {
        id: this.nextLocalId(store),
        workspaceId,
        agentRole: input.agentRole,
        provider: 'gemini',
        modelId: input.modelId,
        thinkingLevel: input.thinkingLevel,
        searchGrounding: input.searchGrounding,
        isDefault: false,
      };
      store.modelConfigs.push(cfg);
    }
    await this.saveLocalStore(store);
    const { workspaceId: _ws, ...rest } = cfg;
    return rest;
  }

  async listPlugins(ownerUid: string): Promise<PluginRecord[]> {
    const { workspaceId } = await this.ensureTenantSeeded({
      uid: ownerUid,
      email: `${ownerUid}@acs.local`,
      displayName: 'Developer',
      avatarUrl: null,
      emailVerified: true,
      authProvider: 'firebase',
      isDemo: false,
    });

    if (!this.useLocalFallback) {
      const rows = await db.select().from(plugins).where(eq(plugins.workspaceId, workspaceId));
      return rows.map((p) => ({
        id: p.id,
        manifestId: p.manifestId,
        name: p.name,
        version: p.version,
        description: p.description,
        permissions: p.permissionsJson,
        enabled: p.enabled,
      }));
    }

    const store = await this.loadLocalStore();
    return store.plugins
      .filter((p) => p.workspaceId === workspaceId)
      .map(({ workspaceId: _ws, ...rest }) => rest);
  }

  async togglePlugin(ownerUid: string, manifestId: string, enabled: boolean): Promise<PluginRecord> {
    const { workspaceId } = await this.ensureTenantSeeded({
      uid: ownerUid,
      email: `${ownerUid}@acs.local`,
      displayName: 'Developer',
      avatarUrl: null,
      emailVerified: true,
      authProvider: 'firebase',
      isDemo: false,
    });

    if (!this.useLocalFallback) {
      const updated = await db
        .update(plugins)
        .set({ enabled })
        .where(and(eq(plugins.workspaceId, workspaceId), eq(plugins.manifestId, manifestId)))
        .returning();
      if (!updated[0]) throw new Error('Plugin manifest not found.');
      await this.recordAudit(ownerUid, workspaceId, null, 'plugin.toggle', 'plugin', manifestId, { enabled });
      return {
        id: updated[0].id,
        manifestId: updated[0].manifestId,
        name: updated[0].name,
        version: updated[0].version,
        description: updated[0].description,
        permissions: updated[0].permissionsJson,
        enabled: updated[0].enabled,
      };
    }

    const store = await this.loadLocalStore();
    const plg = store.plugins.find((p) => p.workspaceId === workspaceId && p.manifestId === manifestId);
    if (!plg) throw new Error('Plugin manifest not found.');
    plg.enabled = enabled;
    await this.saveLocalStore(store);
    const { workspaceId: _ws, ...rest } = plg;
    return rest;
  }

  async recordUsageAndRun(input: {
    ownerUid: string;
    workspaceId: number;
    projectId: number;
    taskId?: number | null;
    agentRole: AgentRole;
    modelId: string;
    thinkingLevel: ThinkingLevelName;
    groundingUsed: boolean;
    inputSummary: string;
    outputSummary: string;
    durationMs: number;
    promptTokens: number;
    outputTokens: number;
    errorMessage?: string;
  }) {
    const now = new Date().toISOString();
    if (!this.useLocalFallback) {
      await db.insert(agentRuns).values({
        taskId: input.taskId ?? null,
        projectId: input.projectId,
        ownerUid: input.ownerUid,
        agentRole: input.agentRole,
        modelId: input.modelId,
        thinkingLevel: input.thinkingLevel,
        groundingUsed: input.groundingUsed,
        status: input.errorMessage ? 'failed' : 'completed',
        inputSummary: input.inputSummary.slice(0, 300),
        outputSummary: input.outputSummary.slice(0, 300),
        durationMs: input.durationMs,
        promptTokens: input.promptTokens,
        outputTokens: input.outputTokens,
        errorMessage: input.errorMessage ?? null,
      });

      await db.insert(usageRecords).values({
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        ownerUid: input.ownerUid,
        provider: 'gemini',
        modelId: input.modelId,
        agentRole: input.agentRole,
        promptTokens: input.promptTokens,
        outputTokens: input.outputTokens,
        latencyMs: input.durationMs,
      });
      return;
    }

    const store = await this.loadLocalStore();
    store.usage.push({
      id: this.nextLocalId(store),
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      ownerUid: input.ownerUid,
      provider: 'gemini',
      modelId: input.modelId,
      agentRole: input.agentRole,
      promptTokens: input.promptTokens,
      outputTokens: input.outputTokens,
      latencyMs: input.durationMs,
      createdAt: now,
    });
    await this.saveLocalStore(store);
  }

  async listUsage(ownerUid: string): Promise<UsageRecordItem[]> {
    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(usageRecords)
        .where(eq(usageRecords.ownerUid, ownerUid))
        .orderBy(desc(usageRecords.createdAt))
        .limit(100);
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    }
    const store = await this.loadLocalStore();
    return store.usage
      .filter((u) => u.ownerUid === ownerUid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)
      .map(({ workspaceId: _w, ownerUid: _o, ...rest }) => rest);
  }

  async listAuditLogs(ownerUid: string): Promise<AuditLogItem[]> {
    if (!this.useLocalFallback) {
      const rows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.actorUid, ownerUid))
        .orderBy(desc(auditLogs.createdAt))
        .limit(100);
      return rows.map((r) => ({
        id: r.id,
        projectId: r.projectId,
        actorUid: r.actorUid,
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        details: r.detailsJson,
        createdAt: r.createdAt.toISOString(),
      }));
    }
    const store = await this.loadLocalStore();
    return store.audit
      .filter((a) => a.actorUid === ownerUid)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100)
      .map(({ workspaceId: _w, ...rest }) => rest);
  }

  async recordAudit(
    actorUid: string,
    workspaceId: number,
    projectId: number | null,
    action: string,
    resourceType: string,
    resourceId: string,
    details: Record<string, unknown>
  ) {
    if (!this.useLocalFallback) {
      try {
        await db.insert(auditLogs).values({
          workspaceId,
          projectId,
          actorUid,
          action,
          resourceType,
          resourceId,
          detailsJson: details,
        });
        return;
      } catch (err) {
        if (!isConnectionError(err)) throw err;
        this.useLocalFallback = true;
      }
    }

    const store = await this.loadLocalStore();
    store.audit.push({
      id: this.nextLocalId(store),
      workspaceId,
      projectId,
      actorUid,
      action,
      resourceType,
      resourceId,
      details,
      createdAt: new Date().toISOString(),
    });
    await this.saveLocalStore(store);
  }

  async syncAuthenticatedUser(principal: AuthenticatedPrincipal): Promise<{
    uid: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    authProvider: string;
    workspaceId: number;
    projectCount: number;
  }> {
    const { workspaceId, projects: userProjects } = await this.ensureTenantSeeded(principal);

    if (!this.useLocalFallback) {
      try {
        await db
          .update(users)
          .set({
            email: principal.email,
            displayName: principal.displayName,
            avatarUrl: principal.avatarUrl,
            updatedAt: new Date(),
          })
          .where(eq(users.uid, principal.uid));
      } catch (err) {
        if (!isConnectionError(err)) throw err;
        this.useLocalFallback = true;
      }
    }

    if (this.useLocalFallback) {
      const store = await this.loadLocalStore();
      const user = store.users.find((u) => u.uid === principal.uid);
      if (user) {
        user.email = principal.email;
        user.displayName = principal.displayName;
        user.avatarUrl = principal.avatarUrl;
        await this.saveLocalStore(store);
      }
    }

    await this.recordAudit(
      principal.uid,
      workspaceId,
      null,
      'auth.login',
      'user',
      principal.uid,
      {
        provider: principal.authProvider,
        emailVerified: principal.emailVerified,
      }
    );

    return {
      uid: principal.uid,
      email: principal.email,
      displayName: principal.displayName,
      avatarUrl: principal.avatarUrl,
      emailVerified: principal.emailVerified,
      authProvider: principal.authProvider,
      workspaceId,
      projectCount: userProjects.length,
    };
  }

  async updateUserProfile(
    principal: AuthenticatedPrincipal,
    displayName: string
  ): Promise<{
    uid: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    authProvider: string;
  }> {
    const cleanName = displayName.trim();
    const { workspaceId } = await this.ensureTenantSeeded(principal);

    if (!this.useLocalFallback) {
      try {
        await db
          .update(users)
          .set({ displayName: cleanName, updatedAt: new Date() })
          .where(eq(users.uid, principal.uid));
      } catch (err) {
        if (!isConnectionError(err)) throw err;
        this.useLocalFallback = true;
      }
    }

    if (this.useLocalFallback) {
      const store = await this.loadLocalStore();
      const user = store.users.find((u) => u.uid === principal.uid);
      if (user) {
        user.displayName = cleanName;
        await this.saveLocalStore(store);
      }
    }

    await this.recordAudit(
      principal.uid,
      workspaceId,
      null,
      'auth.profile_update',
      'user',
      principal.uid,
      { displayName: cleanName }
    );

    return {
      uid: principal.uid,
      email: principal.email,
      displayName: cleanName,
      avatarUrl: principal.avatarUrl,
      emailVerified: principal.emailVerified,
      authProvider: principal.authProvider,
    };
  }

  async getUserProfileSummary(principal: AuthenticatedPrincipal): Promise<{
    uid: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    emailVerified: boolean;
    authProvider: string;
    workspaceId: number;
    projectCount: number;
  }> {
    const { workspaceId, projects: userProjects } = await this.ensureTenantSeeded(principal);
    let storedName = principal.displayName;
    if (!this.useLocalFallback) {
      try {
        const rows = await db.select().from(users).where(eq(users.uid, principal.uid)).limit(1);
        if (rows[0]?.displayName) storedName = rows[0].displayName;
      } catch (err) {
        if (!isConnectionError(err)) throw err;
        this.useLocalFallback = true;
      }
    }

    if (this.useLocalFallback) {
      const store = await this.loadLocalStore();
      const user = store.users.find((u) => u.uid === principal.uid);
      if (user?.displayName) storedName = user.displayName;
    }

    return {
      uid: principal.uid,
      email: principal.email,
      displayName: storedName,
      avatarUrl: principal.avatarUrl,
      emailVerified: principal.emailVerified,
      authProvider: principal.authProvider,
      workspaceId,
      projectCount: userProjects.length,
    };
  }
}

export const studioRepo = new StudioRepository();
