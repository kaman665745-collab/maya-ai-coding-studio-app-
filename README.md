# Advanced Coding Studio (ACS)

Advanced Coding Studio is a standalone, modular AI-powered software development studio built with React 19, TypeScript (`strict: true`), Tailwind CSS v4, CodeMirror 6, Fastify v5, Drizzle ORM (PostgreSQL), Firebase Authentication, and server-side `@google/genai` Gemini orchestration. It supports Web (primary), Desktop (Tauri 2), and Android (Capacitor) via a shared platform abstraction (`src/platform/bridge.ts`).

## Key Capabilities

1. **Multi-Tab CodeMirror 6 IDE**: Syntax highlighting for TypeScript/TSX/JS, HTML, CSS, JSON, Python, and Markdown with unified diff inspection (`@codemirror/merge` / `diff`) and one-click Quick Explain (`gemini-3.1-flash-lite`).
2. **Patch-First AI Safety**: Six specialized agent roles (`planner`, `coder`, `reviewer`, `tester`, `debugger`, `docs`) powered exclusively server-side via `@google/genai`. AI agents **never** mutate workspace files directly:
   - Structured proposals generate validated diffs (`src/domain/diff.ts`).
   - User approval triggers an automatic pre-apply checkpoint.
   - Patches are verified in an ephemeral sandbox (`src/server/services/sandboxRunner.ts`) via `esbuild` and `node --test` before committing.
   - Any checkpoint can be rolled back atomically.
3. **Real Sandbox Live Preview**: Bundles project source with `esbuild` in an isolated temp workspace and serves it at `/preview/:sessionId/*` with responsive viewport controls (Desktop / Tablet / Mobile) and an integrated browser console bridge.
4. **Live Code Review**: Persisted `review_reports` and `review_findings` with severity filters (`critical`, `high`, `medium`, `low`, `info`) and status tracking (`open`, `resolved`, `ignored`).
5. **Versioned REST + SSE API (`/api/v1`)**: Fastify server with Zod input validation, rate limiting, tenant ownership checks, SSE streaming (`/api/v1/events/stream`), and structured audit logs.
6. **Google Workspace Hub**: Client-side OAuth 2.0 integration (`src/lib/workspaceApi.ts`) for Google Drive, Gmail, Sheets, Tasks, Chat, Forms, and Slides (with explicit documentation of Google Keep's Enterprise domain-wide delegation requirement).

## Architecture Overview

- `server.ts` — Fastify v5 entrypoint serving `/api/v1/*`, `/preview/:sessionId/*`, Vite middlewares (dev), and `dist/` static assets (prod).
- `src/domain/` — Pure framework-agnostic domain rules (diff validation, path traversal sanitization, secret redaction, sandbox command allowlists, agent role routing) + `node:test` suites.
- `src/db/` & `drizzle/` — Normalized 20-table PostgreSQL schema (`users`, `workspaces`, `projects`, `project_files`, `file_versions`, `conversations`, `messages`, `agent_tasks`, `agent_runs`, `review_reports`, `review_findings`, `build_runs`, `test_runs`, `environments`, `checkpoints`, `git_connections`, `plugins`, `model_configs`, `usage_records`, `audit_logs`) and versioned SQL migrations.
- `src/server/` — Auth middleware, repository layer (PostgreSQL-first with resilient local snapshot adapter when no Cloud SQL socket is reachable), object storage abstraction, SSE event bus, isolated sandbox runner, preview manager, and Gemini provider adapter.
- `src/components/` — Modular React IDE panels cleanly decoupled from AI provider specifics.
- `src-tauri/tauri.conf.json` & `capacitor.config.ts` — Desktop and Android wrapper configurations.

## Scripts

- `npm run dev` — Start Fastify + Vite dev server on port `3000`.
- `npm run build` — Build production client bundle to `dist/`.
- `npm start` — Run production Fastify server (`NODE_ENV=production`).
- `npm run lint` — TypeScript strict typecheck (`tsc --noEmit`).
- `npm test` — Run domain & API integration test suites (`tsx --test`).
