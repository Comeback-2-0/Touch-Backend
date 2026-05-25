const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.ACCESS_TOKEN_EXPIRES_IN = '15m';
process.env.REFRESH_TOKEN_EXPIRES_IN = '30d';

const {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
} = require('../services/tokenService');

test('creates verifiable access tokens with backend user identity', () => {
  const token = createAccessToken({
    userId: 'user-123',
    email: 'maya@example.com',
    role: 'user',
    sessionId: 'session-123',
  });

  const decoded = verifyAccessToken(token);

  assert.equal(decoded.sub, 'user-123');
  assert.equal(decoded.email, 'maya@example.com');
  assert.equal(decoded.role, 'user');
  assert.equal(decoded.sessionId, 'session-123');
  assert.equal(decoded.type, 'access');
});

test('creates verifiable refresh tokens scoped to a session', () => {
  const token = createRefreshToken({
    userId: 'user-123',
    sessionId: 'session-123',
  });

  const decoded = verifyRefreshToken(token);

  assert.equal(decoded.sub, 'user-123');
  assert.equal(decoded.sessionId, 'session-123');
  assert.equal(decoded.type, 'refresh');
});

test('hashToken creates stable non-plain-text token hashes', () => {
  const token = 'refresh-token-value';

  assert.equal(hashToken(token), hashToken(token));
  assert.notEqual(hashToken(token), token);
});
