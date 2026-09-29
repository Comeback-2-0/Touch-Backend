const assert = require('node:assert/strict');
const test = require('node:test');
const admin = require('firebase-admin');
const Notification = require('../../../src/modules/notifications/notification.model');
const devices = require('../../../src/modules/notifications/notification-device.repository');

function setup(t, records, {registeredDevices, sendResult} = {}) {
  const previousCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = 'unused-test-credentials';
  t.after(() => {
    if (previousCredentials === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    else process.env.GOOGLE_APPLICATION_CREDENTIALS = previousCredentials;
  });
  const payloads = [];
  const revoked = [];
  const countQueries = [];
  t.mock.getter(admin, 'apps', () => [{}]);
  t.mock.getter(admin, 'messaging', () => () => ({
    async sendEachForMulticast(payload) {
      payloads.push(payload);
      if (sendResult) return sendResult(payload);
      return {
        successCount: payload.tokens.length, failureCount: 0,
        responses: payload.tokens.map(() => ({success: true})),
      };
    },
  }));
  t.mock.method(devices, 'createNotificationDeviceRepository', () => ({
    async listActiveForUser(userId) {
      assert.equal(userId, 'user-1');
      return registeredDevices || [{token: 'device-token', platform: 'android', appVersion: '2.3.7'}];
    },
    async revokeByToken(token) { revoked.push(token); },
  }));
  t.mock.method(Notification, 'countDocuments', async query => {
    countQueries.push(query);
    assert.deepEqual(query, {userId: 'user-1', seen: false});
    return records.filter(record => record.userId === query.userId && record.seen === query.seen).length;
  });
  const modulePath = require.resolve('../../../src/modules/notifications/notification-delivery.service');
  delete require.cache[modulePath];
  t.after(() => { delete require.cache[modulePath]; });
  const {deliverCommunityNotification} = require(modulePath);
  const deliver = () => deliverCommunityNotification({
    userId: 'user-1', type: 'community_reply', content: 'New reply',
    metadata: {communityId: 'community-1', postId: 'post-1'},
  });
  return {deliver, payloads, revoked, countQueries};
}

test('community push carries only the recipient unread total and keeps its navigation data', async t => {
  const {deliver, payloads, revoked} = setup(t, [
    {userId: 'user-1', seen: false},
    {userId: 'user-1', seen: false},
    {userId: 'user-1', seen: true},
    {userId: 'user-2', seen: false},
  ]);
  assert.deepEqual(await deliver(), {sent: 1, failed: 0});
  assert.equal(payloads[0].android?.notification?.notificationCount, 2);
  assert.deepEqual(payloads[0].tokens, ['device-token']);
  assert.deepEqual(payloads[0].data, {
    type: 'community_reply', communityId: 'community-1', postId: 'post-1',
  });
  assert.deepEqual(revoked, []);
});

test('later community pushes replace the summary and recalculate after notifications are read', async t => {
  const records = [
    {userId: 'user-1', seen: false},
    {userId: 'user-1', seen: false},
  ];
  const {deliver, payloads} = setup(t, records);
  await deliver();
  records[0].seen = true;
  records[1].seen = true;
  records.push({userId: 'user-1', seen: false});
  await deliver();
  assert.equal(payloads[0].android?.notification?.notificationCount, 2);
  assert.equal(payloads[1].android?.notification?.notificationCount, 1);
  assert.ok(payloads[0].android.notification.tag);
  assert.equal(payloads[0].android.notification.tag, payloads[1].android.notification.tag);
});

test('a badge count lookup failure does not stop push delivery or invent an unread count', async t => {
  const {deliver, payloads} = setup(t, []);
  t.mock.method(Notification, 'countDocuments', async () => { throw new Error('database unavailable'); });
  t.mock.method(console, 'warn', () => {});
  assert.deepEqual(await deliver(), {sent: 1, failed: 0});
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].android?.notification?.notificationCount, undefined);
});

for (const [platform, appVersion] of [
  ['android', '2.3.6'], ['android', '2.2.99'], ['android', ''],
  ['android', undefined], ['android', 'invalid'], ['android', '2.3.7-beta'],
  ['ios', '2.3.7'], ['unknown', '3.0.0'],
]) {
  test(`preserves the legacy push contract for ${platform} version ${appVersion}`, async t => {
    const {deliver, payloads, countQueries} = setup(t, [], {
      registeredDevices: [{token: 'old-device', platform, appVersion}],
    });
    assert.deepEqual(await deliver(), {sent: 1, failed: 0});
    assert.deepEqual(payloads, [{
      tokens: ['old-device'],
      notification: {title: 'Touch community update', body: 'New reply'},
      data: {type: 'community_reply', communityId: 'community-1', postId: 'post-1'},
    }]);
    assert.deepEqual(countQueries, []);
  });
}

test('mixed app versions receive separate compatible payloads and revoke the correct failed token', async t => {
  const {deliver, payloads, revoked} = setup(t, [{userId: 'user-1', seen: false}], {
    registeredDevices: [
      {token: 'old-android', platform: 'android', appVersion: '2.3.6'},
      {token: 'new-android', platform: 'android', appVersion: '2.3.7'},
      {token: 'ios-device', platform: 'ios', appVersion: '2.3.7'},
      {token: 'expired-new-android', platform: 'android', appVersion: '2.3.10'},
      {token: 'future-android', platform: 'android', appVersion: '3.0.0'},
    ],
    sendResult: async payload => {
      const responses = payload.tokens.map(token => token === 'expired-new-android'
        ? {success: false, error: {code: 'messaging/registration-token-not-registered'}}
        : {success: true});
      const successCount = responses.filter(result => result.success).length;
      return {responses, successCount, failureCount: responses.length - successCount};
    },
  });
  assert.deepEqual(await deliver(), {sent: 4, failed: 1});
  assert.equal(payloads.length, 2);
  const legacy = payloads.find(payload => !payload.android);
  const modern = payloads.find(payload => payload.android);
  assert.deepEqual(legacy.tokens, ['old-android', 'ios-device']);
  assert.deepEqual(modern.tokens, ['new-android', 'expired-new-android', 'future-android']);
  assert.equal(modern.android.notification.notificationCount, 1);
  assert.deepEqual(modern.data, legacy.data);
  assert.deepEqual(revoked, ['expired-new-android']);
});

test('legacy delivery starts without waiting for the new badge lookup', async t => {
  const {deliver, payloads} = setup(t, [], {
    registeredDevices: [
      {token: 'old-device', platform: 'android', appVersion: '2.3.6'},
      {token: 'new-device', platform: 'android', appVersion: '2.3.7'},
    ],
  });
  let finishCount;
  t.mock.method(Notification, 'countDocuments', () => new Promise(resolve => { finishCount = resolve; }));
  const delivery = deliver();
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.deepEqual(payloads.map(payload => payload.tokens), [['old-device']]);
  } finally {
    finishCount(1);
    await delivery;
  }
});
