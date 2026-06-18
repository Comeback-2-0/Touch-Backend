const { hashToken } = require('./auth.tokens');
const { createPostgresRefreshSessionRepository } = require('./refresh-session.repository');

const SECONDS_IN_DAY = 24 * 60 * 60;
let postgresRepository;

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

function shouldUsePostgresRefreshSessions(mode = process.env.REFRESH_SESSION_STORE) {
  if (process.env.NODE_ENV === 'production') {
    if (mode === 'redis') {
      throw new Error('Redis-only refresh sessions are not allowed in production');
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is required in production for PostgreSQL refresh sessions');
    }
    return true;
  }

  if (mode === 'postgres') return true;
  if (mode === 'redis') return false;
  return Boolean(process.env.DATABASE_URL && process.env.NODE_ENV !== 'test');
}

function getDefaultRepository() {
  if (!shouldUsePostgresRefreshSessions()) return null;
  if (!postgresRepository) {
    postgresRepository = createPostgresRefreshSessionRepository();
  }
  return postgresRepository;
}

function resolveRepository(options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'repository')) {
    return options.repository;
  }

  return getDefaultRepository();
}

function cacheTtlFromSession(session) {
  const expiresAt = new Date(session.expiresAt).getTime();
  const ttlSeconds = Math.floor((expiresAt - Date.now()) / 1000);
  return ttlSeconds > 0 ? ttlSeconds : 0;
}

async function storeRefreshSession(redis, { sessionId, userId, refreshToken }, options = {}) {
  const ttlSeconds = refreshTtlSeconds();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const session = {
    userId: String(userId),
    tokenHash: hashToken(refreshToken),
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const repository = resolveRepository(options);
  if (repository?.store) {
    await repository.store({
      sessionId,
      ...session,
    });
  }

  await redis.setEx(refreshSessionKey(sessionId), ttlSeconds, JSON.stringify(session));
  return session;
}

async function getRefreshSession(redis, sessionId, options = {}) {
  const raw = await redis.get(refreshSessionKey(sessionId));
  if (raw) return JSON.parse(raw);

  const repository = resolveRepository(options);
  if (!repository?.findById) return null;

  const session = await repository.findById(sessionId);
  if (!session) return null;

  const cachedSession = {
    userId: String(session.userId),
    tokenHash: session.tokenHash,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
  const ttlSeconds = cacheTtlFromSession(cachedSession);
  if (ttlSeconds > 0) {
    await redis.setEx(refreshSessionKey(sessionId), ttlSeconds, JSON.stringify(cachedSession));
  }

  return cachedSession;
}

async function deleteRefreshSession(redis, sessionId, options = {}) {
  const repository = resolveRepository(options);
  if (repository?.deleteById) {
    await repository.deleteById(sessionId);
  }

  return redis.del(refreshSessionKey(sessionId));
}

module.exports = {
  storeRefreshSession,
  getRefreshSession,
  deleteRefreshSession,
  refreshSessionKey,
  shouldUsePostgresRefreshSessions,
};
