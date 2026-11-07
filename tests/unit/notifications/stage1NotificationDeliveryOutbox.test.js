const assert = require('node:assert/strict');
const test = require('node:test');

const DeliveryOutbox = require('../../../src/modules/notifications/notification-delivery-outbox.model');
const {createStage1NotificationDeliveryOutboxRunner} = require('../../../src/jobs/stage1NotificationDeliveryOutbox');
const {createNotificationService} = require('../../../src/modules/notifications/notification.service');

test('Stage 1 delivery outbox has durable retry fields and a dedupe key', () => {
  assert.equal(DeliveryOutbox.schema.path('notificationId').options.required, true);
  assert.equal(DeliveryOutbox.schema.path('channel').options.default, 'push');
  assert.equal(DeliveryOutbox.schema.path('status').options.default, 'pending');
  assert.equal(DeliveryOutbox.schema.path('attempts').options.default, 0);
  assert.equal(DeliveryOutbox.schema.path('dedupeKey').options.unique, true);
  assert.equal(DeliveryOutbox.schema.path('nextAttemptAt').options.required, true);
});

test('Stage 1 delivery runner claims, sends, and marks the durable row delivered', async () => {
  const calls = [];
  const repository = {
    async listPending() {
      return [{id: 'delivery-1', notificationId: 'notification-1', userId: 'user-1', type: 'follow', attempts: 1}];
    },
    async claim(id) {
      calls.push(['claim', id]);
      return {id, notificationId: 'notification-1', userId: 'user-1', type: 'follow', attempts: 2};
    },
    async markDelivered(id) { calls.push(['delivered', id]); },
    async markFailed(id) { calls.push(['failed', id]); },
  };
  const deliver = async input => calls.push(['deliver', input]);

  await createStage1NotificationDeliveryOutboxRunner({repository, deliver})();

  assert.deepEqual(calls.map(call => call[0]), ['claim', 'deliver', 'delivered']);
  assert.equal(calls[1][1].userId, 'user-1');
  assert.equal(calls[1][1].type, 'follow');
});

test('Stage 1 delivery runner leaves a failed push pending for retry', async () => {
  const calls = [];
  const repository = {
    async listPending() { return [{id: 'delivery-2', notificationId: 'notification-2', attempts: 2}]; },
    async claim(id) { calls.push(['claim', id]); return {id, attempts: 3}; },
    async markDelivered(id) { calls.push(['delivered', id]); },
    async markFailed(id, error) { calls.push(['failed', id, error.message]); },
  };
  const logger = {warn() {}};

  await createStage1NotificationDeliveryOutboxRunner({
    repository,
    deliver: async () => { throw new Error('FCM unavailable'); },
    logger,
  })();

  assert.deepEqual(calls, [['claim', 'delivery-2'], ['failed', 'delivery-2', 'FCM unavailable']]);
});

test('Stage 1 delivery runner retries a partial FCM failure', async () => {
  const calls = [];
  const repository = {
    async listPending() { return [{id: 'delivery-3', notificationId: 'notification-3', attempts: 1}]; },
    async claim(id) { return {id, attempts: 2}; },
    async markDelivered(id) { calls.push(['delivered', id]); },
    async markFailed(id, error) { calls.push(['failed', id, error.message]); },
  };

  await createStage1NotificationDeliveryOutboxRunner({
    repository,
    deliver: async () => ({sent: 1, failed: 1}),
    logger: {warn() {}},
  })();

  assert.deepEqual(calls, [['failed', 'delivery-3', 'One or more push deliveries failed']]);
});

test('Stage 1 notification persistence queues push delivery instead of sending inline', async () => {
  const created = [];
  const queued = [];
  let inlineDeliveryCalls = 0;
  const service = createNotificationService({
    repository: {
      async createIdempotent(input) {
        created.push(input);
        return {created: true, notification: {_id: 'notification-1'}};
      },
    },
    deliveryOutboxRepository: {
      async enqueue(input) { queued.push(input); return input; },
    },
    redisConnector: async () => ({}),
    incrementUnread: async () => {},
    deliver: async () => { inlineDeliveryCalls += 1; },
    shouldQueuePush: async () => true,
  });

  const notification = await service.notifyUser({
    userId: 'user-2',
    type: 'follow_request',
    title: 'Follow request',
    content: 'Roy requested to follow you',
    metadata: {targetType: 'follow_requests', targetId: 'user-2'},
    dedupeKey: 'follow_request:user-1:user-2:request-1',
  });

  assert.equal(notification._id, 'notification-1');
  assert.equal(created.length, 1);
  assert.equal(inlineDeliveryCalls, 0);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].notificationId, 'notification-1');
  assert.equal(queued[0].channel, 'push');
  assert.equal(queued[0].dedupeKey, 'push:follow_request:user-1:user-2:request-1');
});

test('a retry of an existing Stage 1 notification repairs a missing delivery row', async () => {
  const queued = [];
  const service = createNotificationService({
    repository: {
      async createIdempotent() {
        return {created: false, notification: {_id: 'notification-2'}};
      },
    },
    deliveryOutboxRepository: {
      async enqueue(input) { queued.push(input); return input; },
    },
    redisConnector: async () => ({}),
    incrementUnread: async () => {},
    shouldQueuePush: async () => true,
  });

  await service.notifyUser({
    userId: 'user-2',
    type: 'follow',
    title: 'New follower',
    content: 'Roy started following you',
    dedupeKey: 'follow:user-1:user-2:event-1',
  });

  assert.equal(queued.length, 1);
  assert.equal(queued[0].notificationId, 'notification-2');
});

test('Stage 1 does not enqueue push when no eligible device or preference exists', async () => {
  const queued = [];
  const service = createNotificationService({
    repository: {
      async createIdempotent() { return {created: true, notification: {_id: 'notification-3'}}; },
    },
    deliveryOutboxRepository: {
      async enqueue(input) { queued.push(input); return input; },
    },
    redisConnector: async () => ({}),
    incrementUnread: async () => {},
    shouldQueuePush: async () => false,
  });

  await service.notifyUser({userId: 'user-2', type: 'follow', content: 'Roy started following you'});
  assert.equal(queued.length, 0);
});

test('Stage 1 does not create a follow notification when in-app notifications are disabled', async () => {
  let created = 0;
  const service = createNotificationService({
    repository: {
      async createIdempotent() { created += 1; return {created: true, notification: {_id: 'notification-disabled'}}; },
    },
    notificationPreferenceRepository: {
      async getForUser() { return {inAppEnabled: false, pushEnabled: true, preferences: {follows: true}}; },
    },
    deliveryOutboxRepository: {async enqueue() { throw new Error('must not queue push'); }},
  });

  const result = await service.notifyUser({userId: 'user-2', type: 'follow', content: 'Roy started following you'});

  assert.equal(result, null);
  assert.equal(created, 0);
});

test('Stage 1 does not queue push when the recipient disables follow push notifications', async () => {
  const queued = [];
  const service = createNotificationService({
    repository: {
      async createIdempotent() { return {created: true, notification: {_id: 'notification-no-push'}}; },
    },
    notificationPreferenceRepository: {
      async getForUser() { return {inAppEnabled: true, pushEnabled: false, preferences: {follows: true}}; },
    },
    deliveryOutboxRepository: {async enqueue(input) { queued.push(input); }},
    shouldQueuePush: async () => { throw new Error('must not query push eligibility'); },
    redisConnector: async () => ({}),
    incrementUnread: async () => {},
  });

  const result = await service.notifyUser({userId: 'user-2', type: 'follow', content: 'Roy started following you'});

  assert.equal(result._id, 'notification-no-push');
  assert.equal(queued.length, 0);
});
