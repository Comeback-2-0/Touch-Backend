const { createClient } = require('redis');

let client;
let connectPromise;

function redisSocketOptions(url) {
  const { protocol, hostname } = new URL(url);
  if (protocol !== 'rediss:') return undefined;

  // node-redis passes `tls: true` into tls.connect(). On Node 24 that
  // skips the default SNI/servername, so Upstash's cert fails with
  // UNABLE_TO_VERIFY_LEAF_SIGNATURE. Set servername explicitly.
  return {
    tls: true,
    servername: hostname,
  };
}

function getRedisClient() {
  if (!client) {
    const url = process.env.REDIS_URL || 'redis://localhost:6379';
    client = createClient({
      url,
      socket: redisSocketOptions(url),
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
