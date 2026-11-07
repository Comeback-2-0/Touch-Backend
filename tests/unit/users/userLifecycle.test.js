const assert = require('node:assert/strict');
const test = require('node:test');
const {
  buildLifecyclePayload,
  lifecycleEventId,
  enqueueUserLifecycleEvents,
} = require('../../../src/modules/users/user-lifecycle.service');

const user = {
  id: 'user-1',
  name: 'Roy Be',
  username: 'roy_be',
  profilePicture: 'https://cdn.example.com/roy.jpg',
  isProfileComplete: true,
  updatedAt: '2026-11-07T10:00:00.000Z',
};

test('user lifecycle payload contains the searchable projection and active state', () => {
  assert.deepEqual(buildLifecyclePayload(user), {
    id: 'user-1',
    name: 'Roy Be',
    username: 'roy_be',
    profilePicture: 'https://cdn.example.com/roy.jpg',
    isProfileComplete: true,
    accountActive: true,
    updatedAt: '2026-11-07T10:00:00.000Z',
  });
});

test('the same lifecycle event produces stable idempotency keys', () => {
  assert.equal(lifecycleEventId(user, 'upsert'), lifecycleEventId(user, 'upsert'));
  assert.notEqual(lifecycleEventId(user, 'upsert'), lifecycleEventId(user, 'delete'));
});

test('lifecycle events are emitted only to the graph outbox because search reads PostgreSQL directly', async () => {
  const graph = [];
  const result = await enqueueUserLifecycleEvents({
    user,
    graphOutbox: {enqueue: async event => graph.push(event)},
  });

  assert.equal(result.graph, true);
  assert.equal(graph.length, 1);
  assert.equal(result.index, undefined);
  assert.equal(graph[0].operation, 'upsert');
});

test('deactivation emits delete events and marks the projection inactive', async () => {
  const events = [];
  await enqueueUserLifecycleEvents({
    user,
    operation: 'delete',
    graphOutbox: {enqueue: async event => events.push(event)},
  });

  assert.equal(events[0].operation, 'delete');
  assert.equal(events[0].payload.accountActive, false);
});

test('graph outbox construction failure does not fail the committed profile mutation', async () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const result = await enqueueUserLifecycleEvents({user, logger: {warn() {}}});
    assert.equal(result.graph, false);
    assert.equal(result.payload.id, 'user-1');
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
});

