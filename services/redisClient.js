const { createClient } = require('redis');

let client;
let connectPromise;

function getRedisClient() {
  if (!client) {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    client.on('error', (err) => {
      console.error('Redis error:', err);
    });
  }

  return client;
}

async function connectRedis() {
  const redis = getRedisClient();
  if (redis.isOpen) return redis;

  if (!connectPromise) {
    connectPromise = redis.connect().then(() => redis);
  }

  return connectPromise;
}

module.exports = {
  getRedisClient,
  connectRedis,
};
