import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonSafely, normalizeSeverity, resolveModelForRole } from './agents.ts';

test('resolveModelForRole respects custom overrides and enforces model constraints', () => {
  const resolved = resolveModelForRole('tester', [
    {
      id: 1,
      agentRole: 'tester',
      provider: 'gemini',
      modelId: 'gemini-3.1-flash-lite',
      thinkingLevel: 'HIGH',
      searchGrounding: false,
      isDefault: false,
    },
  ]);

  assert.equal(resolved.modelId, 'gemini-3.1-flash-lite');
  assert.equal(resolved.thinkingLevel, 'LOW');

  const fallback = resolveModelForRole('planner', []);
  assert.equal(fallback.modelId, 'gemini-4-hydrogen');
  assert.equal(fallback.thinkingLevel, 'HIGH');
  assert.equal(fallback.searchGrounding, true);
});

test('extractJsonSafely handles fenced JSON and invalid JSON gracefully', () => {
  const parsed = extractJsonSafely<{ ok: boolean }>('```json\n{"ok":true}\n```', { ok: false });
  assert.equal(parsed.ok, true);

  const fallback = extractJsonSafely<{ ok: boolean }>('not json', { ok: false });
  assert.equal(fallback.ok, false);
  assert.equal(normalizeSeverity('CRITICAL'), 'critical');
  assert.equal(normalizeSeverity('unknown'), 'medium');
});
