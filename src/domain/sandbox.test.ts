import test from 'node:test';
import assert from 'node:assert/strict';
import { clampSandboxLimits, sanitizeSandboxEnv, validateSandboxCommand } from './sandbox.ts';

test('validateSandboxCommand enforces allowlist and blocks shell injection', () => {
  assert.equal(validateSandboxCommand('node test.mjs').valid, true);
  assert.equal(validateSandboxCommand('esbuild src/main.tsx --bundle').valid, true);
  assert.equal(validateSandboxCommand('curl https://evil.example').valid, false);
  assert.equal(validateSandboxCommand('node index.js; rm -rf /').valid, false);
  assert.equal(validateSandboxCommand('bash -c "whoami"').valid, false);
});

test('sanitizeSandboxEnv strips all secret environment variables', () => {
  const clean = sanitizeSandboxEnv({
    PATH: '/usr/bin',
    GEMINI_API_KEY: 'secret-key',
    SQL_PASSWORD: 'db-password',
    MY_CUSTOM_TOKEN: 'tok-123',
    PUBLIC_FLAG: 'yes',
  });

  assert.equal(clean.GEMINI_API_KEY, undefined);
  assert.equal(clean.SQL_PASSWORD, undefined);
  assert.equal(clean.MY_CUSTOM_TOKEN, undefined);
  assert.equal(clean.PUBLIC_FLAG, 'yes');
  assert.equal(clean.ACS_SANDBOX, 'isolated');
  assert.equal(clean.NODE_OPTIONS?.includes('--max-old-space-size='), true);
});

test('clampSandboxLimits keeps resource boundaries within safe caps', () => {
  const limits = clampSandboxLimits({ timeoutMs: 999999, memoryMb: 4096, cpuMillicores: 9999 });
  assert.equal(limits.timeoutMs, 30000);
  assert.equal(limits.memoryMb, 512);
  assert.equal(limits.cpuMillicores, 1000);
});
