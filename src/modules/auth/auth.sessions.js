const { hashToken } = require('./auth.tokens');

const SECONDS_IN_DAY = 24 * 60 * 60;

function refreshSessionKey(sessionId) {
  return `refresh:${sessionId}`;
}

function refreshTtlSeconds() {
  const value = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
  const match = /^(\d+)d$/.exec(value);
  if (match) return Number(match[1]) * SECONDS_IN_DAY;

  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 30 * SECONDS_IN_DAY;
}

async function storeRefreshSession(redis, { sessionId, userId, refreshToken }) {
  const ttlSeconds = refreshTtlSeconds();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const session = {
    userId: String(userId),
    tokenHash: hashToken(refreshToken),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  await redis.setEx(refreshSessionKey(sessionId), ttlSeconds, JSON.stringify(session));
  return session;
}

async function getRefreshSession(redis, sessionId) {
  const raw = await redis.get(refreshSessionKey(sessionId));
  return raw ? JSON.parse(raw) : null;
}

async function deleteRefreshSession(redis, sessionId) {
  return redis.del(refreshSessionKey(sessionId));
}

module.exports = {
  storeRefreshSession,
  getRefreshSession,
  deleteRefreshSession,
  refreshSessionKey,
};
