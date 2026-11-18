import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluatePasswordStrength,
  isValidEmail,
  mapFirebaseAuthError,
  parseCookieHeader,
  sanitizeRedirectPath,
  validateFullName,
} from './auth';

test('isValidEmail accepts standard emails and rejects malformed values', () => {
  assert.equal(isValidEmail('developer@example.com'), true);
  assert.equal(isValidEmail('  alex.kim+acs@company.io '), true);
  assert.equal(isValidEmail('not-an-email'), false);
  assert.equal(isValidEmail('missing@domain'), false);
  assert.equal(isValidEmail(''), false);
});

test('validateFullName enforces realistic bounds', () => {
  assert.equal(validateFullName('A'), 'Full name must be at least 2 characters.');
  assert.equal(validateFullName('Deepak Yadav'), null);
});

test('evaluatePasswordStrength checks length and character variety', () => {
  assert.equal(evaluatePasswordStrength('short').valid, false);
  assert.equal(evaluatePasswordStrength('alllowercase1').valid, false);
  assert.equal(evaluatePasswordStrength('NoDigitsHere').valid, false);
  const strong = evaluatePasswordStrength('StudioPass2026');
  assert.equal(strong.valid, true);
  assert.equal(strong.score, 4);
  assert.equal(strong.message, null);
});

test('sanitizeRedirectPath blocks open redirects and auth-page loops', () => {
  assert.equal(sanitizeRedirectPath('/profile'), '/profile');
  assert.equal(sanitizeRedirectPath('/review'), '/review');
  assert.equal(sanitizeRedirectPath('//evil.example.com'), '/');
  assert.equal(sanitizeRedirectPath('https://evil.example.com'), '/');
  assert.equal(sanitizeRedirectPath('/login'), '/');
  assert.equal(sanitizeRedirectPath(null), '/');
});

test('parseCookieHeader extracts cookie pairs safely', () => {
  const cookies = parseCookieHeader('foo=bar; acs_session=tok%2E123; theme=dark');
  assert.equal(cookies.foo, 'bar');
  assert.equal(cookies.acs_session, 'tok.123');
  assert.equal(cookies.theme, 'dark');
  assert.deepEqual(parseCookieHeader(undefined), {});
});

test('mapFirebaseAuthError maps known Firebase codes cleanly', () => {
  assert.match(
    mapFirebaseAuthError({ code: 'auth/invalid-credential' }),
    /Invalid email address or password/
  );
  assert.match(
    mapFirebaseAuthError({ code: 'auth/email-already-in-use' }),
    /already exists/
  );
  assert.match(
    mapFirebaseAuthError({ code: 'auth/expired-action-code' }),
    /expired/
  );
});
