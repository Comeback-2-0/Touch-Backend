const {getRedisClient} = require('../../database/redisClient');

const DEFAULT_TTL_SECONDS = 30;
const MAX_TTL_SECONDS = 300;

function relationshipCacheKey(viewerId, targetId) {
  return `touch:v2:relationship:v1:${encodeURIComponent(String(viewerId))}:${encodeURIComponent(String(targetId))}`;
}

function createRedisMetricSink(redis, now = () => new Date()) {
  return {
    increment(event) {
      if (!redis?.isOpen || typeof redis.incr !== 'function') return;
      const day = now().toISOString().slice(0, 10);
      const key = `touch:v2:metric:${event}:${day}`;
      Promise.resolve(redis.incr(key))
        .then(() => (typeof redis.expire === 'function' ? redis.expire(key, 90 * 24 * 60 * 60, 'NX') : undefined))
        .catch(() => undefined);
    },
  };
}

function boundedTtl(value = process.env.RELATIONSHIP_CACHE_TTL_SECONDS) {
  const parsed = Number(value || DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_SECONDS;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_TTL_SECONDS);
}

function createRelationshipCache({
  redis = getRedisClient(),
  ttlSeconds = boundedTtl(),
  metrics = createRedisMetricSink(redis),
} = {}) {
  const ttl = boundedTtl(ttlSeconds);

  function mark(event) {
    try { metrics?.increment?.(`relationship_cache.${event}`); } catch (_) { /* metrics cannot affect relationship reads */ }
  }

  function usable() {
    return Boolean(redis?.isOpen && typeof redis.get === 'function' && typeof redis.setEx === 'function' && typeof redis.del === 'function');
  }

  return {
    key: relationshipCacheKey,
    async get({viewerId, targetId}) {
      if (!usable()) { mark('unavailable'); return null; }
      try {
        const raw = await redis.get(relationshipCacheKey(viewerId, targetId));
        if (!raw) { mark('miss'); return null; }
        try {
          const value = JSON.parse(raw);
          mark('hit');
          return value;
        } catch (_) {
          mark('corrupt');
          await redis.del(relationshipCacheKey(viewerId, targetId));
          return null;
        }
      } catch (_) {
        mark('error');
        return null;
      }
    },
    async set({viewerId, targetId}, value) {
      if (!usable()) { mark('unavailable'); return false; }
      try {
        await redis.setEx(relationshipCacheKey(viewerId, targetId), ttl, JSON.stringify(value));
        mark('set');
        return true;
      } catch (_) {
        mark('error');
        return false;
      }
    },
    async invalidate(pairs = []) {
      const keys = [...new Set(pairs.map(pair => relationshipCacheKey(pair.viewerId, pair.targetId)))];
      if (!keys.length) return true;
      if (!usable()) { mark('unavailable'); return false; }
      try {
        await redis.del(keys);
        mark('invalidate');
        return true;
      } catch (_) {
        mark('error');
        return false;
      }
    },
    ttlSeconds: ttl,
  };
}

module.exports = {createRelationshipCache, relationshipCacheKey, boundedTtl, createRedisMetricSink};
