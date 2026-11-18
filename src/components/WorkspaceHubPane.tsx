import React, { useState } from 'react';
import {
  FileSpreadsheet,
  FolderSync,
  ListTodo,
  Mail,
  MessageSquare,
  Presentation,
  StickyNote,
} from 'lucide-react';
import type {
  AgentTaskRecord,
  AuditLogItem,
  ProjectFileRecord,
  ProjectSummary,
  UsageRecordItem,
} from '../domain/types.ts';
import {
  createGmailDraft,
  createGoogleSlidesSummary,
  createGoogleTask,
  exportAuditToGoogleSheet,
  exportProjectBackupToDrive,
  inspectGoogleForm,
  listDriveFiles,
  listGoogleChatSpaces,
  listGoogleTasks,
  listRecentGmailMessages,
  sendGoogleChatMessage,
  type ChatSpaceSummary,
  type DriveFileItem,
  type GmailMessageSummary,
  type TaskItemSummary,
} from '../lib/workspaceApi.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface WorkspaceHubPaneProps {
  accessToken: string | null;
  project: ProjectSummary | null;
  files: ProjectFileRecord[];
  proposals: AgentTaskRecord[];
  usage: UsageRecordItem[];
  auditLogs: AuditLogItem[];
  onSignIn: () => Promise<void>;
}

interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

export function WorkspaceHubPane({
  accessToken,
  project,
  files,
  proposals,
  usage,
  auditLogs,
  onSignIn,
}: WorkspaceHubPaneProps) {
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [gmailMsgs, setGmailMsgs] = useState<GmailMessageSummary[]>([]);
  const [tasks, setTasks] = useState<TaskItemSummary[]>([]);
  const [chatSpaces, setChatSpaces] = useState<ChatSpaceSummary[]>([]);
  const [keepScratchpad, setKeepScratchpad] = useState<string>(
    'Studio engineering notes:\n- Verify diff approval checkpoint before deploy.'
  );

  const [gmailTo, setGmailTo] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [formIdInput, setFormIdInput] = useState('');
  const [formSummary, setFormSummary] = useState<{
    title: string;
    description: string;
    questionCount: number;
    responseCount: number;
  } | null>(null);
  const [chatMessageText, setChatMessageText] = useState('');
  const [selectedSpace, setSelectedSpace] = useState('');

  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState<PendingAction | null>(null);

  const runSafe = async (fn: () => Promise<void>) => {
    setBusy(true);
    setErrorMessage('');
    setStatusMessage('');
    try {
      await fn();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Google Workspace request failed');
    } finally {
      setBusy(false);
    }
  };

  if (!accessToken) {
    return (
      <div className="flex-1 overflow-y-auto p-8 bg-[#0D131F] flex items-center justify-center">
        <div className="max-w-lg w-full rounded-lg border border-slate-800 bg-[#111827] p-6 space-y-4 text-center">
          <h2 className="text-lg font-semibold text-slate-100">Connect Google Workspace</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Sign in with Google to authorize Drive backups, Gmail report drafts, Google Sheets audit exports, Google Tasks sync, Google Slides decks, Google Forms inspection, and Google Chat spaces.
          </p>
          <button
            type="button"
            onClick={() => void onSignIn()}
            className="gsi-material-button mx-auto"
          >
            <div className="gsi-material-button-content-wrapper">
              <span className="gsi-material-button-contents">Sign in with Google Workspace</span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#0D131F] space-y-6">
      <div className="border-b border-slate-800 pb-4">
        <h2 className="text-lg font-semibold text-slate-100">Google Workspace Hub</h2>
        <p className="text-xs text-slate-400 mt-1">
          Every mutating action requires explicit confirmation before modifying your Google Workspace data.
        </p>
      </div>

      {statusMessage && (
        <div className="rounded border border-emerald-800/70 bg-emerald-950/30 px-4 py-2.5 text-xs text-emerald-300">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="rounded border border-rose-800/70 bg-rose-950/30 px-4 py-2.5 text-xs text-rose-300">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Google Drive */}
        <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <FolderSync className="w-4 h-4 text-sky-400" />
              Google Drive
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runSafe(async () => {
                    const list = await listDriveFiles(accessToken);
                    setDriveFiles(list);
                    setStatusMessage(`Loaded ${list.length} Drive file(s).`);
                  })
                }
                className="px-2.5 py-1 text-xs rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                List Files
              </button>
              <button
                type="button"
                disabled={busy || !project}
                onClick={() => {
                  if (!project) return;
                  setPendingConfirm({
                    title: 'Export Project Backup to Google Drive?',
                    description: `This will upload a JSON backup of "${project.name}" (${files.length} files) to your Google Drive.`,
                    confirmLabel: 'Upload Backup',
                    run: async () => {
                      const payload = JSON.stringify({ project, files }, null, 2);
                      const uploaded = await exportProjectBackupToDrive(accessToken, project.name, payload);
                      setStatusMessage(`Uploaded Drive backup "${uploaded.name}".`);
                    },
                  });
                }}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white"
              >
                Backup Project
              </button>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            {driveFiles.length === 0 ? (
              <p className="text-slate-500">Click &ldquo;List Files&rdquo; to browse your recent Google Drive files.</p>
            ) : (
              driveFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-1 border-t border-slate-800">
                  <span className="truncate text-slate-200">{f.name}</span>
                  <span className="text-[11px] text-slate-400 shrink-0 ml-2">{f.mimeType.split('.').pop()}</span>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Gmail */}
        <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-sky-400" />
              Gmail
            </h3>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runSafe(async () => {
                  const list = await listRecentGmailMessages(accessToken);
                  setGmailMsgs(list);
                  setStatusMessage(`Fetched ${list.length} recent email thread(s).`);
                })
              }
              className="px-2.5 py-1 text-xs rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Load Inbox
            </button>
          </div>
          <div className="flex gap-2">
            <label htmlFor="gmail-draft-to" className="sr-only">
              Recipient email for draft
            </label>
            <input
              id="gmail-draft-to"
              type="email"
              value={gmailTo}
              onChange={(e) => setGmailTo(e.target.value)}
              placeholder="teammate@example.com"
              className="flex-1 rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
            />
            <button
              type="button"
              disabled={busy || !gmailTo.trim()}
              onClick={() => {
                setPendingConfirm({
                  title: 'Create Gmail Status Draft?',
                  description: `Create a Gmail draft addressed to "${gmailTo.trim()}" summarizing project "${project?.name || 'ACS'}" (${files.length} files, ${proposals.length} AI tasks)?`,
                  confirmLabel: 'Create Draft',
                  run: async () => {
                    await createGmailDraft(
                      accessToken,
                      gmailTo.trim(),
                      `[ACS Report] ${project?.name || 'Studio Project'}`,
                      `Project: ${project?.name}\nFiles: ${files.length}\nProposals: ${proposals.length}\nUsage runs: ${usage.length}`
                    );
                    setStatusMessage(`Created Gmail draft to ${gmailTo.trim()}.`);
                  },
                });
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"
            >
              Draft Report
            </button>
          </div>
          <div className="space-y-1.5 text-xs">
            {gmailMsgs.map((m) => (
              <div key={m.id} className="py-1.5 border-t border-slate-800">
                <div className="font-medium text-slate-200 truncate">{m.subject}</div>
                <div className="text-slate-400 truncate">{m.from}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Google Sheets & Slides */}
        <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Google Sheets &amp; Google Slides
          </h3>
          <p className="text-xs text-slate-400">
            Export workspace audit &amp; token telemetry to a new Google Sheet, or create a sprint review deck in Google Slides.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPendingConfirm({
                  title: 'Create Google Sheet with Audit Telemetry?',
                  description: `Creates a new spreadsheet containing ${auditLogs.length} audit log row(s) and usage metrics in your Google Drive.`,
                  confirmLabel: 'Export to Sheets',
                  run: async () => {
                    const rows = [
                      ['Action', 'Resource Type', 'Resource ID', 'Actor', 'Timestamp'],
                      ...auditLogs.slice(0, 50).map((a) => [
                        a.action,
                        a.resourceType,
                        a.resourceId,
                        a.actorUid,
                        a.createdAt,
                      ]),
                    ];
                    const res = await exportAuditToGoogleSheet(
                      accessToken,
                      `ACS Audit - ${project?.name || 'Workspace'}`,
                      rows
                    );
                    setStatusMessage(`Exported Google Sheet (${res.spreadsheetId}).`);
                  },
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Export Audit Sheet
            </button>

            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPendingConfirm({
                  title: 'Create Google Slides Architecture Deck?',
                  description: `Creates a new Google Slides presentation titled "ACS Architecture: ${project?.name || 'Workspace'}" in your Google Drive.`,
                  confirmLabel: 'Create Slides Deck',
                  run: async () => {
                    const res = await createGoogleSlidesSummary(
                      accessToken,
                      `ACS Architecture: ${project?.name || 'Workspace'}`
                    );
                    setStatusMessage(`Created Google Slides deck (${res.presentationId}).`);
                  },
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              <Presentation className="w-3.5 h-3.5 text-amber-400" />
              Create Slides Deck
            </button>
          </div>
        </section>

        {/* Google Tasks */}
        <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ListTodo className="w-4 h-4 text-sky-400" />
              Google Tasks
            </h3>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void runSafe(async () => {
                  const list = await listGoogleTasks(accessToken);
                  setTasks(list);
                  setStatusMessage(`Loaded ${list.length} task(s) from Google Tasks.`);
                })
              }
              className="px-2.5 py-1 text-xs rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Sync Tasks
            </button>
          </div>
          <div className="flex gap-2">
            <label htmlFor="gtask-title-input" className="sr-only">
              New Google Task title
            </label>
            <input
              id="gtask-title-input"
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Add engineering task..."
              className="flex-1 rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
            />
            <button
              type="button"
              disabled={busy || !newTaskTitle.trim()}
              onClick={() => {
                setPendingConfirm({
                  title: 'Add Task to Google Tasks?',
                  description: `Creates task "${newTaskTitle.trim()}" in your default Google Tasks list.`,
                  confirmLabel: 'Create Task',
                  run: async () => {
                    const created = await createGoogleTask(
                      accessToken,
                      newTaskTitle.trim(),
                      `Created from ACS project ${project?.name || ''}`
                    );
                    setTasks((prev) => [created, ...prev]);
                    setNewTaskTitle('');
                    setStatusMessage(`Added Google Task "${created.title}".`);
                  },
                });
              }}
              className="px-3 py-1.5 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40"
            >
              Add Task
            </button>
          </div>
          <div className="space-y-1 text-xs">
            {tasks.map((t) => (
              <div key={t.id} className="py-1 border-t border-slate-800 text-slate-200">
                {t.title} <span className="text-slate-400">({t.status})</span>
              </div>
            ))}
          </div>
        </section>

        {/* Google Forms & Google Chat */}
        <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            Google Chat &amp; Google Forms
          </h3>

          <div className="space-y-2 border-b border-slate-800 pb-3">
            <div className="flex gap-2">
              <label htmlFor="gform-id-input" className="sr-only">
                Google Form ID
              </label>
              <input
                id="gform-id-input"
                type="text"
                value={formIdInput}
                onChange={(e) => setFormIdInput(e.target.value)}
                placeholder="Google Form ID..."
                className="flex-1 rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs font-mono text-slate-100"
              />
              <button
                type="button"
                disabled={busy || !formIdInput.trim()}
                onClick={() =>
                  void runSafe(async () => {
                    const info = await inspectGoogleForm(accessToken, formIdInput);
                    setFormSummary(info);
                    setStatusMessage(`Loaded Google Form "${info.title}".`);
                  })
                }
                className="px-3 py-1.5 text-xs rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Inspect Form
              </button>
            </div>
            {formSummary && (
              <p className="text-xs text-slate-300">
                {formSummary.title} · {formSummary.questionCount} questions · {formSummary.responseCount} responses
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-300">Google Chat Spaces (Workspace account required)</span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void runSafe(async () => {
                    const spaces = await listGoogleChatSpaces(accessToken);
                    setChatSpaces(spaces);
                    if (spaces[0]) setSelectedSpace(spaces[0].name);
                    setStatusMessage(`Loaded ${spaces.length} Google Chat space(s).`);
                  })
                }
                className="px-2.5 py-1 text-xs rounded border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                Load Spaces
              </button>
            </div>

            {chatSpaces.length > 0 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatMessageText}
                  onChange={(e) => setChatMessageText(e.target.value)}
                  placeholder="Message to selected Chat space..."
                  className="flex-1 rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
                />
                <button
                  type="button"
                  disabled={busy || !selectedSpace || !chatMessageText.trim()}
                  onClick={() => {
                    setPendingConfirm({
                      title: 'Send Google Chat Message?',
                      description: `Posts "${chatMessageText.trim()}" to space ${selectedSpace}.`,
                      confirmLabel: 'Send Message',
                      run: async () => {
                        await sendGoogleChatMessage(accessToken, selectedSpace, chatMessageText.trim());
                        setChatMessageText('');
                        setStatusMessage(`Posted message to ${selectedSpace}.`);
                      },
                    });
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Google Keep Notice & Studio Scratchpad */}
        <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-amber-400" />
            Google Keep Notes &amp; Studio Scratchpad
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Google Keep API (<code className="font-mono text-slate-300">keep.googleapis.com</code>) is an enterprise-only API requiring domain-wide delegation in Google Workspace Admin. Use this studio scratchpad for local engineering notes alongside your workspace.
          </p>
          <label htmlFor="keep-scratchpad" className="sr-only">
            Engineering Scratchpad
          </label>
          <textarea
            id="keep-scratchpad"
            rows={4}
            value={keepScratchpad}
            onChange={(e) => setKeepScratchpad(e.target.value)}
            className="w-full rounded border border-slate-700 bg-[#0B0F17] p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
          />
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title || ''}
        description={pendingConfirm?.description || ''}
        confirmLabel={pendingConfirm?.confirmLabel || 'Confirm'}
        busy={busy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={() => {
          const action = pendingConfirm;
          setPendingConfirm(null);
          if (action) void runSafe(action.run);
        }}
      />
    </div>
  );
}
