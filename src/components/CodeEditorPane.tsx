import React, { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { BookmarkPlus, Save, Sparkles, X } from 'lucide-react';
import type { ProjectFileRecord } from '../domain/types.ts';

interface CodeEditorPaneProps {
  openTabs: string[];
  activeFilePath: string | null;
  files: ProjectFileRecord[];
  draftContents: Record<string, string>;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onChangeContent: (path: string, value: string) => void;
  onSaveFile: (path: string) => Promise<void>;
  onQuickExplain: (path: string, snippet: string) => Promise<string>;
  onCreateCheckpoint: () => void;
}

function getLanguageExtension(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx')) return javascript({ typescript: true, jsx: true });
  if (lower.endsWith('.ts')) return javascript({ typescript: true });
  if (lower.endsWith('.jsx')) return javascript({ jsx: true });
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) return javascript();
  if (lower.endsWith('.html')) return html();
  if (lower.endsWith('.css')) return css();
  if (lower.endsWith('.json')) return json();
  if (lower.endsWith('.md')) return markdown();
  if (lower.endsWith('.py')) return python();
  return [];
}

export function CodeEditorPane({
  openTabs,
  activeFilePath,
  files,
  draftContents,
  onSelectTab,
  onCloseTab,
  onChangeContent,
  onSaveFile,
  onQuickExplain,
  onCreateCheckpoint,
}: CodeEditorPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChangeContent);
  const handleSaveRef = useRef<() => Promise<void>>(async () => {});
  onChangeRef.current = onChangeContent;

  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainLatency, setExplainLatency] = useState<number | null>(null);

  const activeFile = useMemo(
    () => files.find((f) => f.path === activeFilePath) || null,
    [files, activeFilePath]
  );
  const activeContent =
    activeFilePath && draftContents[activeFilePath] !== undefined
      ? draftContents[activeFilePath]
      : activeFile?.content ?? '';
  const lineCount = useMemo(() => activeContent.split('\n').length, [activeContent]);
  const isDirty = Boolean(
    activeFile &&
      activeFilePath &&
      draftContents[activeFilePath] !== undefined &&
      draftContents[activeFilePath] !== activeFile.content
  );

  // Clear file-specific quick explain & save notices when switching tabs
  useEffect(() => {
    setExplainText(null);
    setExplainLatency(null);
    setSaveError(null);
    setSaveFeedback(null);
  }, [activeFilePath]);

  // Recreate CodeMirror 6 instance cleanly when activeFilePath changes
  useEffect(() => {
    if (!hostRef.current || !activeFilePath || !activeFile) {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
      return;
    }

    const startDoc =
      draftContents[activeFilePath] !== undefined
        ? draftContents[activeFilePath]
        : activeFile.content;

    const state = EditorState.create({
      doc: startDoc,
      extensions: [
        basicSetup,
        oneDark,
        getLanguageExtension(activeFilePath),
        keymap.of([
          {
            key: 'Mod-s',
            run: () => {
              void handleSaveRef.current();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(activeFilePath, update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [activeFilePath]);

  // Sync external updates (e.g. after AI proposal apply or rollback) if editor isn't focused
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeFilePath) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== activeContent && !view.hasFocus) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: activeContent },
      });
    }
  }, [activeContent, activeFilePath]);

  const handleSave = async () => {
    if (!activeFilePath || saving) return;
    setSaving(true);
    setSaveError(null);
    setSaveFeedback(null);
    try {
      await onSaveFile(activeFilePath);
      setSaveFeedback('Saved');
      setTimeout(() => setSaveFeedback(null), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };
  handleSaveRef.current = handleSave;

  const handleQuickExplain = async () => {
    if (!activeFilePath) return;
    setExplaining(true);
    const t0 = Date.now();
    try {
      const text = await onQuickExplain(activeFilePath, activeContent);
      setExplainText(text);
      setExplainLatency(Date.now() - t0);
    } catch (err) {
      setExplainText(err instanceof Error ? err.message : 'Explain request failed');
    } finally {
      setExplaining(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-[#0D131F]">
      {/* Multi-Tab Bar */}
      <div className="min-h-10 border-b border-slate-800 bg-[#0B0F17] flex flex-wrap items-center justify-between gap-2 px-2 py-1 shrink-0">
        <div role="tablist" aria-label="Open files" className="flex items-center gap-1 overflow-x-auto min-w-0 max-w-full">
          {openTabs.map((tabPath) => {
            const tabActive = tabPath === activeFilePath;
            const fileObj = files.find((f) => f.path === tabPath);
            const tabDirty =
              fileObj &&
              draftContents[tabPath] !== undefined &&
              draftContents[tabPath] !== fileObj.content;
            return (
              <div
                key={tabPath}
                className={`inline-flex items-center rounded-t border-b-2 transition-colors ${
                  tabActive
                    ? 'bg-[#0D131F] border-sky-400 text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tabActive}
                  onClick={() => onSelectTab(tabPath)}
                  className="px-2.5 py-1.5 text-xs font-mono whitespace-nowrap"
                >
                  {tabPath}
                  {tabDirty ? ' *' : ''}
                </button>
                <button
                  type="button"
                  onClick={() => onCloseTab(tabPath)}
                  aria-label={`Close tab ${tabPath}`}
                  className="pr-2 py-1.5 text-slate-500 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Editor Toolbar Actions */}
        {activeFilePath && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleQuickExplain}
              disabled={explaining}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-slate-700 text-slate-200 hover:bg-slate-800 whitespace-nowrap disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-400" />
              {explaining ? 'Explaining...' : 'Quick Explain'}
            </button>
            <button
              type="button"
              onClick={onCreateCheckpoint}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border border-slate-700 text-slate-200 hover:bg-slate-800 whitespace-nowrap"
            >
              <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
              Checkpoint
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-40 whitespace-nowrap"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <div className="border-b border-rose-800/70 bg-rose-950/40 px-4 py-2 text-xs text-rose-200 flex items-center justify-between">
          <span>{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            className="text-rose-300 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Quick Explain Callout */}
      {explainText && (
        <div className="border-b border-slate-800 bg-[#111827] px-4 py-3 flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-sky-400 font-medium">
              <span>Low-Latency Explanation (gemini-3.1-flash-lite)</span>
              {explainLatency !== null && (
                <span className="text-slate-400 tabular-nums">· {explainLatency} ms</span>
              )}
            </div>
            <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{explainText}</p>
          </div>
          <button
            type="button"
            onClick={() => setExplainText(null)}
            aria-label="Dismiss quick explanation"
            className="p-1 text-slate-400 hover:text-slate-200 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* CodeMirror 6 Host */}
      {activeFile ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div ref={hostRef} className="acs-cm-host flex-1 min-h-0 overflow-hidden" data-testid="codemirror-editor" />
          <div className="h-7 px-3 border-t border-slate-800 bg-[#0B0F17] flex items-center justify-between text-xs text-slate-400 shrink-0">
            <span>
              {activeFile.path} · {activeFile.language}
              {saveFeedback ? ` · ${saveFeedback}` : ''}
            </span>
            <span className="tabular-nums font-mono">
              {lineCount} lines · {activeFile.sizeBytes} B
            </span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
          <p className="text-sm font-medium text-slate-300">No file open</p>
          <p className="text-xs text-slate-500">
            Select a file from the left explorer to inspect or edit it with CodeMirror 6.
          </p>
        </div>
      )}
    </div>
  );
}
