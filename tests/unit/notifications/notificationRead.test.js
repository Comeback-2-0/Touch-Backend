const assert = require('node:assert/strict');
const test = require('node:test');
const {createNotificationRepository} = require('../../../src/modules/notifications/mongo-notification.repository');

function createModel(record) {
  return {
    async findOneAndUpdate(filter, update) {
      if (filter._id !== record._id || filter.userId !== record.userId) return null;
      if (filter.seen === false && record.seen !== false) return null;
      if (filter.readAt === null && record.readAt !== null) return null;
      if (update.$set?.seen !== undefined) record.seen = update.$set.seen;
      if (update.$set?.readAt !== undefined) record.readAt = update.$set.readAt;
      return {...record};
    },
    async findOne(filter) {
      if (filter._id !== record._id || filter.userId !== record.userId) return null;
      return {...record};
    },
  };
}

test('markSeen records readAt and reports an unread transition only once', async () => {
  const record = {_id: 'n1', userId: 'u1', seen: false, readAt: null};
  const repository = createNotificationRepository(createModel(record));

  const first = await repository.markSeen('n1', 'u1');
  assert.equal(first.changed, true);
  assert.equal(first.notification.seen, true);
  assert.ok(first.notification.readAt instanceof Date);

  const second = await repository.markSeen('n1', 'u1');
  assert.equal(second.changed, false);
  assert.equal(second.notification.seen, true);
  assert.equal(second.notification.readAt, first.notification.readAt);
});

test('markSeen preserves recipient ownership and returns null for another user', async () => {
  const repository = createNotificationRepository(createModel({
    _id: 'n1', userId: 'owner', seen: false, readAt: null,
  }));

  assert.equal(await repository.markSeen('n1', 'attacker'), null);
});
