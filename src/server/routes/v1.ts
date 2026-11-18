import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { resolveModelForRole } from '../../domain/agents.ts';
import {
  applyChangesToSnapshot,
  inferLanguageFromPath,
  redactSecrets,
  sanitizeProjectPath,
  validateAndPrepareProposals,
} from '../../domain/diff.ts';
import type { AgentRole, ThinkingLevelName } from '../../domain/types.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { authenticateRequest, type AuthenticatedPrincipal } from '../middleware/auth.ts';
import { studioRepo } from '../repositories/studioRepo.ts';
import { studioEventBus, type StudioEventPayload } from '../services/eventBus.ts';
import { aiProvider } from '../services/gemini.ts';
import { previewManager } from '../services/previewManager.ts';
import { sandboxRunner } from '../services/sandboxRunner.ts';
import {
  createSessionToken,
  serializeClearSessionCookie,
  serializeSessionCookie,
} from '../services/sessionCookie.ts';

const AuthSessionSchema = z.object({
  idToken: z.string().min(20),
  rememberMe: z.boolean().default(true),
  fullName: z.string().trim().min(2).max(80).optional(),
});

const ProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
});

const CreateProjectSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(400).optional(),
  template: z.enum(['react-vite-ts', 'node-api-ts', 'blank-web']).default('react-vite-ts'),
});

const UpsertFileSchema = z.object({
  path: z.string().trim().min(1).max(240),
  content: z.string().max(512 * 1024),
  commitMessage: z.string().trim().max(160).optional(),
});

const AiChatSchema = z.object({
  prompt: z.string().trim().min(1).max(8000),
  agentRole: z.enum(['planner', 'coder', 'reviewer', 'tester', 'debugger', 'docs']).default('coder'),
  activeFilePath: z.string().optional(),
  searchGroundingOverride: z.boolean().optional(),
  thinkingLevelOverride: z.enum(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'XHIGH']).optional(),
});

const QuickExplainSchema = z.object({
  filePath: z.string().trim().min(1),
  snippet: z.string().trim().min(1).max(12000),
});

const ReviewRunSchema = z.object({
  targetPath: z.string().trim().optional(),
});

const FindingStatusSchema = z.object({
  status: z.enum(['open', 'resolved', 'ignored']),
});

const CheckpointCreateSchema = z.object({
  label: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(240).optional(),
});

const GitCommitSchema = z.object({
  message: z.string().trim().min(1).max(200),
  branch: z.string().trim().min(1).max(80).optional(),
});

const SandboxExecSchema = z.object({
  command: z.string().trim().min(1).max(200),
});

const ModelConfigUpdateSchema = z.object({
  agentRole: z.enum(['planner', 'coder', 'reviewer', 'tester', 'debugger', 'docs']),
  modelId: z.string().trim().min(3).max(80),
  thinkingLevel: z.enum(['MINIMAL', 'LOW', 'MEDIUM', 'HIGH', 'XHIGH']),
  searchGrounding: z.boolean(),
});

const PluginToggleSchema = z.object({
  enabled: z.boolean(),
});

function parseIdParam(raw: unknown): number {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error('Invalid numeric resource identifier.');
  }
  return num;
}

function sendError(reply: FastifyReply, err: unknown, fallbackStatus = 400) {
  const message = err instanceof Error ? redactSecrets(err.message) : 'Unexpected error';
  const status =
    message.includes('not found') || message.includes('access denied')
      ? 404
      : message.includes('Unauthorized')
        ? 401
        : fallbackStatus;
  return reply.code(status).send({
    error: status === 404 ? 'Not Found' : 'Request Error',
    message,
  });
}

export async function registerV1Routes(app: FastifyInstance) {
  // Public health endpoint
  app.get('/health', async () => ({
    status: 'ok',
    service: 'advanced-coding-studio',
    version: 'v1',
    timestamp: new Date().toISOString(),
  }));

  // Public sandbox-bundled preview asset route
  app.get('/preview-asset/:sessionId/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as { sessionId: string };
    const asset = previewManager.getSessionAsset(params.sessionId);
    if (!asset) {
      return reply.code(404).type('text/html').send('<h3>Preview session expired or stopped.</h3>');
    }
    return reply.code(200).type('text/html; charset=utf-8').send(asset.html);
  });

  // Exchange verified Firebase ID Token for signed HttpOnly session cookie + synced user record
  app.post('/auth/session', async (request, reply) => {
    try {
      const body = AuthSessionSchema.parse(request.body);
      const decoded = await adminAuth.verifyIdToken(body.idToken);
      const providerRaw =
        typeof (decoded.firebase as { sign_in_provider?: unknown } | undefined)?.sign_in_provider === 'string'
          ? String((decoded.firebase as { sign_in_provider: string }).sign_in_provider)
          : 'firebase';

      const principal: AuthenticatedPrincipal = {
        uid: decoded.uid,
        email: decoded.email || `${decoded.uid}@users.acs.local`,
        displayName:
          body.fullName || decoded.name || decoded.email?.split('@')[0] || 'Developer',
        avatarUrl: decoded.picture || null,
        emailVerified: Boolean(decoded.email_verified),
        authProvider: providerRaw,
        isDemo: false,
      };

      const profile = await studioRepo.syncAuthenticatedUser(principal);
      const sessionToken = createSessionToken(principal);
      const isSecure =
        request.protocol === 'https' ||
        request.headers['x-forwarded-proto'] === 'https';

      reply.header(
        'Set-Cookie',
        serializeSessionCookie(sessionToken, {
          rememberMe: body.rememberMe,
          isSecure,
        })
      );

      return { user: profile };
    } catch (err) {
      return reply.code(401).send({
        error: 'Unauthorized',
        message:
          err instanceof Error
            ? err.message
            : 'Invalid Firebase ID token. Authentication failed.',
      });
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    const isSecure =
      request.protocol === 'https' ||
      request.headers['x-forwarded-proto'] === 'https';
    reply.header('Set-Cookie', serializeClearSessionCookie(isSecure));
    return { loggedOut: true };
  });

  // Protected /api/v1 routes
  app.register(async (authed) => {
    authed.addHook('preHandler', authenticateRequest);

    authed.get('/auth/me', async (request, reply) => {
      try {
        const profile = await studioRepo.getUserProfileSummary(request.principal!);
        return { user: profile };
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    authed.patch('/auth/profile', async (request, reply) => {
      try {
        const body = ProfileUpdateSchema.parse(request.body);
        const updated = await studioRepo.updateUserProfile(request.principal!, body.displayName);
        const nextPrincipal: AuthenticatedPrincipal = {
          ...request.principal!,
          displayName: updated.displayName,
        };
        const isSecure =
          request.protocol === 'https' ||
          request.headers['x-forwarded-proto'] === 'https';
        reply.header(
          'Set-Cookie',
          serializeSessionCookie(createSessionToken(nextPrincipal), {
            rememberMe: true,
            isSecure,
          })
        );
        return { user: updated };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.get('/session', async (request, reply) => {
      try {
        const principal = request.principal!;
        const seeded = await studioRepo.ensureTenantSeeded(principal);
        const profile = await studioRepo.getUserProfileSummary(principal);
        return {
          user: profile,
          workspaceId: seeded.workspaceId,
          projects: seeded.projects,
        };
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    // SSE Event Stream
    authed.get('/events/stream', async (request, reply) => {
      const principal = request.principal!;
      reply.hijack();

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      const sendEvent = (payload: StudioEventPayload) => {
        reply.raw.write(`event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      const listener = (payload: StudioEventPayload) => sendEvent(payload);
      studioEventBus.on(`tenant:${principal.uid}`, listener);

      reply.raw.write(
        `event: connected\ndata: ${JSON.stringify({ uid: principal.uid, timestamp: new Date().toISOString() })}\n\n`
      );

      const keepAlive = setInterval(() => {
        reply.raw.write(': keepalive\n\n');
      }, 20000);

      request.raw.on('close', () => {
        clearInterval(keepAlive);
        studioEventBus.off(`tenant:${principal.uid}`, listener);
      });
    });

    // Projects CRUD
    authed.get('/projects', async (request, reply) => {
      try {
        const seeded = await studioRepo.ensureTenantSeeded(request.principal!);
        return { items: seeded.projects, total: seeded.projects.length };
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    authed.post('/projects', async (request, reply) => {
      try {
        const body = CreateProjectSchema.parse(request.body);
        const created = await studioRepo.createProject(request.principal!, body);
        return reply.code(201).send(created);
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.delete('/projects/:projectId', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        await studioRepo.deleteProject(request.principal!.uid, projectId);
        return { deleted: true, projectId };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    // Project Files & Versions
    authed.get('/projects/:projectId/files', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const items = await studioRepo.listProjectFiles(request.principal!.uid, projectId);
        return { items, total: items.length };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.put('/projects/:projectId/files', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const body = UpsertFileSchema.parse(request.body);
        const saved = await studioRepo.upsertProjectFile(
          request.principal!.uid,
          projectId,
          body.path,
          body.content,
          body.commitMessage || 'Editor save'
        );
        return saved;
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.delete('/projects/:projectId/files', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const filePath = String((request.query as { path?: string }).path || '');
        if (!filePath) throw new Error('Query parameter "path" is required.');
        await studioRepo.deleteProjectFile(request.principal!.uid, projectId, filePath);
        return { deleted: true, path: filePath };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.get('/projects/:projectId/files/versions', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const items = await studioRepo.listFileVersions(request.principal!.uid, projectId);
        return { items };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    // Conversations & Multi-Role Gemini AI Chat
    authed.get('/projects/:projectId/conversations', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const data = await studioRepo.getOrCreateConversation(request.principal!.uid, projectId);
        const tasks = await studioRepo.listAgentTasks(request.principal!.uid, projectId);
        return { ...data, tasks };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/ai/chat', async (request, reply) => {
      const principal = request.principal!;
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const body = AiChatSchema.parse(request.body);
        const project = await studioRepo.requireOwnedProject(principal.uid, projectId);
        const files = await studioRepo.listProjectFiles(principal.uid, projectId);
        const conv = await studioRepo.getOrCreateConversation(principal.uid, projectId);
        const configs = await studioRepo.listModelConfigs(principal.uid);

        const resolved = resolveModelForRole(body.agentRole as AgentRole, configs);
        const modelId = resolved.modelId;
        const thinkingLevel: ThinkingLevelName = body.thinkingLevelOverride || resolved.thinkingLevel;
        const searchGrounding =
          body.searchGroundingOverride !== undefined
            ? body.searchGroundingOverride
            : resolved.searchGrounding;

        studioEventBus.emitStudioEvent({
          ownerUid: principal.uid,
          projectId,
          type: 'agent:status',
          message: `Running ${body.agentRole} agent with ${modelId} (${thinkingLevel} thinking)...`,
          data: { role: body.agentRole, modelId, thinkingLevel, searchGrounding },
        });

        await studioRepo.appendMessage({
          conversationId: conv.conversationId,
          projectId,
          role: 'user',
          agentRole: body.agentRole,
          modelId,
          content: body.prompt,
        });

        const aiResult = await aiProvider.runAgentTurn({
          agentRole: body.agentRole,
          modelId,
          thinkingLevel,
          searchGrounding,
          userPrompt: body.prompt,
          activeFilePath: body.activeFilePath,
          files: files.map((f) => ({ path: f.path, language: f.language, content: f.content })),
          history: conv.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        });

        // Build validated Edit Proposal if AI suggested changes (NEVER write directly to projectFiles)
        let proposalTask = null;
        if (aiResult.proposedChanges.length > 0 || aiResult.planSteps.length > 0) {
          const fileMap: Record<string, { content: string; language: string }> = {};
          for (const f of files) {
            fileMap[f.path] = { content: f.content, language: f.language };
          }

          const preparedChanges =
            aiResult.proposedChanges.length > 0
              ? validateAndPrepareProposals(aiResult.proposedChanges, fileMap)
              : [];

          proposalTask = await studioRepo.createAgentTask({
            projectId,
            conversationId: conv.conversationId,
            ownerUid: principal.uid,
            agentRole: body.agentRole,
            title:
              preparedChanges.length > 0
                ? `${body.agentRole.toUpperCase()} Edit Proposal (${preparedChanges.length} file${preparedChanges.length > 1 ? 's' : ''})`
                : `${body.agentRole.toUpperCase()} Execution Plan`,
            description: body.prompt.slice(0, 200),
            status: preparedChanges.length > 0 ? 'awaiting_approval' : 'planned',
            planSteps: aiResult.planSteps,
            changes: preparedChanges,
          });

          studioEventBus.emitStudioEvent({
            ownerUid: principal.uid,
            projectId,
            type: 'proposal:created',
            message: proposalTask.title,
            data: { taskId: proposalTask.id, changeCount: preparedChanges.length },
          });
        }

        const assistantMessage = await studioRepo.appendMessage({
          conversationId: conv.conversationId,
          projectId,
          role: 'assistant',
          agentRole: body.agentRole,
          modelId: aiResult.modelId,
          content: aiResult.replyText,
          citations: aiResult.citations,
          proposalTaskId: proposalTask?.id ?? null,
          thinkingSummary: aiResult.thinkingSummary,
        });

        await studioRepo.recordUsageAndRun({
          ownerUid: principal.uid,
          workspaceId: project.workspaceId,
          projectId,
          taskId: proposalTask?.id ?? null,
          agentRole: body.agentRole,
          modelId: aiResult.modelId,
          thinkingLevel,
          groundingUsed: searchGrounding,
          inputSummary: body.prompt,
          outputSummary: aiResult.replyText,
          durationMs: aiResult.latencyMs,
          promptTokens: aiResult.promptTokens,
          outputTokens: aiResult.outputTokens,
        });

        return {
          assistantMessage,
          proposalTask,
        };
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    // Low-latency inline code explain via gemini-3.1-flash-lite
    authed.post('/projects/:projectId/ai/quick-explain', async (request, reply) => {
      const principal = request.principal!;
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const body = QuickExplainSchema.parse(request.body);
        const project = await studioRepo.requireOwnedProject(principal.uid, projectId);
        const safePath = sanitizeProjectPath(body.filePath);

        const res = await aiProvider.runQuickExplain('gemini-3.1-flash-lite', safePath, body.snippet);

        await studioRepo.recordUsageAndRun({
          ownerUid: principal.uid,
          workspaceId: project.workspaceId,
          projectId,
          agentRole: 'docs',
          modelId: 'gemini-3.1-flash-lite',
          thinkingLevel: 'LOW',
          groundingUsed: false,
          inputSummary: `Quick explain ${safePath}`,
          outputSummary: res.explanation,
          durationMs: res.latencyMs,
          promptTokens: res.promptTokens,
          outputTokens: res.outputTokens,
        });

        return res;
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    // Edit Proposals, Approval, Checkpoints & Rollback
    authed.get('/projects/:projectId/proposals', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const items = await studioRepo.listAgentTasks(request.principal!.uid, projectId);
        return { items };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/proposals/:taskId/approve', async (request, reply) => {
      const principal = request.principal!;
      try {
        const params = request.params as { projectId: string; taskId: string };
        const projectId = parseIdParam(params.projectId);
        const taskId = parseIdParam(params.taskId);

        const project = await studioRepo.requireOwnedProject(principal.uid, projectId);
        const tasks = await studioRepo.listAgentTasks(principal.uid, projectId);
        const task = tasks.find((t) => t.id === taskId);
        if (!task) throw new Error('Proposal task not found.');
        if (task.status !== 'awaiting_approval') {
          throw new Error(`Proposal #${taskId} is already in "${task.status}" state.`);
        }

        // 1. Create automatic safety checkpoint BEFORE applying any change
        const checkpoint = await studioRepo.createCheckpoint(
          principal.uid,
          projectId,
          `Pre-apply #${taskId}: ${task.title.slice(0, 48)}`,
          `Automatic checkpoint before approving AI proposal #${taskId}`
        );

        studioEventBus.emitStudioEvent({
          ownerUid: principal.uid,
          projectId,
          type: 'checkpoint:created',
          message: checkpoint.label,
          data: { checkpointId: checkpoint.id },
        });

        // 2. Apply changes to an isolated virtual snapshot & run sandbox build/test verification
        const currentFiles = await studioRepo.listProjectFiles(principal.uid, projectId);
        const snapshotMap: Record<string, { content: string; language: string }> = {};
        for (const f of currentFiles) {
          snapshotMap[f.path] = { content: f.content, language: f.language };
        }

        const nextSnapshot = applyChangesToSnapshot(snapshotMap, task.changes);
        const sandboxFiles = Object.entries(nextSnapshot).map(([p, v]) => ({
          path: p,
          content: v.content,
        }));

        const buildCheck = await sandboxRunner.runBuildCheck(sandboxFiles);
        const testCheck = await sandboxRunner.runTests(sandboxFiles);

        // 3. Persist changes to project_files
        for (const change of task.changes) {
          if (change.action === 'delete') {
            await studioRepo.deleteProjectFile(principal.uid, projectId, change.path);
          } else {
            await studioRepo.upsertProjectFile(
              principal.uid,
              projectId,
              change.path,
              change.proposedContent,
              `Approved proposal #${taskId}: ${change.rationale.slice(0, 80)}`
            );
          }
        }

        const verificationSummary = `Build: ${buildCheck.status.toUpperCase()} (${buildCheck.durationMs}ms) · Tests: ${testCheck.summary.passedTests ?? 0}/${testCheck.summary.totalTests ?? 0} passed`;

        await studioRepo.recordBuildRun(principal.uid, projectId, {
          command: 'esbuild (post-proposal verification)',
          status: buildCheck.status,
          exitCode: buildCheck.exitCode,
          logs: buildCheck.logs,
          durationMs: buildCheck.durationMs,
        });

        const updatedTask = await studioRepo.updateAgentTaskStatus(
          principal.uid,
          projectId,
          taskId,
          'applied',
          checkpoint.id,
          verificationSummary
        );

        await studioRepo.recordAudit(
          principal.uid,
          project.workspaceId,
          projectId,
          'proposal.approve',
          'agent_task',
          String(taskId),
          { checkpointId: checkpoint.id, verificationSummary }
        );

        studioEventBus.emitStudioEvent({
          ownerUid: principal.uid,
          projectId,
          type: 'proposal:updated',
          message: `Proposal #${taskId} applied (${verificationSummary})`,
          data: { taskId, status: 'applied', checkpointId: checkpoint.id },
        });

        return {
          task: updatedTask,
          checkpoint,
          buildCheck,
          testCheck,
        };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/proposals/:taskId/reject', async (request, reply) => {
      try {
        const params = request.params as { projectId: string; taskId: string };
        const projectId = parseIdParam(params.projectId);
        const taskId = parseIdParam(params.taskId);
        const updated = await studioRepo.updateAgentTaskStatus(
          request.principal!.uid,
          projectId,
          taskId,
          'rejected'
        );
        return { task: updated };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    // Checkpoints & Rollback
    authed.get('/projects/:projectId/checkpoints', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const items = await studioRepo.listCheckpoints(request.principal!.uid, projectId);
        return { items };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/checkpoints', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const body = CheckpointCreateSchema.parse(request.body);
        const cp = await studioRepo.createCheckpoint(
          request.principal!.uid,
          projectId,
          body.label,
          body.reason || 'Manual checkpoint'
        );
        return reply.code(201).send(cp);
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/checkpoints/:checkpointId/rollback', async (request, reply) => {
      try {
        const params = request.params as { projectId: string; checkpointId: string };
        const projectId = parseIdParam(params.projectId);
        const checkpointId = parseIdParam(params.checkpointId);
        const res = await studioRepo.rollbackToCheckpoint(
          request.principal!.uid,
          projectId,
          checkpointId
        );
        return res;
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    // Live Code Review
    authed.get('/projects/:projectId/reviews', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const items = await studioRepo.listReviewReports(request.principal!.uid, projectId);
        return { items };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/reviews/run', async (request, reply) => {
      const principal = request.principal!;
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const body = ReviewRunSchema.parse(request.body || {});
        const project = await studioRepo.requireOwnedProject(principal.uid, projectId);
        const files = await studioRepo.listProjectFiles(principal.uid, projectId);
        const configs = await studioRepo.listModelConfigs(principal.uid);
        const resolved = resolveModelForRole('reviewer', configs);

        const reviewOutput = await aiProvider.runCodeReview(
          resolved.modelId,
          resolved.thinkingLevel,
          files.map((f) => ({ path: f.path, language: f.language, content: f.content })),
          body.targetPath
        );

        const report = await studioRepo.saveReviewReport(principal.uid, projectId, {
          targetPath: body.targetPath || '*',
          modelId: resolved.modelId,
          summary: reviewOutput.summary,
          overallStatus: reviewOutput.overallStatus,
          findings: reviewOutput.findings,
        });

        await studioRepo.recordUsageAndRun({
          ownerUid: principal.uid,
          workspaceId: project.workspaceId,
          projectId,
          agentRole: 'reviewer',
          modelId: resolved.modelId,
          thinkingLevel: resolved.thinkingLevel,
          groundingUsed: false,
          inputSummary: `Code review (${body.targetPath || 'all files'})`,
          outputSummary: reviewOutput.summary,
          durationMs: reviewOutput.latencyMs,
          promptTokens: reviewOutput.promptTokens,
          outputTokens: reviewOutput.outputTokens,
        });

        studioEventBus.emitStudioEvent({
          ownerUid: principal.uid,
          projectId,
          type: 'review:finished',
          message: `Code review complete: ${report.findingCount} finding(s)`,
          data: { reportId: report.id, overallStatus: report.overallStatus },
        });

        return report;
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    authed.patch('/projects/:projectId/reviews/findings/:findingId', async (request, reply) => {
      try {
        const params = request.params as { projectId: string; findingId: string };
        const projectId = parseIdParam(params.projectId);
        const findingId = parseIdParam(params.findingId);
        const body = FindingStatusSchema.parse(request.body);
        await studioRepo.updateFindingStatus(request.principal!.uid, projectId, findingId, body.status);
        return { updated: true, findingId, status: body.status };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    // Builds, Tests & Sandbox Exec
    authed.get('/projects/:projectId/builds', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const items = await studioRepo.listBuildRuns(request.principal!.uid, projectId);
        return { items };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/builds/run', async (request, reply) => {
      const principal = request.principal!;
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const files = await studioRepo.listProjectFiles(principal.uid, projectId);

        const result = await sandboxRunner.runBuildCheck(
          files.map((f) => ({ path: f.path, content: f.content })),
          undefined,
          (line) => {
            studioEventBus.emitStudioEvent({
              ownerUid: principal.uid,
              projectId,
              type: 'build:log',
              message: line,
            });
          }
        );

        const saved = await studioRepo.recordBuildRun(principal.uid, projectId, {
          command: 'esbuild --bundle',
          status: result.status,
          exitCode: result.exitCode,
          logs: result.logs,
          durationMs: result.durationMs,
        });

        studioEventBus.emitStudioEvent({
          ownerUid: principal.uid,
          projectId,
          type: 'build:finished',
          message: `Build ${saved.status} (${saved.durationMs}ms)`,
          data: { buildId: saved.id, status: saved.status },
        });

        return saved;
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    authed.get('/projects/:projectId/tests', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const items = await studioRepo.listTestRuns(request.principal!.uid, projectId);
        return { items };
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/tests/run', async (request, reply) => {
      const principal = request.principal!;
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const files = await studioRepo.listProjectFiles(principal.uid, projectId);

        const result = await sandboxRunner.runTests(
          files.map((f) => ({ path: f.path, content: f.content }))
        );

        const saved = await studioRepo.recordTestRun(principal.uid, projectId, {
          suiteName: 'project-unit-tests',
          status: result.status,
          totalCount: result.summary.totalTests ?? 0,
          passedCount: result.summary.passedTests ?? 0,
          failedCount: result.summary.failedTests ?? 0,
          logs: result.logs,
          durationMs: result.durationMs,
        });

        studioEventBus.emitStudioEvent({
          ownerUid: principal.uid,
          projectId,
          type: 'test:finished',
          message: `Tests ${saved.status}: ${saved.passedCount}/${saved.totalCount} passed`,
          data: { testRunId: saved.id, status: saved.status },
        });

        return saved;
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    authed.post('/projects/:projectId/sandbox/exec', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const body = SandboxExecSchema.parse(request.body);
        const files = await studioRepo.listProjectFiles(request.principal!.uid, projectId);
        const res = await sandboxRunner.runAllowedCommand(
          files.map((f) => ({ path: f.path, content: f.content })),
          body.command
        );
        return res;
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    // Live Preview Sessions
    authed.get('/projects/:projectId/preview', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        await studioRepo.requireOwnedProject(request.principal!.uid, projectId);
        const active = previewManager.getActiveSessionForProject(request.principal!.uid, projectId);
        return (
          active || {
            sessionId: 'idle',
            projectId,
            status: 'stopped',
            previewUrl: null,
            logs: [],
            errorMessage: null,
            startedAt: new Date().toISOString(),
          }
        );
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/preview/start', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const files = await studioRepo.listProjectFiles(request.principal!.uid, projectId);
        const session = await previewManager.startOrRebuildPreview(
          request.principal!.uid,
          projectId,
          files.map((f) => ({ path: f.path, content: f.content }))
        );
        return session;
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    authed.post('/projects/:projectId/preview/stop', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        await studioRepo.requireOwnedProject(request.principal!.uid, projectId);
        return previewManager.stopProjectPreview(request.principal!.uid, projectId);
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    // Git & History
    authed.get('/projects/:projectId/git', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const git = await studioRepo.getGitConnection(request.principal!.uid, projectId);
        return git;
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.post('/projects/:projectId/git/commit', async (request, reply) => {
      try {
        const projectId = parseIdParam((request.params as { projectId: string }).projectId);
        const body = GitCommitSchema.parse(request.body);
        const res = await studioRepo.commitGitSnapshot(
          request.principal!.uid,
          projectId,
          body.message,
          body.branch
        );
        return res;
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    // Model Configs, Plugins, Usage & Audit
    authed.get('/settings/models', async (request, reply) => {
      try {
        const items = await studioRepo.listModelConfigs(request.principal!.uid);
        return { items };
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    authed.put('/settings/models', async (request, reply) => {
      try {
        const body = ModelConfigUpdateSchema.parse(request.body);
        const updated = await studioRepo.updateModelConfig(request.principal!.uid, body);
        return updated;
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.get('/settings/plugins', async (request, reply) => {
      try {
        const items = await studioRepo.listPlugins(request.principal!.uid);
        return { items };
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    authed.patch('/settings/plugins/:manifestId', async (request, reply) => {
      try {
        const manifestId = (request.params as { manifestId: string }).manifestId;
        const body = PluginToggleSchema.parse(request.body);
        const updated = await studioRepo.togglePlugin(
          request.principal!.uid,
          manifestId,
          body.enabled
        );
        return updated;
      } catch (err) {
        return sendError(reply, err, 400);
      }
    });

    authed.get('/analytics/usage', async (request, reply) => {
      try {
        const items = await studioRepo.listUsage(request.principal!.uid);
        return { items };
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });

    authed.get('/analytics/audit', async (request, reply) => {
      try {
        const items = await studioRepo.listAuditLogs(request.principal!.uid);
        return { items };
      } catch (err) {
        return sendError(reply, err, 500);
      }
    });
  });
}
