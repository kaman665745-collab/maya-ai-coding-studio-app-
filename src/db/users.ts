import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { modelConfigs, plugins, users, workspaces } from './schema.ts';

export async function getOrCreateUserAndWorkspace(
  uid: string,
  email: string,
  displayName?: string,
  avatarUrl?: string | null
) {
  try {
    const upsertedUsers = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName || email.split('@')[0] || 'Developer',
        avatarUrl: avatarUrl ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName || email.split('@')[0] || 'Developer',
          avatarUrl: avatarUrl ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    const user = upsertedUsers[0];

    const existingWorkspaces = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerUid, uid))
      .limit(1);

    let workspace = existingWorkspaces[0];

    if (!workspace) {
      const inserted = await db
        .insert(workspaces)
        .values({
          ownerUid: uid,
          name: 'Primary Studio Workspace',
          slug: `ws-${uid.slice(0, 8).toLowerCase()}`,
          plan: 'standard',
          featureFlagsJson: {
            sandboxIsolation: true,
            searchGrounding: true,
            workspaceSync: true,
            autoCheckpointOnApply: true,
            strictPathValidation: true,
          },
        })
        .returning();
      workspace = inserted[0];

      // Seed default model configurations per agent role (free-tier compatible defaults)
      const defaultModels = [
        { agentRole: 'planner', modelId: 'gemini-4-hydrogen', thinkingLevel: 'HIGH', searchGrounding: true },
        { agentRole: 'coder', modelId: 'gemini-4-hydrogen', thinkingLevel: 'MEDIUM', searchGrounding: false },
        { agentRole: 'reviewer', modelId: 'gemini-4-hydrogen', thinkingLevel: 'HIGH', searchGrounding: false },
        { agentRole: 'tester', modelId: 'gemini-3.1-flash-lite', thinkingLevel: 'LOW', searchGrounding: false },
        { agentRole: 'debugger', modelId: 'gemini-4-hydrogen', thinkingLevel: 'HIGH', searchGrounding: true },
        { agentRole: 'docs', modelId: 'gemini-3.1-flash-lite', thinkingLevel: 'LOW', searchGrounding: true },
      ];

      for (const cfg of defaultModels) {
        await db
          .insert(modelConfigs)
          .values({
            workspaceId: workspace.id,
            ownerUid: uid,
            agentRole: cfg.agentRole,
            provider: 'gemini',
            modelId: cfg.modelId,
            thinkingLevel: cfg.thinkingLevel,
            searchGrounding: cfg.searchGrounding,
            isDefault: true,
          })
          .onConflictDoNothing();
      }

      // Seed built-in studio plugins
      const defaultPlugins = [
        {
          manifestId: 'acs.security-scanner',
          name: 'Static Security & Secret Redactor',
          version: '1.2.0',
          description: 'Scans proposed patches and workspace files for hardcoded credentials, path traversal, and unsafe eval patterns.',
          permissionsJson: ['read:files', 'write:findings'],
          enabled: true,
        },
        {
          manifestId: 'acs.workspace-exporter',
          name: 'Google Workspace Sync Adapter',
          version: '1.0.0',
          description: 'Exports build telemetry to Google Sheets, sprint summaries to Slides, and task plans to Google Tasks.',
          permissionsJson: ['read:project', 'workspace:oauth'],
          enabled: true,
        },
        {
          manifestId: 'acs.cross-platform-packager',
          name: 'Tauri 2 & Capacitor Manifest Checker',
          version: '1.1.0',
          description: 'Validates responsive layouts and native bridge compatibility for Web, Desktop, and Android targets.',
          permissionsJson: ['read:files', 'read:builds'],
          enabled: true,
        },
      ];

      for (const plg of defaultPlugins) {
        await db
          .insert(plugins)
          .values({
            workspaceId: workspace.id,
            ownerUid: uid,
            manifestId: plg.manifestId,
            name: plg.name,
            version: plg.version,
            description: plg.description,
            permissionsJson: plg.permissionsJson,
            enabled: plg.enabled,
            configJson: {},
          })
          .onConflictDoNothing();
      }
    }

    return { user, workspace };
  } catch (error) {
    const msg =
      error instanceof Error
        ? `${error.message} ${(error as { cause?: Error }).cause?.message || ''}`
        : String(error);
    if (!msg.includes('ENOENT') && !msg.includes('ECONNREFUSED')) {
      console.error('Database error in getOrCreateUserAndWorkspace:', error);
    }
    throw new Error('Failed to synchronize user and workspace.', { cause: error });
  }
}
