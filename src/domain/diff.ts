import crypto from 'node:crypto';
import { createTwoFilesPatch } from 'diff';
import type { ProposedFileChange } from './types.ts';

const FORBIDDEN_SEGMENTS = new Set(['.git', 'node_modules', '.env', '.env.local', '.env.production']);
const MAX_PATH_LENGTH = 240;
const MAX_FILE_BYTES = 512 * 1024;

export function sanitizeProjectPath(rawPath: string): string {
  if (typeof rawPath !== 'string') {
    throw new Error('File path must be a string.');
  }
  const normalized = rawPath.replace(/\\/g, '/').trim().replace(/^\/+/, '');
  if (!normalized || normalized.length > MAX_PATH_LENGTH) {
    throw new Error('File path is empty or exceeds maximum length.');
  }
  if (normalized.includes('\0') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`Invalid file path: ${rawPath}`);
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    throw new Error('File path cannot be empty.');
  }
  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error(`Path traversal is not allowed: ${rawPath}`);
    }
    if (FORBIDDEN_SEGMENTS.has(part) || part.startsWith('.env.')) {
      throw new Error(`Access to protected path segment "${part}" is prohibited.`);
    }
  }
  return parts.join('/');
}

export function inferLanguageFromPath(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.tsx') || lower.endsWith('.ts')) return 'typescript';
  if (lower.endsWith('.jsx') || lower.endsWith('.js') || lower.endsWith('.mjs')) return 'javascript';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.sql')) return 'sql';
  return 'plaintext';
}

export function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function redactSecrets(input: string): string {
  if (!input) return input;
  return input
    .replace(/(GEMINI_API_KEY|API_KEY|SQL_PASSWORD|SQL_ADMIN_PASSWORD)\s*[:=]\s*["']?[^\s"'\n]+["']?/gi, '$1=[REDACTED]')
    .replace(/AIza[0-9A-Za-z\-_]{25,}/g, '[REDACTED_GOOGLE_KEY]')
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/ya29\.[0-9A-Za-z\-_]+/g, '[REDACTED_OAUTH_TOKEN]');
}

export function buildUnifiedDiff(
  filePath: string,
  originalContent: string,
  proposedContent: string
): string {
  const safePath = sanitizeProjectPath(filePath);
  return createTwoFilesPatch(
    `a/${safePath}`,
    `b/${safePath}`,
    originalContent,
    proposedContent,
    'before',
    'after',
    { context: 3 }
  );
}

export interface FileEntryMap {
  [path: string]: { content: string; language: string };
}

export function validateAndPrepareProposals(
  rawChanges: Array<{
    path: string;
    action: 'create' | 'update' | 'delete';
    proposedContent?: string;
    rationale?: string;
  }>,
  existingFiles: FileEntryMap
): ProposedFileChange[] {
  if (!Array.isArray(rawChanges) || rawChanges.length === 0) {
    throw new Error('Edit proposal must include at least one file change.');
  }

  const seen = new Set<string>();
  const prepared: ProposedFileChange[] = [];

  for (const item of rawChanges) {
    const safePath = sanitizeProjectPath(item.path);
    if (seen.has(safePath)) {
      throw new Error(`Duplicate file path in proposal: ${safePath}`);
    }
    seen.add(safePath);

    const existing = existingFiles[safePath];
    const originalContent = existing ? existing.content : '';
    const proposedContent = item.action === 'delete' ? '' : String(item.proposedContent ?? '');

    if (Buffer.byteLength(proposedContent, 'utf8') > MAX_FILE_BYTES) {
      throw new Error(`Proposed file "${safePath}" exceeds 512 KB safety limit.`);
    }

    if (item.action === 'create' && existing) {
      // Normalize to update if file already exists
      item.action = 'update';
    }
    if (item.action === 'delete' && !existing) {
      throw new Error(`Cannot delete non-existent file: ${safePath}`);
    }

    const language = existing?.language || inferLanguageFromPath(safePath);
    const unifiedDiff = buildUnifiedDiff(safePath, originalContent, proposedContent);

    prepared.push({
      path: safePath,
      action: item.action,
      language,
      originalContent,
      proposedContent,
      unifiedDiff,
      rationale: item.rationale?.trim() || 'Proposed change',
    });
  }

  return prepared;
}

export function applyChangesToSnapshot(
  existingFiles: FileEntryMap,
  changes: ProposedFileChange[]
): FileEntryMap {
  const nextFiles: FileEntryMap = {};
  for (const [k, v] of Object.entries(existingFiles)) {
    nextFiles[k] = { ...v };
  }

  for (const change of changes) {
    const safePath = sanitizeProjectPath(change.path);
    if (change.action === 'delete') {
      delete nextFiles[safePath];
    } else {
      nextFiles[safePath] = {
        content: change.proposedContent,
        language: change.language || inferLanguageFromPath(safePath),
      };
    }
  }

  return nextFiles;
}
