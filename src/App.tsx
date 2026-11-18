import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Code2,
  Eye,
  FolderTree,
  Mail,
  MessageSquareCode,
  RefreshCw,
  TerminalSquare,
  X,
} from 'lucide-react';
import { sanitizeRedirectPath } from './domain/auth.ts';
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
  PluginRecord,
  PreviewSessionState,
  ProjectFileRecord,
  ProjectSummary,
  ReviewReportRecord,
  TestRunRecord,
  ThinkingLevelName,
  UsageRecordItem,
} from './domain/types.ts';
import {
  apiRequest,
  fetchServerProfile,
  getEventStreamUrl,
  logoutServerAuthSession,
  syncServerAuthSession,
  type ServerUserProfile,
} from './lib/apiClient.ts';
import {
  getFirebaseIdToken,
  getWorkspaceAccessToken,
  reloadCurrentFirebaseUser,
  resendCurrentUserVerification,
  signInWithGoogleWorkspace,
  signOutStudio,
  subscribeAuthState,
  syncUserPreferencesToFirestore,
  testFirestoreConnection,
} from './lib/firebase.ts';
import { AiAssistantPanel } from './components/AiAssistantPanel.tsx';
import { AuthPages, type AuthRouteMode } from './components/AuthPages.tsx';
import { BottomPanel, type PreviewConsoleEntry } from './components/BottomPanel.tsx';
import { CodeEditorPane } from './components/CodeEditorPane.tsx';
import { CodeReviewPane } from './components/CodeReviewPane.tsx';
import { ConfirmDialog } from './components/ConfirmDialog.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FileExplorer } from './components/FileExplorer.tsx';
import { HistoryAndGitPane } from './components/HistoryAndGitPane.tsx';
import { LivePreviewPane } from './components/LivePreviewPane.tsx';
import { ProfilePane } from './components/ProfilePane.tsx';
import { SettingsPane } from './components/SettingsPane.tsx';
import { TopBar, type StudioViewMode } from './components/TopBar.tsx';
import { UsageAndAuditPane } from './components/UsageAndAuditPane.tsx';
import { WorkspaceHubPane } from './components/WorkspaceHubPane.tsx';

type MobilePane = 'explorer' | 'editor' | 'ai' | 'preview' | 'console';

interface ParsedLocation {
  pathname: string;
  authRoute: AuthRouteMode | null;
  studioView: StudioViewMode;
  actionCode: string | null;
  actionType: string | null;
  redirectTarget: string;
}

const VIEW_PATH_MAP: Record<string, StudioViewMode> = {
  '/': 'code',
  '/dashboard': 'code',
  '/code': 'code',
  '/preview': 'preview',
  '/review': 'review',
  '/history': 'history',
  '/usage': 'usage',
  '/workspace': 'workspace',
  '/settings': 'settings',
  '/profile': 'profile',
};

function parseLocation(): ParsedLocation {
  const pathname = window.location.pathname || '/';
  const params = new URLSearchParams(window.location.search);
  const actionCode = params.get('oobCode');
  const actionType = params.get('mode');
  const redirectTarget = sanitizeRedirectPath(params.get('redirect'));

  // Firebase email action links land on ?mode=resetPassword&oobCode=... or ?mode=verifyEmail&oobCode=...
  if (actionCode && (actionType === 'resetPassword' || actionType === 'verifyEmail')) {
    return {
      pathname,
      authRoute: 'reset-password',
      studioView: 'code',
      actionCode,
      actionType,
      redirectTarget,
    };
  }

  let authRoute: AuthRouteMode | null = null;
  if (pathname === '/login') authRoute = 'login';
  else if (pathname === '/signup') authRoute = 'signup';
  else if (pathname === '/forgot-password') authRoute = 'forgot-password';
  else if (pathname === '/reset-password') authRoute = 'reset-password';

  const studioView: StudioViewMode = VIEW_PATH_MAP[pathname] || 'code';

  return {
    pathname,
    authRoute,
    studioView,
    actionCode,
    actionType,
    redirectTarget,
  };
}

function viewToPath(view: StudioViewMode): string {
  return view === 'code' ? '/' : `/${view}`;
}

export default function App() {
  const initialLoc = parseLocation();

  const [authReady, setAuthReady] = useState(false);
  const [userUid, setUserUid] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [serverProfile, setServerProfile] = useState<ServerUserProfile | null>(null);
  const [workspaceAccessToken, setWorkspaceAccessToken] = useState<string | null>(null);

  const [authRoute, setAuthRoute] = useState<AuthRouteMode>(initialLoc.authRoute || 'login');
  const [actionCode, setActionCode] = useState<string | null>(initialLoc.actionCode);
  const [actionType, setActionType] = useState<string | null>(initialLoc.actionType);
  const [activeView, setActiveView] = useState<StudioViewMode>(initialLoc.studioView);
  const [mobilePane, setMobilePane] = useState<MobilePane>('editor');

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  const [files, setFiles] = useState<ProjectFileRecord[]>([]);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [draftContents, setDraftContents] = useState<Record<string, string>>({});

  const [messages, setMessages] = useState<ChatMessageRecord[]>([]);
  const [proposals, setProposals] = useState<AgentTaskRecord[]>([]);
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([]);
  const [versions, setVersions] = useState<FileVersionRecord[]>([]);
  const [git, setGit] = useState<GitConnectionRecord | null>(null);
  const [reviews, setReviews] = useState<ReviewReportRecord[]>([]);
  const [builds, setBuilds] = useState<BuildRunRecord[]>([]);
  const [tests, setTests] = useState<TestRunRecord[]>([]);
  const [previewSession, setPreviewSession] = useState<PreviewSessionState | null>(null);
  const [consoleEntries, setConsoleEntries] = useState<PreviewConsoleEntry[]>([]);
  const [activityEvents, setActivityEvents] = useState<
    Array<{ id: string; type: string; message: string; timestamp: string }>
  >([]);

  const [modelConfigs, setModelConfigs] = useState<ModelConfigRecord[]>([]);
  const [plugins, setPlugins] = useState<PluginRecord[]>([]);
  const [usage, setUsage] = useState<UsageRecordItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  const [loadingSession, setLoadingSession] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [verifyBannerMsg, setVerifyBannerMsg] = useState<string | null>(null);
  const [dismissedVerifyBanner, setDismissedVerifyBanner] = useState(false);

  const [aiSending, setAiSending] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isPreviewBusy, setIsPreviewBusy] = useState(false);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);
  const [pendingDeleteProjectId, setPendingDeleteProjectId] = useState<number | null>(null);

  const syncedUidRef = useRef<string | null>(null);
  const userDisplayNameRef = useRef<string | null>(userDisplayName);
  userDisplayNameRef.current = userDisplayName;

  const clearWorkspaceState = useCallback(() => {
    syncedUidRef.current = null;
    setServerProfile(null);
    setProjects([]);
    setActiveProjectId(null);
    setFiles([]);
    setOpenTabs([]);
    setActiveFilePath(null);
    setDraftContents({});
    setMessages([]);
    setProposals([]);
    setCheckpoints([]);
    setVersions([]);
    setGit(null);
    setReviews([]);
    setBuilds([]);
    setTests([]);
    setPreviewSession(null);
    setConsoleEntries([]);
    setActivityEvents([]);
    setModelConfigs([]);
    setPlugins([]);
    setUsage([]);
    setAuditLogs([]);
    setGlobalError(null);
    setVerifyBannerMsg(null);
    setDismissedVerifyBanner(false);
  }, []);

  const navigateToPath = useCallback((path: string, replace = false) => {
    if (window.location.pathname + window.location.search === path) return;
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
  }, []);

  const navigateToAuthMode = useCallback(
    (nextMode: AuthRouteMode, replace = false) => {
      setAuthRoute(nextMode);
      if (nextMode !== 'reset-password') {
        setActionCode(null);
        setActionType(null);
      }
      const params = new URLSearchParams(window.location.search);
      const existingRedirect = params.get('redirect');
      const query =
        nextMode === 'login' || nextMode === 'signup' || nextMode === 'forgot-password'
          ? existingRedirect && existingRedirect.startsWith('/') && !existingRedirect.startsWith('//')
            ? `?redirect=${encodeURIComponent(existingRedirect)}`
            : ''
          : '';
      navigateToPath(`/${nextMode}${query}`, replace);
    },
    [navigateToPath]
  );

  // Sync browser back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      const loc = parseLocation();
      if (loc.authRoute) {
        setAuthRoute(loc.authRoute);
        setActionCode(loc.actionCode);
        setActionType(loc.actionType);
      } else {
        setActiveView(loc.studioView);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const loadProjectData = useCallback(async (projectId: number) => {
    const [
      fileRes,
      convRes,
      cpRes,
      verRes,
      gitRes,
      revRes,
      bldRes,
      tstRes,
      prvRes,
    ] = await Promise.all([
      apiRequest<{ items: ProjectFileRecord[] }>(`/projects/${projectId}/files`),
      apiRequest<{ messages: ChatMessageRecord[]; tasks: AgentTaskRecord[] }>(
        `/projects/${projectId}/conversations`
      ),
      apiRequest<{ items: CheckpointRecord[] }>(`/projects/${projectId}/checkpoints`),
      apiRequest<{ items: FileVersionRecord[] }>(`/projects/${projectId}/files/versions`),
      apiRequest<GitConnectionRecord>(`/projects/${projectId}/git`),
      apiRequest<{ items: ReviewReportRecord[] }>(`/projects/${projectId}/reviews`),
      apiRequest<{ items: BuildRunRecord[] }>(`/projects/${projectId}/builds`),
      apiRequest<{ items: TestRunRecord[] }>(`/projects/${projectId}/tests`),
      apiRequest<PreviewSessionState>(`/projects/${projectId}/preview`),
    ]);

    setFiles(fileRes.items);
    setMessages(convRes.messages);
    setProposals(convRes.tasks);
    setCheckpoints(cpRes.items);
    setVersions(verRes.items);
    setGit(gitRes);
    setReviews(revRes.items);
    setBuilds(bldRes.items);
    setTests(tstRes.items);
    setPreviewSession(prvRes);
    setDraftContents({});

    if (fileRes.items.length > 0) {
      const preferred =
        fileRes.items.find((f) => f.path === 'src/App.tsx') ||
        fileRes.items.find((f) => f.isEntry) ||
        fileRes.items[0];
      setOpenTabs((prev) => {
        const valid = prev.filter((p) => fileRes.items.some((f) => f.path === p));
        return valid.length > 0 ? valid : [preferred.path];
      });
      setActiveFilePath((prev) =>
        prev && fileRes.items.some((f) => f.path === prev) ? prev : preferred.path
      );
    } else {
      setOpenTabs([]);
      setActiveFilePath(null);
    }
  }, []);

  const loadWorkspaceGlobals = useCallback(async () => {
    const [modelsRes, pluginsRes, usageRes, auditRes] = await Promise.all([
      apiRequest<{ items: ModelConfigRecord[] }>('/settings/models'),
      apiRequest<{ items: PluginRecord[] }>('/settings/plugins'),
      apiRequest<{ items: UsageRecordItem[] }>('/analytics/usage'),
      apiRequest<{ items: AuditLogItem[] }>('/analytics/audit'),
    ]);
    setModelConfigs(modelsRes.items);
    setPlugins(pluginsRes.items);
    setUsage(usageRes.items);
    setAuditLogs(auditRes.items);
  }, []);

  const bootstrapSession = useCallback(
    async (uid: string, displayNameHint: string | null) => {
      setLoadingSession(true);
      setGlobalError(null);
      try {
        // Ensure signed HttpOnly session cookie is established for reloads & SSE
        if (syncedUidRef.current !== uid) {
          const idToken = await getFirebaseIdToken();
          if (idToken) {
            const synced = await syncServerAuthSession({
              idToken,
              rememberMe: true,
              fullName: displayNameHint || undefined,
            });
            setServerProfile(synced);
            setUserDisplayName(synced.displayName);
            setUserEmail(synced.email);
          }
          syncedUidRef.current = uid;
        }

        const session = await apiRequest<{
          user: ServerUserProfile;
          projects: ProjectSummary[];
        }>('/session');

        const safeProjects = Array.isArray(session.projects) ? session.projects : [];
        setProjects(safeProjects);
        if (session.user) {
          setServerProfile(session.user);
          setUserEmail(session.user.email);
          setUserDisplayName(session.user.displayName);
          setUserUid(session.user.uid);
        }

        if (safeProjects[0]) {
          const pid = safeProjects[0].id;
          setActiveProjectId(pid);
          await Promise.all([loadProjectData(pid), loadWorkspaceGlobals()]);
        }
      } catch (err) {
        setGlobalError(
          err instanceof Error ? err.message : 'Failed to initialize studio session'
        );
      } finally {
        setLoadingSession(false);
      }
    },
    [loadProjectData, loadWorkspaceGlobals]
  );

  // Firebase Auth listener + Firestore probe
  useEffect(() => {
    void testFirestoreConnection();
    const unsub = subscribeAuthState((user) => {
      if (user) {
        setUserUid(user.uid);
        setUserEmail(user.email);
        setUserDisplayName(user.displayName);
        setWorkspaceAccessToken(getWorkspaceAccessToken());
      } else {
        setUserUid(null);
        setUserEmail(null);
        setUserDisplayName(null);
        setWorkspaceAccessToken(null);
        clearWorkspaceState();
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, [clearWorkspaceState]);

  // Enforce protected routes once authReady is known
  useEffect(() => {
    if (!authReady) return;
    const loc = parseLocation();

    if (!userUid) {
      // Unauthenticated user on protected path -> redirect cleanly to /login
      if (!loc.authRoute) {
        const target =
          loc.pathname && loc.pathname !== '/' && loc.pathname !== '/dashboard'
            ? `/login?redirect=${encodeURIComponent(loc.pathname)}`
            : '/login';
        setAuthRoute('login');
        setActionCode(null);
        setActionType(null);
        navigateToPath(target, true);
      } else {
        setAuthRoute(loc.authRoute);
        setActionCode(loc.actionCode);
        setActionType(loc.actionType);
      }
      return;
    }

    // Authenticated user on auth-only screen (unless validating an explicit oobCode action link) -> send to dashboard
    if (loc.authRoute && !(loc.authRoute === 'reset-password' && loc.actionCode)) {
      const nextTarget = loc.redirectTarget || '/';
      const resolvedView = VIEW_PATH_MAP[nextTarget] || 'code';
      setActiveView(resolvedView);
      navigateToPath(nextTarget, true);
    } else if (!loc.authRoute) {
      setActiveView(loc.studioView);
    }

    void bootstrapSession(userUid, userDisplayNameRef.current);
  }, [authReady, userUid, bootstrapSession, navigateToPath]);

  // SSE Real-time Event Stream (strictly only when authenticated)
  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    const connect = async () => {
      const url = await getEventStreamUrl();
      if (cancelled) return;
      source = new EventSource(url);

      const handleEvent = (ev: MessageEvent) => {
        try {
          const parsed = JSON.parse(ev.data) as {
            id: string;
            type: string;
            message: string;
            timestamp: string;
          };
          setActivityEvents((prev) => [parsed, ...prev].slice(0, 40));
        } catch {
          // Ignore malformed keepalives
        }
      };

      for (const evtType of [
        'agent:status',
        'proposal:created',
        'proposal:updated',
        'build:log',
        'build:finished',
        'test:finished',
        'preview:status',
        'checkpoint:created',
        'review:finished',
      ]) {
        source.addEventListener(evtType, handleEvent as EventListener);
      }
    };

    if (authReady && userUid) {
      void connect();
    }

    return () => {
      cancelled = true;
      source?.close();
    };
  }, [authReady, userUid]);

  // Listen to preview iframe console bridge postMessage
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === 'acs-preview-console') {
        setConsoleEntries((prev) =>
          [
            ...prev,
            {
              level: String(ev.data.level || 'log'),
              text: String(ev.data.text || ''),
              timestamp: String(ev.data.timestamp || new Date().toISOString()),
            },
          ].slice(-100)
        );
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleAuthSuccess = async (redirectHint?: string) => {
    const loc = parseLocation();
    const destination = redirectHint || loc.redirectTarget || '/';
    const profile = await fetchServerProfile();
    syncedUidRef.current = profile.uid;
    setServerProfile(profile);
    setUserUid(profile.uid);
    setUserEmail(profile.email);
    setUserDisplayName(profile.displayName);
    setActiveView(VIEW_PATH_MAP[destination] || 'code');
    navigateToPath(destination, true);
  };

  const handleConnectWorkspace = async () => {
    try {
      const res = await signInWithGoogleWorkspace();
      setWorkspaceAccessToken(res.accessToken);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Google Workspace authorization failed');
    }
  };

  const handleSignOut = async () => {
    try {
      await logoutServerAuthSession();
    } catch {
      // Proceed cleanly with Firebase signOut even if server cookie already expired
    }
    await signOutStudio();
    setWorkspaceAccessToken(null);
    setUserEmail(null);
    setUserDisplayName(null);
    setUserUid(null);
    clearWorkspaceState();
    navigateToAuthMode('login', true);
  };

  const handleSelectView = (view: StudioViewMode) => {
    setActiveView(view);
    if (view === 'preview') setMobilePane('preview');
    else setMobilePane('editor');
    navigateToPath(viewToPath(view));
  };

  const handleSelectProject = async (pid: number) => {
    setActiveProjectId(pid);
    setConsoleEntries([]);
    setGlobalError(null);
    try {
      await loadProjectData(pid);
      if (userUid) {
        void syncUserPreferencesToFirestore(userUid, { activeProjectId: pid });
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to load selected project');
    }
  };

  const handleCreateProject = async (input: {
    name: string;
    description: string;
    template: 'react-vite-ts' | 'node-api-ts' | 'blank-web';
  }) => {
    const created = await apiRequest<ProjectSummary>('/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setConsoleEntries([]);
    setProjects((prev) => [created, ...prev]);
    setActiveProjectId(created.id);
    await loadProjectData(created.id);
    await loadWorkspaceGlobals();
  };

  const handleConfirmDeleteProject = async () => {
    if (!pendingDeleteProjectId) return;
    const targetId = pendingDeleteProjectId;
    setPendingDeleteProjectId(null);
    try {
      await apiRequest(`/projects/${targetId}`, { method: 'DELETE' });
      const remaining = projects.filter((p) => p.id !== targetId);
      setProjects(remaining);
      setConsoleEntries([]);
      if (remaining[0]) {
        setActiveProjectId(remaining[0].id);
        await loadProjectData(remaining[0].id);
      } else {
        setActiveProjectId(null);
        setFiles([]);
      }
      await loadWorkspaceGlobals();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  const handleSelectFile = (path: string) => {
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveFilePath(path);
    setActiveView('code');
    setMobilePane('editor');
    navigateToPath('/');
  };

  const handleCloseTab = (path: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((p) => p !== path);
      if (activeFilePath === path) {
        setActiveFilePath(next[next.length - 1] ?? null);
      }
      return next;
    });
  };

  const handleCreateFile = async (path: string) => {
    if (!activeProjectId) return;
    const saved = await apiRequest<ProjectFileRecord>(`/projects/${activeProjectId}/files`, {
      method: 'PUT',
      body: JSON.stringify({ path, content: '// New file\n', commitMessage: 'Create file' }),
    });
    setFiles((prev) =>
      [...prev.filter((f) => f.path !== saved.path), saved].sort((a, b) =>
        a.path.localeCompare(b.path)
      )
    );
    handleSelectFile(saved.path);
  };

  const handleConfirmDeleteFile = async () => {
    if (!activeProjectId || !pendingDeletePath) return;
    const target = pendingDeletePath;
    setPendingDeletePath(null);
    try {
      await apiRequest(`/projects/${activeProjectId}/files?path=${encodeURIComponent(target)}`, {
        method: 'DELETE',
      });
      setFiles((prev) => prev.filter((f) => f.path !== target));
      handleCloseTab(target);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : `Failed to delete ${target}`);
    }
  };

  const handleSaveFile = async (path: string) => {
    if (!activeProjectId) return;
    const fileObj = files.find((f) => f.path === path);
    const content = draftContents[path] ?? fileObj?.content ?? '';
    const saved = await apiRequest<ProjectFileRecord>(`/projects/${activeProjectId}/files`, {
      method: 'PUT',
      body: JSON.stringify({ path, content, commitMessage: 'Editor save' }),
    });
    setFiles((prev) => prev.map((f) => (f.path === path ? saved : f)));
    setDraftContents((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  };

  const handleQuickExplain = async (path: string, snippet: string) => {
    if (!activeProjectId) return '';
    const res = await apiRequest<{ explanation: string }>(
      `/projects/${activeProjectId}/ai/quick-explain`,
      {
        method: 'POST',
        body: JSON.stringify({ filePath: path, snippet }),
      }
    );
    void loadWorkspaceGlobals();
    return res.explanation;
  };

  const handleSendChat = async (input: {
    prompt: string;
    agentRole: AgentRole;
    searchGroundingOverride: boolean;
    thinkingLevelOverride: ThinkingLevelName;
  }) => {
    if (!activeProjectId) return;
    setAiSending(true);
    try {
      await apiRequest<{
        assistantMessage: ChatMessageRecord;
        proposalTask: AgentTaskRecord | null;
      }>(`/projects/${activeProjectId}/ai/chat`, {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          activeFilePath: activeFilePath || undefined,
        }),
      });
      await loadProjectData(activeProjectId);
      void loadWorkspaceGlobals();
    } finally {
      setAiSending(false);
    }
  };

  const handleApproveProposal = async (taskId: number) => {
    if (!activeProjectId) return;
    setBusyTaskId(taskId);
    try {
      await apiRequest(`/projects/${activeProjectId}/proposals/${taskId}/approve`, {
        method: 'POST',
      });
      await loadProjectData(activeProjectId);
      await loadWorkspaceGlobals();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to apply proposal');
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleRejectProposal = async (taskId: number) => {
    if (!activeProjectId) return;
    setBusyTaskId(taskId);
    try {
      await apiRequest(`/projects/${activeProjectId}/proposals/${taskId}/reject`, {
        method: 'POST',
      });
      await loadProjectData(activeProjectId);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to reject proposal');
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleRollbackCheckpoint = async (checkpointId: number) => {
    if (!activeProjectId) return;
    setBusyTaskId(checkpointId);
    try {
      await apiRequest(`/projects/${activeProjectId}/checkpoints/${checkpointId}/rollback`, {
        method: 'POST',
      });
      await loadProjectData(activeProjectId);
      await loadWorkspaceGlobals();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Checkpoint rollback failed');
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleRunBuild = async () => {
    if (!activeProjectId || isBuilding) return;
    setIsBuilding(true);
    try {
      const res = await apiRequest<BuildRunRecord>(`/projects/${activeProjectId}/builds/run`, {
        method: 'POST',
      });
      setBuilds((prev) => [res, ...prev]);
      await loadWorkspaceGlobals();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Build execution failed');
    } finally {
      setIsBuilding(false);
    }
  };

  const handleRunTests = async () => {
    if (!activeProjectId || isTesting) return;
    setIsTesting(true);
    try {
      const res = await apiRequest<TestRunRecord>(`/projects/${activeProjectId}/tests/run`, {
        method: 'POST',
      });
      setTests((prev) => [res, ...prev]);
      await loadWorkspaceGlobals();
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Test suite execution failed');
    } finally {
      setIsTesting(false);
    }
  };

  const handleStartPreview = async () => {
    if (!activeProjectId) return;
    setIsPreviewBusy(true);
    setConsoleEntries([]);
    try {
      const session = await apiRequest<PreviewSessionState>(
        `/projects/${activeProjectId}/preview/start`,
        { method: 'POST' }
      );
      setPreviewSession(session);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to start sandbox preview');
    } finally {
      setIsPreviewBusy(false);
    }
  };

  const handleStopPreview = async () => {
    if (!activeProjectId) return;
    setIsPreviewBusy(true);
    try {
      const session = await apiRequest<PreviewSessionState>(
        `/projects/${activeProjectId}/preview/stop`,
        { method: 'POST' }
      );
      setPreviewSession(session);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : 'Failed to stop preview session');
    } finally {
      setIsPreviewBusy(false);
    }
  };

  const handleBannerResendVerification = async () => {
    try {
      await resendCurrentUserVerification();
      setVerifyBannerMsg(
        `Verification link sent to ${userEmail || 'your email'}. Check your inbox.`
      );
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : 'Could not send verification email.'
      );
    }
  };

  const handleBannerRefreshVerification = async () => {
    try {
      const reloaded = await reloadCurrentFirebaseUser();
      const verified = Boolean(reloaded?.emailVerified);
      if (verified && userUid) {
        const freshToken = await reloaded!.getIdToken(true);
        const updated = await syncServerAuthSession({
          idToken: freshToken,
          rememberMe: true,
        });
        setServerProfile(updated);
        setVerifyBannerMsg(null);
      } else {
        setVerifyBannerMsg('Email verification is still pending.');
      }
    } catch (err) {
      setGlobalError(
        err instanceof Error ? err.message : 'Failed to check verification status.'
      );
    }
  };

  // Gate 1: Wait silently until Firebase Auth determines session state (prevents flash of protected UI)
  if (!authReady) {
    return (
      <ErrorBoundary>
        <div className="min-h-screen w-screen bg-[#0B0F17] text-slate-300 flex items-center justify-center text-xs">
          Verifying authentication session...
        </div>
      </ErrorBoundary>
    );
  }

  // Gate 2: Explicit password reset or verification action link (?mode=...&oobCode=...)
  const currentLoc = parseLocation();
  if (currentLoc.authRoute === 'reset-password' && currentLoc.actionCode) {
    return (
      <ErrorBoundary>
        <AuthPages
          mode="reset-password"
          actionCode={currentLoc.actionCode}
          actionType={currentLoc.actionType}
          onNavigateAuth={(next) => navigateToAuthMode(next)}
          onAuthSuccess={handleAuthSuccess}
        />
      </ErrorBoundary>
    );
  }

  // Gate 3: Unauthenticated user -> ONLY render public Authentication routes (/login, /signup, /forgot-password, /reset-password)
  if (!userUid) {
    return (
      <ErrorBoundary>
        <AuthPages
          mode={authRoute}
          actionCode={actionCode}
          actionType={actionType}
          onNavigateAuth={(next) => navigateToAuthMode(next)}
          onAuthSuccess={handleAuthSuccess}
        />
      </ErrorBoundary>
    );
  }

  const activeProject = projects.find((p) => p.id === activeProjectId) || null;
  const diagnostics = [
    ...(builds[0]?.status === 'failed' ? [`Latest build failed (exit ${builds[0].exitCode})`] : []),
    ...(tests[0]?.failedCount ? [`${tests[0].failedCount} failing unit test(s)`] : []),
  ];

  const resolvedProfile: ServerUserProfile = serverProfile || {
    uid: userUid,
    email: userEmail || '',
    displayName: userDisplayName || userEmail?.split('@')[0] || 'Developer',
    avatarUrl: null,
    emailVerified: false,
    authProvider: 'firebase',
    projectCount: projects.length,
  };

  return (
    <ErrorBoundary>
      <div className="h-screen w-screen overflow-hidden bg-[#0B0F17] text-slate-100 flex flex-col">
        <TopBar
          activeView={activeView}
          onSelectView={handleSelectView}
          onRunBuild={() => void handleRunBuild()}
          isBuilding={isBuilding}
          userDisplayName={resolvedProfile.displayName}
          userEmail={resolvedProfile.email}
          onSignOut={() => void handleSignOut()}
        />

        {serverProfile && !serverProfile.emailVerified && !dismissedVerifyBanner && (
          <div className="px-4 py-2 bg-amber-950/40 border-b border-amber-800/60 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">
                {verifyBannerMsg ||
                  `Verify your email address (${serverProfile.email}) to secure account recovery.`}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleBannerResendVerification()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-600/20 border border-amber-500/40 hover:bg-amber-600/30 text-amber-100 font-medium"
              >
                <Mail className="w-3 h-3" />
                Resend
              </button>
              <button
                type="button"
                onClick={() => void handleBannerRefreshVerification()}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-amber-700/60 hover:bg-amber-900/40 text-amber-200"
              >
                <RefreshCw className="w-3 h-3" />
                Refresh
              </button>
              <button
                type="button"
                onClick={() => handleSelectView('profile')}
                className="underline text-amber-100 hover:text-white"
              >
                Profile
              </button>
              <button
                type="button"
                aria-label="Dismiss verification reminder"
                onClick={() => setDismissedVerifyBanner(true)}
                className="p-0.5 text-amber-300 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {globalError && (
          <div className="px-4 py-2 bg-rose-950/60 border-b border-rose-800 text-xs text-rose-200 flex items-center justify-between">
            <span>{globalError}</span>
            <button
              type="button"
              onClick={() => setGlobalError(null)}
              className="text-rose-300 hover:text-white font-medium"
            >
              Dismiss
            </button>
          </div>
        )}

        {loadingSession ? (
          <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
            Initializing Advanced Coding Studio workspace...
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
            {/* Left Sidebar: Explorer */}
            <div
              className={`${
                mobilePane === 'explorer' ? 'flex flex-1 min-h-0' : 'hidden'
              } md:flex md:flex-none`}
            >
              <FileExplorer
                projects={projects}
                activeProjectId={activeProjectId}
                files={files}
                activeFilePath={activeFilePath}
                onSelectProject={(pid) => void handleSelectProject(pid)}
                onCreateProject={handleCreateProject}
                onSelectFile={handleSelectFile}
                onCreateFile={handleCreateFile}
                onDeleteFile={(path) => setPendingDeletePath(path)}
                onDeleteProject={(pid) => setPendingDeleteProjectId(pid)}
              />
            </div>

            {/* Center + Bottom Workspace */}
            <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
              {/* Primary Center Pane */}
              <div
                className={`${
                  mobilePane === 'editor' || mobilePane === 'preview' ? 'flex' : 'hidden'
                } md:flex flex-1 min-h-0 flex-col overflow-hidden`}
              >
                {activeView === 'code' && (
                  <CodeEditorPane
                    openTabs={openTabs}
                    activeFilePath={activeFilePath}
                    files={files}
                    draftContents={draftContents}
                    onSelectTab={setActiveFilePath}
                    onCloseTab={handleCloseTab}
                    onChangeContent={(p, v) =>
                      setDraftContents((prev) => ({ ...prev, [p]: v }))
                    }
                    onSaveFile={handleSaveFile}
                    onQuickExplain={handleQuickExplain}
                    onCreateCheckpoint={() => {
                      if (!activeProjectId) return;
                      void apiRequest(`/projects/${activeProjectId}/checkpoints`, {
                        method: 'POST',
                        body: JSON.stringify({
                          label: `Manual snapshot (${new Date().toLocaleTimeString()})`,
                          reason: 'Saved from editor toolbar',
                        }),
                      })
                        .then(() => loadProjectData(activeProjectId))
                        .catch((err) =>
                          setGlobalError(
                            err instanceof Error ? err.message : 'Failed to create checkpoint'
                          )
                        );
                    }}
                  />
                )}

                {activeView === 'preview' && (
                  <LivePreviewPane
                    session={previewSession}
                    busy={isPreviewBusy}
                    consoleEntries={consoleEntries}
                    onStartOrRebuild={handleStartPreview}
                    onStop={handleStopPreview}
                  />
                )}

                {activeView === 'review' && (
                  <CodeReviewPane
                    reports={reviews}
                    running={isReviewing}
                    onRunReview={async (targetPath) => {
                      if (!activeProjectId) return;
                      setIsReviewing(true);
                      try {
                        await apiRequest(`/projects/${activeProjectId}/reviews/run`, {
                          method: 'POST',
                          body: JSON.stringify({ targetPath }),
                        });
                        await loadProjectData(activeProjectId);
                        await loadWorkspaceGlobals();
                      } catch (err) {
                        setGlobalError(
                          err instanceof Error ? err.message : 'Code review run failed'
                        );
                      } finally {
                        setIsReviewing(false);
                      }
                    }}
                    onUpdateFindingStatus={async (findingId, status) => {
                      if (!activeProjectId) return;
                      try {
                        await apiRequest(
                          `/projects/${activeProjectId}/reviews/findings/${findingId}`,
                          { method: 'PATCH', body: JSON.stringify({ status }) }
                        );
                        await loadProjectData(activeProjectId);
                      } catch (err) {
                        setGlobalError(
                          err instanceof Error ? err.message : 'Failed to update finding status'
                        );
                      }
                    }}
                    onOpenFile={(path) => handleSelectFile(path)}
                    onProposeFix={(summary) => {
                      void handleSendChat({
                        prompt: summary,
                        agentRole: 'coder',
                        searchGroundingOverride: false,
                        thinkingLevelOverride: 'HIGH',
                      }).catch((err) =>
                        setGlobalError(
                          err instanceof Error ? err.message : 'Failed to propose fix'
                        )
                      );
                      setMobilePane('ai');
                    }}
                  />
                )}

                {activeView === 'history' && (
                  <HistoryAndGitPane
                    checkpoints={checkpoints}
                    versions={versions}
                    git={git}
                    onCreateCheckpoint={async (label) => {
                      if (!activeProjectId) return;
                      await apiRequest(`/projects/${activeProjectId}/checkpoints`, {
                        method: 'POST',
                        body: JSON.stringify({ label, reason: 'Manual checkpoint' }),
                      });
                      await loadProjectData(activeProjectId);
                    }}
                    onRollbackCheckpoint={handleRollbackCheckpoint}
                    onCommitGit={async (message, branch) => {
                      if (!activeProjectId) return;
                      await apiRequest(`/projects/${activeProjectId}/git/commit`, {
                        method: 'POST',
                        body: JSON.stringify({ message, branch }),
                      });
                      await loadProjectData(activeProjectId);
                      await loadWorkspaceGlobals();
                    }}
                  />
                )}

                {activeView === 'usage' && (
                  <UsageAndAuditPane usage={usage} auditLogs={auditLogs} />
                )}

                {activeView === 'workspace' && (
                  <WorkspaceHubPane
                    accessToken={workspaceAccessToken}
                    project={activeProject}
                    files={files}
                    proposals={proposals}
                    usage={usage}
                    auditLogs={auditLogs}
                    onSignIn={handleConnectWorkspace}
                  />
                )}

                {activeView === 'settings' && (
                  <SettingsPane
                    modelConfigs={modelConfigs}
                    plugins={plugins}
                    onUpdateModelConfig={async (cfg) => {
                      await apiRequest('/settings/models', {
                        method: 'PUT',
                        body: JSON.stringify(cfg),
                      });
                      await loadWorkspaceGlobals();
                    }}
                    onTogglePlugin={async (manifestId, enabled) => {
                      try {
                        await apiRequest(`/settings/plugins/${encodeURIComponent(manifestId)}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ enabled }),
                        });
                        await loadWorkspaceGlobals();
                      } catch (err) {
                        setGlobalError(
                          err instanceof Error ? err.message : 'Failed to toggle plugin'
                        );
                      }
                    }}
                  />
                )}

                {activeView === 'profile' && (
                  <ProfilePane
                    profile={resolvedProfile}
                    onProfileUpdated={(next) => {
                      setServerProfile(next);
                      setUserDisplayName(next.displayName);
                    }}
                    onRefreshVerification={(verified) => {
                      setServerProfile((prev) =>
                        prev ? { ...prev, emailVerified: verified } : prev
                      );
                    }}
                    onSignOut={handleSignOut}
                  />
                )}
              </div>

              {/* Bottom Panel */}
              <div
                className={`${
                  mobilePane === 'console' ? 'flex flex-1 min-h-0 flex-col overflow-hidden' : 'hidden'
                } md:block md:shrink-0`}
              >
                <BottomPanel
                  builds={builds}
                  tests={tests}
                  consoleEntries={consoleEntries}
                  diagnostics={diagnostics}
                  runningTests={isTesting}
                  onRunTests={handleRunTests}
                  onExecSandboxCommand={async (command) => {
                    if (!activeProjectId) {
                      return { status: 'failed', exitCode: 1, logs: 'No active project' };
                    }
                    return apiRequest(`/projects/${activeProjectId}/sandbox/exec`, {
                      method: 'POST',
                      body: JSON.stringify({ command }),
                    });
                  }}
                />
              </div>
            </main>

            {/* Right Sidebar: AI Chat & Diff Approval */}
            <div
              className={`${
                mobilePane === 'ai' ? 'flex flex-1 min-h-0' : 'hidden'
              } md:flex md:flex-none`}
            >
              <AiAssistantPanel
                messages={messages}
                proposals={proposals}
                activityEvents={activityEvents}
                activeFilePath={activeFilePath}
                sending={aiSending}
                busyTaskId={busyTaskId}
                onSendChat={handleSendChat}
                onApproveProposal={handleApproveProposal}
                onRejectProposal={handleRejectProposal}
                onRollbackCheckpoint={(cid) => void handleRollbackCheckpoint(cid)}
              />
            </div>
          </div>
        )}

        {/* Mobile Bottom Navigation */}
        <nav
          aria-label="Mobile Studio Navigation"
          className="md:hidden h-13 border-t border-slate-800 bg-[#0B0F17] grid grid-cols-5 shrink-0"
        >
          {(
            [
              { id: 'explorer', label: 'Files', icon: FolderTree, view: 'code' },
              { id: 'editor', label: 'Code', icon: Code2, view: 'code' },
              { id: 'ai', label: 'AI', icon: MessageSquareCode, view: activeView },
              { id: 'preview', label: 'Preview', icon: Eye, view: 'preview' },
              { id: 'console', label: 'Logs', icon: TerminalSquare, view: activeView },
            ] as Array<{
              id: MobilePane;
              label: string;
              icon: React.ComponentType<{ className?: string }>;
              view: StudioViewMode;
            }>
          ).map((item) => {
            const Icon = item.icon;
            const active = mobilePane === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setMobilePane(item.id);
                  if (item.id === 'preview') handleSelectView('preview');
                  else if (item.id === 'editor') handleSelectView('code');
                }}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${
                  active ? 'text-sky-400 font-semibold' : 'text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <ConfirmDialog
          open={Boolean(pendingDeletePath)}
          title="Delete Workspace File?"
          description={`Are you sure you want to delete "${pendingDeletePath}" from this project?`}
          confirmLabel="Delete File"
          danger
          onCancel={() => setPendingDeletePath(null)}
          onConfirm={() => void handleConfirmDeleteFile()}
        />

        <ConfirmDialog
          open={Boolean(pendingDeleteProjectId)}
          title="Delete Workspace Project?"
          description="Are you sure you want to permanently delete the selected project and all of its files, checkpoints, and history?"
          confirmLabel="Delete Project"
          danger
          onCancel={() => setPendingDeleteProjectId(null)}
          onConfirm={() => void handleConfirmDeleteProject()}
        />
      </div>
    </ErrorBoundary>
  );
}
