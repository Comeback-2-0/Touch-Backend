const assert = require('node:assert/strict');
const test = require('node:test');

const {
  mapNotificationPreferenceRow,
} = require('../../../src/modules/notifications/notification-preference.repository');
const {
  unreadCountKey,
  incrementUnreadCount,
} = require('../../../src/modules/notifications/notification-cache.service');

test('notification preferences are PostgreSQL-owned settings', () => {
  const preferences = mapNotificationPreferenceRow({
    user_id: 'user-1',
    push_enabled: true,
    email_enabled: false,
    in_app_enabled: true,
    muted_until: null,
    preferences: { likes: true },
    updated_at: new Date('2026-06-18T00:00:00.000Z'),
  });

  assert.deepEqual(preferences, {
    userId: 'user-1',
    pushEnabled: true,
    emailEnabled: false,
    inAppEnabled: true,
    mutedUntil: null,
    preferences: { likes: true },
    updatedAt: '2026-06-18T00:00:00.000Z',
  });
});

test('notification unread counters are Redis cache entries', async () => {
  const calls = [];
  const redis = {
    async incrBy(key, amount) {
      calls.push({ key, amount });
      return 4;
    },
  };

  const count = await incrementUnreadCount(redis, 'user-1', 2);

  assert.equal(unreadCountKey('user-1'), 'notifications:unread:user-1');
  assert.equal(count, 4);
  assert.deepEqual(calls, [{ key: 'notifications:unread:user-1', amount: 2 }]);
});
