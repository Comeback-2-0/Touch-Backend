const test = require('node:test');
const assert = require('node:assert/strict');

test('creates independent Redis publisher and subscriber clients for Socket.IO', async () => {
  const {createSocketRedisClients} = require('../../../src/sockets/socketRedisAdapter');
  const created = [];
  const clients = await createSocketRedisClients({
    createClient: () => {
      const client = {isOpen: true, duplicate: () => ({id: 'subscriber', isOpen: true}), id: 'publisher'};
      created.push(client);
      return client;
    },
  });

  assert.equal(created.length, 1);
  assert.equal(clients.pubClient.id, 'publisher');
  assert.equal(clients.subClient.id, 'subscriber');
  assert.notEqual(clients.pubClient, clients.subClient);
});
