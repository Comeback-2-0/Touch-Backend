const assert = require('node:assert/strict');
const test = require('node:test');

const {createNotificationDeviceRepository} = require('../../../src/modules/notifications/notification-device.repository');

function createSql(calls) {
  const sql = async (strings, ...values) => {
    calls.push({query: strings.join('?'), values});
    return [{id: 'device-1', user_id: 'user-1', token: 'token-1', capabilities: []}];
  };
  sql.json = value => value;
  return sql;
}

test('device registration treats omitted capabilities as an empty compatibility snapshot', async () => {
  const calls = [];
  const repository = createNotificationDeviceRepository(createSql(calls));

  await repository.register({
    userId: 'user-1',
    token: 'token-1',
    capabilities: ['stage1_notification_destinations'],
  });
  await repository.register({userId: 'user-1', token: 'token-1'});

  const secondRegistration = calls[1];
  assert.match(secondRegistration.query, /capabilities\s*=\s*excluded\.capabilities/i);
  assert.doesNotMatch(secondRegistration.query, /else notification_devices\.capabilities/i);
  assert.equal(secondRegistration.values.includes(false), false);
  assert.deepEqual(secondRegistration.values.find(value => Array.isArray(value)), []);
});
