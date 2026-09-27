const {createAdapter} = require('@socket.io/redis-adapter');
const {createClient} = require('redis');
const {getRedisClient} = require('../database/redisClient');

async function createSocketRedisClients({baseClient, createClient: create = createClient} = {}) {
  const pubClient = baseClient || (create === createClient ? getRedisClient() : create({url: process.env.REDIS_URL || 'redis://localhost:6379'}));
  const subClient = pubClient.duplicate();
  await Promise.all([
    pubClient.isOpen ? Promise.resolve() : pubClient.connect(),
    subClient.isOpen ? Promise.resolve() : subClient.connect(),
  ]);
  return {pubClient, subClient};
}

async function configureSocketRedis(io, options = {}) {
  const clients = await createSocketRedisClients(options);
  io.adapter(createAdapter(clients.pubClient, clients.subClient));
  return clients;
}

module.exports = {createSocketRedisClients, configureSocketRedis};
