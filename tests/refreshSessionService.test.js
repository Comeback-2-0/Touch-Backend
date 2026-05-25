const assert = require('node:assert/strict');
const test = require('node:test');

process.env.REFRESH_TOKEN_EXPIRES_IN = '30d';

const {
  storeRefreshSession,
  getRefreshSession,
  deleteRefreshSession,
  refreshSessionKey,
} = require('../services/refreshSessionService');
const { hashToken } = require('../services/tokenService');

function createMemoryRedis() {
  const values = new Map();
  return {
    values,
    async setEx(key, ttlSeconds, value) {
      values.set(key, { ttlSeconds, value });
    },
    async get(key) {
      return values.get(key)?.value || null;
    },
    async del(key) {
      return values.delete(key) ? 1 : 0;
    },
  };
}

test('stores refresh sessions using hashed token values', async () => {
  const redis = createMemoryRedis();

  await storeRefreshSession(redis, {
    sessionId: 'session-123',
    userId: 'user-123',
    refreshToken: 'plain-refresh-token',
  });

  const stored = JSON.parse(redis.values.get(refreshSessionKey('session-123')).value);

  assert.equal(stored.userId, 'user-123');
  assert.equal(stored.tokenHash, hashToken('plain-refresh-token'));
  assert.notEqual(stored.tokenHash, 'plain-refresh-token');
  assert.ok(stored.createdAt);
  assert.ok(stored.expiresAt);
});

test('returns stored refresh sessions', async () => {
  const redis = createMemoryRedis();
  await storeRefreshSession(redis, {
    sessionId: 'session-123',
    userId: 'user-123',
    refreshToken: 'refresh-token',
  });

  const session = await getRefreshSession(redis, 'session-123');

  assert.equal(session.userId, 'user-123');
  assert.equal(session.tokenHash, hashToken('refresh-token'));
});

test('deletes refresh sessions', async () => {
  const redis = createMemoryRedis();
  await storeRefreshSession(redis, {
    sessionId: 'session-123',
    userId: 'user-123',
    refreshToken: 'refresh-token',
  });

  await deleteRefreshSession(redis, 'session-123');

  assert.equal(await getRefreshSession(redis, 'session-123'), null);
});
