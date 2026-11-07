const assert = require('node:assert/strict');
const test = require('node:test');
const {createStage1NotificationOutboxRunner, textFor} = require('../../../src/jobs/stage1NotificationOutbox');
const Notification = require('../../../src/modules/notifications/notification.model');

test('notification dedupe keys are enforced as a unique sparse index', () => {
  const options = Notification.schema.path('dedupeKey').options;
  assert.equal(options.unique, true);
  assert.equal(options.sparse, true);
});

test('Stage 1 follow notification copy is user-facing and typed', () => {
  assert.deepEqual(textFor('follow_request', 'Roy'), {title: 'Follow request', content: 'Roy requested to follow you'});
});

test('outbox runner claims, delivers, and marks an event exactly once', async () => {
  const calls = [];
  const repository = {
    async listPending() { return [{id: 'e1', type: 'follow', recipient_id: 'b', actor_id: 'a', target_type: 'profile', target_id: 'a', payload: {}, dedupe_key: 'follow:a:b', actor_name: 'A'}]; },
    async markProcessing(id) { calls.push(['processing', id]); return {id}; },
    async markDelivered(id) { calls.push(['delivered', id]); },
    async markFailed(id) { calls.push(['failed', id]); },
  };
  const notify = async input => calls.push(['notify', input]);
  await createStage1NotificationOutboxRunner({repository, notify})();
  assert.equal(calls[0][0], 'processing');
  assert.equal(calls[1][0], 'notify');
  assert.equal(calls[1][1].dedupeKey, 'follow:a:b');
  assert.deepEqual(calls[2], ['delivered', 'e1']);
});

test('outbox runner suppresses a relationship notification after either user blocks the other', async () => {
  const calls = [];
  const repository = {
    async listPending() { return [{id: 'e2', type: 'follow', recipient_id: 'b', actor_id: 'a'}]; },
    async markProcessing(id) { calls.push(['processing', id]); return {id}; },
    async isBlockedPair(input) {
      assert.deepEqual(input, {firstId: 'a', secondId: 'b'});
      return true;
    },
    async markSuppressed(id) { calls.push(['suppressed', id]); },
    async markDelivered(id) { calls.push(['delivered', id]); },
    async markFailed(id) { calls.push(['failed', id]); },
  };
  const notify = async () => { throw new Error('must not persist'); };

  await createStage1NotificationOutboxRunner({repository, notify})();
  assert.deepEqual(calls, [['processing', 'e2'], ['suppressed', 'e2']]);
});
