import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { sanitizeProjectPath } from '../../domain/diff.ts';
import type { PreviewSessionState } from '../../domain/types.ts';
import { studioEventBus } from './eventBus.ts';

interface InternalPreviewSession {
  state: PreviewSessionState;
  ownerUid: string;
  htmlContent: string;
  jsBundle: string;
  cssBundle: string;
  expiresAt: number;
}

const PREVIEW_BRIDGE_SCRIPT = `
<script>
(function() {
  var send = function(level, args) {
    try {
      var serialized = Array.prototype.slice.call(args).map(function(a) {
        if (typeof a === 'string') return a;
        try { return JSON.stringify(a); } catch (e) { return String(a); }
      }).join(' ');
      window.parent.postMessage({ type: 'acs-preview-console', level: level, text: serialized, timestamp: new Date().toISOString() }, '*');
    } catch (e) {}
  };
  var origLog = console.log, origWarn = console.warn, origErr = console.error;
  console.log = function() { send('log', arguments); origLog.apply(console, arguments); };
  console.warn = function() { send('warn', arguments); origWarn.apply(console, arguments); };
  console.error = function() { send('error', arguments); origErr.apply(console, arguments); };
  window.addEventListener('error', function(ev) {
    send('error', [ev.message + ' (' + ev.filename + ':' + ev.lineno + ')']);
  });
})();
</script>
`;

class PreviewManager {
  private sessions = new Map<string, InternalPreviewSession>();

  async startOrRebuildPreview(
    ownerUid: string,
    projectId: number,
    files: Array<{ path: string; content: string }>
  ): Promise<PreviewSessionState> {
    // Clean expired sessions
    this.cleanupExpired();

    // Stop any previous active session for this project + owner
    for (const [sid, session] of this.sessions.entries()) {
      if (session.ownerUid === ownerUid && session.state.projectId === projectId) {
        this.sessions.delete(sid);
      }
    }

    const sessionId = `prv-${crypto.randomBytes(6).toString('hex')}`;
    const logs: string[] = [`[preview:${sessionId}] Initializing isolated sandbox preview bundle...`];
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `acs-preview-${sessionId}-`));

    const updateStatus = (partial: Partial<PreviewSessionState>) => {
      studioEventBus.emitStudioEvent({
        ownerUid,
        projectId,
        type: 'preview:status',
        message: partial.errorMessage || `Preview ${partial.status || 'updated'}`,
        data: { sessionId, ...partial },
      });
    };

    updateStatus({ status: 'starting', logs });

    try {
      for (const file of files) {
        const safePath = sanitizeProjectPath(file.path);
        const target = path.resolve(tmpDir, safePath);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.content, 'utf8');
      }

      const filePaths = new Set(files.map((f) => f.path));
      const entryPath =
        ['src/main.tsx', 'src/main.ts', 'src/index.tsx', 'src/index.ts', 'src/App.tsx', 'index.js'].find(
          (c) => filePaths.has(c)
        ) || files.find((f) => /\.(tsx?|jsx?)$/.test(f.path))?.path;

      const cssFile = files.find((f) => f.path.endsWith('.css'));
      const htmlFile = files.find((f) => f.path === 'index.html' || f.path.endsWith('/index.html'));

      let jsBundle = '';
      let cssBundle = cssFile ? cssFile.content : '';

      if (entryPath) {
        logs.push(`[preview:${sessionId}] Compiling ${entryPath} with esbuild (browser ESM)...`);
        const outDir = path.resolve(tmpDir, '.preview-out');

        // Provide an import-map / external shim or bundle directly from workspace node_modules
        const result = await esbuild.build({
          entryPoints: [path.resolve(tmpDir, entryPath)],
          bundle: true,
          write: true,
          outdir: outDir,
          format: 'iife',
          platform: 'browser',
          jsx: 'automatic',
          absWorkingDir: tmpDir,
          nodePaths: [path.resolve(process.cwd(), 'node_modules')],
          logLevel: 'silent',
        });

        if (result.errors.length > 0) {
          throw new Error(result.errors.map((e) => e.text).join('\n'));
        }

        const outFiles = await fs.readdir(outDir);
        const jsOut = outFiles.find((f) => f.endsWith('.js'));
        const cssOut = outFiles.find((f) => f.endsWith('.css'));
        if (jsOut) {
          jsBundle = await fs.readFile(path.join(outDir, jsOut), 'utf8');
        }
        if (cssOut) {
          cssBundle += '\n' + (await fs.readFile(path.join(outDir, cssOut), 'utf8'));
        }
        logs.push(`[preview:${sessionId}] Bundle ready (${Buffer.byteLength(jsBundle, 'utf8')} bytes JS).`);
      } else {
        logs.push(`[preview:${sessionId}] Static HTML/CSS mode (no JS entry found).`);
      }

      const baseHtml =
        htmlFile?.content ||
        `<!doctype html><html><head><meta charset="utf-8"><title>ACS Live Preview</title></head><body><div id="root"></div></body></html>`;

      // Inject CSS, Console Bridge, and JS bundle cleanly without external fragile script tags
      let assembledHtml = baseHtml
        .replace(/<script[^>]*type=["']module["'][^>]*src=["'](?:\.?\/)?(?:src\/)?[^"']+["'][^>]*><\/script>/gi, '')
        .replace(/<link[^>]*href=["'][^"']*\.css["'][^>]*>/gi, '');

      const headInject = `${PREVIEW_BRIDGE_SCRIPT}<style>${cssBundle}</style>`;
      assembledHtml = assembledHtml.includes('</head>')
        ? assembledHtml.replace('</head>', `${headInject}</head>`)
        : `<head>${headInject}</head>${assembledHtml}`;

      const safeJsBundle = jsBundle.replace(/<\/script/gi, '<\\/script');
      const bodyInject = `<script>${safeJsBundle}</script>`;
      assembledHtml = assembledHtml.includes('</body>')
        ? assembledHtml.replace('</body>', `${bodyInject}</body>`)
        : `${assembledHtml}${bodyInject}`;

      const previewUrl = `/preview/${sessionId}/index.html`;
      const state: PreviewSessionState = {
        sessionId,
        projectId,
        status: 'running',
        previewUrl,
        logs,
        errorMessage: null,
        startedAt: new Date().toISOString(),
      };

      this.sessions.set(sessionId, {
        state,
        ownerUid,
        htmlContent: assembledHtml,
        jsBundle,
        cssBundle,
        expiresAt: Date.now() + 1000 * 60 * 30,
      });

      updateStatus(state);
      return state;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`[preview:error] ${message}`);
      const errState: PreviewSessionState = {
        sessionId,
        projectId,
        status: 'error',
        previewUrl: null,
        logs,
        errorMessage: message,
        startedAt: new Date().toISOString(),
      };
      this.sessions.set(sessionId, {
        state: errState,
        ownerUid,
        htmlContent: `<!doctype html><html><body style="font-family:monospace;background:#111827;color:#fca5a5;padding:24px;"><h2>Preview Build Error</h2><pre>${message.replace(/</g, '&lt;')}</pre></body></html>`,
        jsBundle: '',
        cssBundle: '',
        expiresAt: Date.now() + 1000 * 60 * 10,
      });
      updateStatus(errState);
      return errState;
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  getActiveSessionForProject(ownerUid: string, projectId: number): PreviewSessionState | null {
    this.cleanupExpired();
    for (const session of this.sessions.values()) {
      if (session.ownerUid === ownerUid && session.state.projectId === projectId) {
        return session.state;
      }
    }
    return null;
  }

  getSessionAsset(sessionId: string): { html: string } | null {
    this.cleanupExpired();
    const found = this.sessions.get(sessionId);
    if (!found) return null;
    found.expiresAt = Date.now() + 1000 * 60 * 30;
    return { html: found.htmlContent };
  }

  stopProjectPreview(ownerUid: string, projectId: number): PreviewSessionState {
    for (const [sid, session] of this.sessions.entries()) {
      if (session.ownerUid === ownerUid && session.state.projectId === projectId) {
        this.sessions.delete(sid);
      }
    }
    const stopped: PreviewSessionState = {
      sessionId: 'stopped',
      projectId,
      status: 'stopped',
      previewUrl: null,
      logs: ['[preview] Session stopped and cleaned up.'],
      errorMessage: null,
      startedAt: new Date().toISOString(),
    };
    studioEventBus.emitStudioEvent({
      ownerUid,
      projectId,
      type: 'preview:status',
      message: 'Preview stopped',
      data: { ...stopped },
    });
    return stopped;
  }

  private cleanupExpired() {
    const now = Date.now();
    for (const [sid, session] of this.sessions.entries()) {
      if (session.expiresAt < now) {
        this.sessions.delete(sid);
      }
    }
  }
}

export const previewManager = new PreviewManager();
