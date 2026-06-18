const assert = require('node:assert/strict');
const test = require('node:test');

const {
  mapRefreshSessionRow,
  createPostgresRefreshSessionRepository,
} = require('../../../src/modules/auth/refresh-session.repository');

test('postgres refresh session rows map to auth session shape', () => {
  const session = mapRefreshSessionRow({
    id: 'session-1',
    user_id: 'user-1',
    token_hash: 'hash',
    created_at: new Date('2026-06-18T00:00:00.000Z'),
    expires_at: new Date('2026-07-18T00:00:00.000Z'),
    revoked_at: null,
  });

  assert.deepEqual(session, {
    sessionId: 'session-1',
    userId: 'user-1',
    tokenHash: 'hash',
    createdAt: '2026-06-18T00:00:00.000Z',
    expiresAt: '2026-07-18T00:00:00.000Z',
    revokedAt: null,
  });
});

test('postgres refresh repository writes hashed sessions and deletes by id', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    if (strings.join('').includes('select')) {
      return [{
        id: 'session-1',
        user_id: 'user-1',
        token_hash: 'hash',
        created_at: new Date('2026-06-18T00:00:00.000Z'),
        expires_at: new Date('2026-07-18T00:00:00.000Z'),
        revoked_at: null,
      }];
    }
    return [];
  };
  const repository = createPostgresRefreshSessionRepository(sql);

  await repository.store({
    sessionId: 'session-1',
    userId: 'user-1',
    tokenHash: 'hash',
    createdAt: '2026-06-18T00:00:00.000Z',
    expiresAt: '2026-07-18T00:00:00.000Z',
  });
  assert.equal((await repository.findById('session-1')).userId, 'user-1');
  await repository.deleteById('session-1');

  assert.match(calls[0].query, /insert into refresh_sessions/i);
  assert.match(calls[2].query, /update refresh_sessions/i);
});
