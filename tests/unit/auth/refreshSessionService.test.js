const assert = require('node:assert/strict');
const test = require('node:test');

process.env.REFRESH_TOKEN_EXPIRES_IN = '30d';

const {
  storeRefreshSession,
  getRefreshSession,
  deleteRefreshSession,
  refreshSessionKey,
  shouldUsePostgresRefreshSessions,
} = require('../../../src/modules/auth/auth.sessions');
const { hashToken } = require('../../../src/modules/auth/auth.tokens');

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

function withEnv(overrides, fn) {
  const previous = {};
  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
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

test('stores refresh sessions in PostgreSQL source of truth and Redis cache', async () => {
  const redis = createMemoryRedis();
  const storedSessions = [];
  const repository = {
    async store(session) {
      storedSessions.push(session);
      return session;
    },
  };

  await storeRefreshSession(redis, {
    sessionId: 'session-123',
    userId: 'user-123',
    refreshToken: 'plain-refresh-token',
  }, { repository });

  assert.equal(storedSessions.length, 1);
  assert.equal(storedSessions[0].sessionId, 'session-123');
  assert.equal(storedSessions[0].tokenHash, hashToken('plain-refresh-token'));
  assert.equal(Boolean(redis.values.get(refreshSessionKey('session-123'))), true);
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

test('returns refresh sessions from PostgreSQL when Redis cache misses', async () => {
  const redis = createMemoryRedis();
  const repository = {
    async findById(sessionId) {
      return {
        sessionId,
        userId: 'user-123',
        tokenHash: hashToken('refresh-token'),
        createdAt: new Date('2026-06-18T00:00:00.000Z').toISOString(),
        expiresAt: new Date('2026-07-18T00:00:00.000Z').toISOString(),
      };
    },
  };

  const session = await getRefreshSession(redis, 'session-123', { repository });

  assert.equal(session.userId, 'user-123');
  assert.equal(session.tokenHash, hashToken('refresh-token'));
  assert.equal(Boolean(redis.values.get(refreshSessionKey('session-123'))), true);
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

test('deletes refresh sessions from PostgreSQL and Redis', async () => {
  const redis = createMemoryRedis();
  const deleted = [];
  const repository = {
    async deleteById(sessionId) {
      deleted.push(sessionId);
    },
  };
  await storeRefreshSession(redis, {
    sessionId: 'session-123',
    userId: 'user-123',
    refreshToken: 'refresh-token',
  });

  await deleteRefreshSession(redis, 'session-123', { repository });

  assert.deepEqual(deleted, ['session-123']);
  assert.equal(await getRefreshSession(redis, 'session-123'), null);
});

test('production refresh sessions cannot use Redis-only source of truth', () => {
  withEnv({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://db',
    REFRESH_SESSION_STORE: 'redis',
  }, () => {
    assert.throws(
      () => shouldUsePostgresRefreshSessions(),
      /Redis-only refresh sessions are not allowed in production/,
    );
  });
});

test('production refresh sessions require DATABASE_URL', () => {
  withEnv({
    NODE_ENV: 'production',
    DATABASE_URL: undefined,
    REFRESH_SESSION_STORE: undefined,
  }, () => {
    assert.throws(
      () => shouldUsePostgresRefreshSessions(),
      /DATABASE_URL is required in production/,
    );
  });
});
