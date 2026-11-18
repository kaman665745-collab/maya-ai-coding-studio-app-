import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChangesToSnapshot,
  inferLanguageFromPath,
  redactSecrets,
  sanitizeProjectPath,
  validateAndPrepareProposals,
} from './diff.ts';

test('sanitizeProjectPath blocks path traversal and protected files', () => {
  assert.equal(sanitizeProjectPath('/src/App.tsx'), 'src/App.tsx');
  assert.equal(sanitizeProjectPath('src\\utils\\math.ts'), 'src/utils/math.ts');
  assert.throws(() => sanitizeProjectPath('../etc/passwd'), /Path traversal/);
  assert.throws(() => sanitizeProjectPath('.env.local'), /protected path segment/);
  assert.throws(() => sanitizeProjectPath('.git/config'), /protected path segment/);
  assert.throws(() => sanitizeProjectPath('C:\\Windows\\system32'), /Invalid file path/);
});

test('redactSecrets strips API keys, bearer tokens, and passwords', () => {
  const raw = 'GEMINI_API_KEY="AIzaSyFakeKey123456789012345678901" Authorization: Bearer abc.def.ghi';
  const cleaned = redactSecrets(raw);
  assert.equal(cleaned.includes('AIzaSyFakeKey'), false);
  assert.equal(cleaned.includes('abc.def.ghi'), false);
  assert.equal(cleaned.includes('[REDACTED]'), true);
  assert.equal(cleaned.includes('Bearer [REDACTED_TOKEN]'), true);
});

test('validateAndPrepareProposals produces unified diff and applyChangesToSnapshot updates cleanly', () => {
  const existing = {
    'src/App.tsx': { content: 'export const x = 1;\n', language: 'typescript' },
    'src/old.ts': { content: 'export const old = true;\n', language: 'typescript' },
  };

  const proposals = validateAndPrepareProposals(
    [
      {
        path: 'src/App.tsx',
        action: 'update',
        proposedContent: 'export const x = 2;\n',
        rationale: 'Bump value to 2',
      },
      {
        path: 'src/newFile.ts',
        action: 'create',
        proposedContent: 'export const added = true;\n',
        rationale: 'Add helper',
      },
      {
        path: 'src/old.ts',
        action: 'delete',
        rationale: 'Remove unused file',
      },
    ],
    existing
  );

  assert.equal(proposals.length, 3);
  assert.equal(proposals[0].unifiedDiff.includes('-export const x = 1;'), true);
  assert.equal(proposals[0].unifiedDiff.includes('+export const x = 2;'), true);

  const next = applyChangesToSnapshot(existing, proposals);
  assert.equal(next['src/App.tsx'].content, 'export const x = 2;\n');
  assert.equal(next['src/newFile.ts'].content, 'export const added = true;\n');
  assert.equal(next['src/old.ts'], undefined);
  assert.equal(inferLanguageFromPath('src/styles.css'), 'css');
});
