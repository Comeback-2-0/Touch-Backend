const assert = require('node:assert/strict');
const test = require('node:test');
const {getUnreadCountWithFallback} = require('../../../src/modules/notifications/notification.controller');

test('notification unread count falls back to canonical MongoDB when Redis is unavailable', async () => {
  const result = await getUnreadCountWithFallback('user-1', {
    redisConnector: async () => { throw new Error('Redis unavailable'); },
    fallback: async userId => {
      assert.equal(userId, 'user-1');
      return 4;
    },
  });

  assert.equal(result, 4);
});

test('notification unread count uses Redis when the cache is available', async () => {
  const result = await getUnreadCountWithFallback('user-1', {
    redisConnector: async () => ({name: 'redis'}),
    readCache: async (redis, userId) => {
      assert.deepEqual(redis, {name: 'redis'});
      assert.equal(userId, 'user-1');
      return 2;
    },
    fallback: async () => 9,
  });

  assert.equal(result, 2);
});
