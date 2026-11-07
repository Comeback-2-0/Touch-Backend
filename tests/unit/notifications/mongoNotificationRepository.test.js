const assert = require('node:assert/strict');
const test = require('node:test');
const {createNotificationRepository} = require('../../../src/modules/notifications/mongo-notification.repository');

test('idempotent notification creation returns the canonical row without a duplicate insert', async () => {
  let stored = null;
  let creates = 0;
  const model = {
    async findOne() { return stored; },
    async create(input) { creates += 1; stored = {...input, id: `n-${creates}`}; return stored; },
  };
  const repository = createNotificationRepository(model);
  const input = {userId: 'b', type: 'follow', dedupeKey: 'follow:a:b'};

  const first = await repository.createIdempotent(input);
  const second = await repository.createIdempotent(input);

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.notification.id, second.notification.id);
  assert.equal(creates, 1);
});

test('a concurrent duplicate-key race resolves to the canonical notification', async () => {
  let lookupCount = 0;
  const canonical = {id: 'n-1', dedupeKey: 'follow:a:b'};
  const model = {
    async findOne() {
      lookupCount += 1;
      return lookupCount > 1 ? canonical : null;
    },
    async create() {
      const error = new Error('duplicate');
      error.code = 11000;
      throw error;
    },
  };
  const result = await createNotificationRepository(model).createIdempotent({
    userId: 'b',
    type: 'follow',
    dedupeKey: 'follow:a:b',
  });

  assert.deepEqual(result, {notification: canonical, created: false});
});

