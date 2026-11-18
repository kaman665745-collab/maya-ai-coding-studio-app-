import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerV1Routes } from './routes/v1.ts';
import { createSessionToken, SESSION_COOKIE_NAME } from './services/sessionCookie.ts';

async function createTestApp() {
  const app = Fastify({ logger: false });
  await app.register(registerV1Routes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

const TEST_SESSION_TOKEN = createSessionToken({
  uid: 'integration-test-user',
  email: 'qa@acs-studio.test',
  displayName: 'QA Engineer',
  avatarUrl: null,
  emailVerified: true,
  authProvider: 'password',
  isDemo: false,
});

const AUTH_HEADERS = {
  cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(TEST_SESSION_TOKEN)}`,
};

test('GET /api/v1/health returns ok status', async () => {
  const app = await createTestApp();
  try {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
    });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.version, 'v1');
  } finally {
    await app.close();
  }
});

test('Protected endpoints reject unauthenticated, spoofed demo header, and tampered cookie requests with 401', async () => {
  const app = await createTestApp();
  try {
    const unauth = await app.inject({ method: 'GET', url: '/api/v1/session' });
    assert.equal(unauth.statusCode, 401);

    const spoofedDemo = await app.inject({
      method: 'GET',
      url: '/api/v1/session',
      headers: { 'x-acs-workspace-mode': 'demo' },
    });
    assert.equal(spoofedDemo.statusCode, 401);

    const tamperedCookie = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { cookie: `${SESSION_COOKIE_NAME}=forged.signature` },
    });
    assert.equal(tamperedCookie.statusCode, 401);

    const badToken = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/session',
      headers: { 'content-type': 'application/json' },
      payload: { idToken: 'not-a-valid-firebase-id-token-at-all', rememberMe: false },
    });
    assert.equal(badToken.statusCode, 401);
  } finally {
    await app.close();
  }
});

test('Authenticated session lifecycle: profile read/update, project CRUD, traversal guard, checkpoint, sandbox build & test, rollback, logout', async () => {
  const app = await createTestApp();
  let createdProjectId: number | null = null;
  try {
    // 1. Bootstrap authenticated session & check profile
    const sessionRes = await app.inject({
      method: 'GET',
      url: '/api/v1/session',
      headers: AUTH_HEADERS,
    });
    assert.equal(sessionRes.statusCode, 200);
    const sessionBody = sessionRes.json();
    assert.equal(sessionBody.user.uid, 'integration-test-user');
    assert.ok(sessionBody.projects.length >= 1, 'Expected seeded starter project');

    const meRes = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: AUTH_HEADERS,
    });
    assert.equal(meRes.statusCode, 200);
    assert.equal(meRes.json().user.email, 'qa@acs-studio.test');

    const profileRes = await app.inject({
      method: 'PATCH',
      url: '/api/v1/auth/profile',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: { displayName: 'Updated QA Engineer' },
    });
    assert.equal(profileRes.statusCode, 200);
    assert.equal(profileRes.json().user.displayName, 'Updated QA Engineer');

    // 2. Create project
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/projects',
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: {
        name: `Integration Verification ${Date.now()}`,
        description: 'Ephemeral integration test project',
        template: 'node-api-ts',
      },
    });
    assert.equal(createRes.statusCode, 201);
    const createdProject = createRes.json();
    createdProjectId = createdProject.id;
    assert.ok(createdProjectId && createdProjectId > 0);

    // 3. Reject path traversal on file PUT
    const traversalRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${createdProjectId}/files`,
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: {
        path: '../../etc/passwd',
        content: 'blocked',
      },
    });
    assert.equal(traversalRes.statusCode, 400);

    // 4. Create checkpoint before edit
    const cpRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${createdProjectId}/checkpoints`,
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: {
        label: 'Before API edit',
        reason: 'Integration test snapshot',
      },
    });
    assert.equal(cpRes.statusCode, 201);
    const cp = cpRes.json();

    // 5. Upsert valid file change
    const upsertRes = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${createdProjectId}/files`,
      headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
      payload: {
        path: 'src/math.ts',
        content: 'export function add(a: number, b: number) { return a + b; }\n',
        commitMessage: 'Add math helper',
      },
    });
    assert.equal(upsertRes.statusCode, 200);

    // 6. Run isolated sandbox build check
    const buildRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${createdProjectId}/builds/run`,
      headers: AUTH_HEADERS,
    });
    assert.equal(buildRes.statusCode, 200);
    assert.equal(buildRes.json().status, 'passed');

    // 7. Run isolated sandbox tests
    const testRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${createdProjectId}/tests/run`,
      headers: AUTH_HEADERS,
    });
    assert.equal(testRes.statusCode, 200);
    const testBody = testRes.json();
    assert.equal(testBody.status, 'passed');
    assert.ok(testBody.passedCount >= 1);

    // 8. Rollback checkpoint and verify src/math.ts is removed
    const rollbackRes = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${createdProjectId}/checkpoints/${cp.id}/rollback`,
      headers: AUTH_HEADERS,
    });
    assert.equal(rollbackRes.statusCode, 200);

    const filesAfterRollback = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${createdProjectId}/files`,
      headers: AUTH_HEADERS,
    });
    assert.equal(filesAfterRollback.statusCode, 200);
    const paths = filesAfterRollback.json().items.map((f: { path: string }) => f.path);
    assert.equal(paths.includes('src/math.ts'), false);

    // 9. Logout clears cookie
    const logoutRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
    });
    assert.equal(logoutRes.statusCode, 200);
    const setCookieHeader = String(logoutRes.headers['set-cookie'] || '');
    assert.match(setCookieHeader, /Max-Age=0/);
  } finally {
    if (createdProjectId) {
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/projects/${createdProjectId}`,
        headers: AUTH_HEADERS,
      });
    }
    await app.close();
  }
});
