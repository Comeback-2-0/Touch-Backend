const {getRedisClient} = require('../database/redisClient');

function createStage1RateLimit({
  redis = getRedisClient(),
  windowSeconds = 60,
  accountLimit = 60,
  ipLimit = 180,
  burstWindowSeconds,
  burstAccountLimit,
  burstIpLimit,
  key,
} = {}) {
  return async function stage1RateLimit(req, res, next) {
    if (process.env.NODE_ENV === 'test') return next();
    if (!redis?.isOpen) return res.status(503).json({error: 'Service temporarily unavailable', code: 'RATE_LIMIT_STORE_UNAVAILABLE'});
    // Parameterized paths must not create a separate bucket per target ID.
    // Callers provide a stable scope for each action family; the request path
    // remains the compatibility fallback for fixed, non-parameterized routes.
    const scope = String(key || req.path || 'unknown');
    const accountKey = `touch:v2:limit:${scope}:${req.user.id}`;
    const ipKey = `touch:v2:limit:${scope}:ip:${req.ip || 'unknown'}`;
    const burstEnabled = Number.isFinite(Number(burstWindowSeconds))
      && Number(burstWindowSeconds) > 0
      && Number.isFinite(Number(burstAccountLimit))
      && Number(burstAccountLimit) > 0
      && Number.isFinite(Number(burstIpLimit))
      && Number(burstIpLimit) > 0;
    const counters = [
      {key: accountKey, seconds: windowSeconds, limit: accountLimit},
      {key: ipKey, seconds: windowSeconds, limit: ipLimit},
    ];
    if (burstEnabled) {
      counters.push(
        {key: `touch:v2:burst:${scope}:${req.user.id}`, seconds: burstWindowSeconds, limit: burstAccountLimit},
        {key: `touch:v2:burst:${scope}:ip:${req.ip || 'unknown'}`, seconds: burstWindowSeconds, limit: burstIpLimit},
      );
    }
    try {
      const multi = redis.multi();
      for (const counter of counters) {
        multi.incr(counter.key);
        multi.expire(counter.key, counter.seconds, 'NX');
      }
      const result = await multi.exec();
      const counts = counters.map((_, index) => Number(result?.[index * 2]?.[1] || result?.[index * 2] || 0));
      if (counts.some((count, index) => count > Number(counters[index].limit))) {
        return res.status(429).json({error: 'Too many requests', code: 'SEARCH_RATE_LIMITED'});
      }
      return next();
    } catch { return res.status(503).json({error: 'Service temporarily unavailable', code: 'RATE_LIMIT_STORE_UNAVAILABLE'}); }
  };
}
module.exports = {createStage1RateLimit};
