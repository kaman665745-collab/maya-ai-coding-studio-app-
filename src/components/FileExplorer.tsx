import React, { useState } from 'react';
import { FileCode2, FilePlus2, FolderPlus, Search, Trash2 } from 'lucide-react';
import type { ProjectFileRecord, ProjectSummary } from '../domain/types.ts';

interface FileExplorerProps {
  projects: ProjectSummary[];
  activeProjectId: number | null;
  files: ProjectFileRecord[];
  activeFilePath: string | null;
  onSelectProject: (projectId: number) => void;
  onCreateProject: (input: {
    name: string;
    description: string;
    template: 'react-vite-ts' | 'node-api-ts' | 'blank-web';
  }) => Promise<void>;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string) => Promise<void>;
  onDeleteFile: (path: string) => void;
  onDeleteProject?: (projectId: number) => void;
}

export function FileExplorer({
  projects,
  activeProjectId,
  files,
  activeFilePath,
  onSelectProject,
  onCreateProject,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onDeleteProject,
}: FileExplorerProps) {
  const [filterText, setFilterText] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectTemplate, setProjectTemplate] = useState<'react-vite-ts' | 'node-api-ts' | 'blank-web'>('react-vite-ts');
  const [projectError, setProjectError] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

  const [showNewFile, setShowNewFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [fileError, setFileError] = useState('');

  const filteredFiles = files.filter((f) =>
    f.path.toLowerCase().includes(filterText.trim().toLowerCase())
  );

  const handleProjectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || projectName.trim().length < 2) {
      setProjectError('Project name must be at least 2 characters.');
      return;
    }
    setCreatingProject(true);
    setProjectError('');
    try {
      await onCreateProject({
        name: projectName.trim(),
        description: projectDesc.trim(),
        template: projectTemplate,
      });
      setProjectName('');
      setProjectDesc('');
      setShowNewProject(false);
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCreateFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFilePath.trim()) {
      setFileError('Enter a relative file path (e.g. src/utils/format.ts).');
      return;
    }
    setFileError('');
    try {
      await onCreateFile(newFilePath.trim());
      setNewFilePath('');
      setShowNewFile(false);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to create file');
    }
  };

  return (
    <aside className="h-full w-full md:w-[260px] bg-[#111827] border-r border-slate-800 flex flex-col shrink-0">
      {/* Project Selector */}
      <div className="p-3 border-b border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="project-switcher" className="text-xs font-semibold text-slate-300">
            Project
          </label>
          <button
            type="button"
            onClick={() => setShowNewProject((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300 whitespace-nowrap"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            New Project
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <select
            id="project-switcher"
            value={activeProjectId ?? ''}
            onChange={(e) => onSelectProject(Number(e.target.value))}
            className="flex-1 min-w-0 rounded-md border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.activeBranch})
              </option>
            ))}
          </select>
          {onDeleteProject && activeProjectId && projects.length > 1 && (
            <button
              type="button"
              onClick={() => onDeleteProject(activeProjectId)}
              aria-label="Delete active project"
              title="Delete active project"
              className="p-1.5 rounded-md border border-slate-700 text-slate-400 hover:text-rose-400 hover:border-rose-800 transition-colors shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {showNewProject && (
          <form onSubmit={handleProjectSubmit} className="space-y-2 pt-2 border-t border-slate-800">
            <div>
              <label htmlFor="new-project-name" className="block text-xs text-slate-400 mb-1">
                Project Name
              </label>
              <input
                id="new-project-name"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Billing Service"
                className="w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label htmlFor="new-project-template" className="block text-xs text-slate-400 mb-1">
                Template
              </label>
              <select
                id="new-project-template"
                value={projectTemplate}
                onChange={(e) => setProjectTemplate(e.target.value as 'react-vite-ts' | 'node-api-ts' | 'blank-web')}
                className="w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
              >
                <option value="react-vite-ts">React + Vite + TypeScript</option>
                <option value="node-api-ts">Node.js TypeScript API</option>
                <option value="blank-web">Blank Web App</option>
              </select>
            </div>
            <div>
              <label htmlFor="new-project-desc" className="block text-xs text-slate-400 mb-1">
                Description
              </label>
              <input
                id="new-project-desc"
                type="text"
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                placeholder="Short summary"
                className="w-full rounded border border-slate-700 bg-[#0B0F17] px-2.5 py-1.5 text-xs text-slate-100"
              />
            </div>
            {projectError && <p className="text-xs text-rose-400">{projectError}</p>}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={creatingProject}
                className="px-3 py-1.5 text-xs font-semibold rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
              >
                {creatingProject ? 'Creating...' : 'Create Project'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewProject(false)}
                className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* File Explorer Header + Filter */}
      <div className="px-3 py-2.5 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-300">
            Files ({files.length})
          </span>
          <button
            type="button"
            onClick={() => setShowNewFile((v) => !v)}
            aria-label="New file"
            className="inline-flex items-center gap-1 text-xs text-slate-300 hover:text-sky-400"
          >
            <FilePlus2 className="w-3.5 h-3.5" />
            New File
          </button>
        </div>

        {showNewFile && (
          <form onSubmit={handleCreateFileSubmit} className="space-y-1.5 pb-1">
            <label htmlFor="new-file-path-input" className="sr-only">
              New file path
            </label>
            <input
              id="new-file-path-input"
              type="text"
              value={newFilePath}
              onChange={(e) => setNewFilePath(e.target.value)}
              placeholder="src/utils/helper.ts"
              className="w-full rounded border border-slate-700 bg-[#0B0F17] px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none focus:border-sky-500"
            />
            {fileError && <p className="text-xs text-rose-400">{fileError}</p>}
            <div className="flex gap-2">
              <button
                type="submit"
                className="px-2.5 py-1 text-xs font-medium rounded bg-sky-600 hover:bg-sky-500 text-white"
              >
                Add File
              </button>
              <button
                type="button"
                onClick={() => setShowNewFile(false)}
                className="px-2 py-1 text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <label htmlFor="file-filter-input" className="sr-only">
            Filter project files
          </label>
          <input
            id="file-filter-input"
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter files..."
            className="w-full rounded-md border border-slate-800 bg-[#0B0F17] pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filteredFiles.length === 0 ? (
          <p className="px-2 py-4 text-xs text-slate-500">No matching files in workspace.</p>
        ) : (
          filteredFiles.map((file) => {
            const active = file.path === activeFilePath;
            return (
              <div
                key={file.path}
                className={`group flex items-center justify-between rounded-md px-2 py-1.5 transition-colors ${
                  active ? 'bg-slate-800 text-sky-300' : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectFile(file.path)}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  <FileCode2 className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="text-xs font-mono truncate">{file.path}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteFile(file.path)}
                  aria-label={`Delete file ${file.path}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-slate-500 hover:text-rose-400 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
