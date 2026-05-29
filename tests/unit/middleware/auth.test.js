const assert = require('node:assert/strict');
const test = require('node:test');

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.ACCESS_TOKEN_EXPIRES_IN = '15m';

const auth = require('../../../src/middleware/auth');
const { createAccessToken } = require('../../../src/modules/auth/auth.tokens');

function runMiddleware(headers = {}) {
  const req = { headers };
  let statusCode;
  let body;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };

  auth(req, res, () => {
    nextCalled = true;
  });

  return { req, statusCode, body, nextCalled };
}

test('rejects requests without bearer token', () => {
  const result = runMiddleware();

  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.match(result.body.error, /authorization/i);
});

test('rejects invalid bearer tokens', () => {
  const result = runMiddleware({ authorization: 'Bearer invalid-token' });

  assert.equal(result.statusCode, 401);
  assert.equal(result.nextCalled, false);
  assert.match(result.body.error, /invalid/i);
});

test('attaches authenticated user from valid access token', () => {
  const token = createAccessToken({
    userId: 'user-123',
    email: 'maya@example.com',
    role: 'user',
    sessionId: 'session-123',
  });

  const result = runMiddleware({ authorization: `Bearer ${token}` });

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.id, 'user-123');
  assert.equal(result.req.user.email, 'maya@example.com');
  assert.equal(result.req.user.role, 'user');
  assert.equal(result.req.user.sessionId, 'session-123');
});
