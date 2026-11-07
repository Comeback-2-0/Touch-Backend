const {createNotificationPreferenceRepository} = require('./notification-preference.repository');

const TYPE_PREFERENCE_KEYS = {
  follow: 'follows',
  follow_request: 'followRequests',
  follow_accepted: 'followRequests',
};

let preferenceRepository;

function preferenceKeyFor(type) {
  return TYPE_PREFERENCE_KEYS[type];
}

function typeEnabled(preferences, type) {
  const key = preferenceKeyFor(type);
  if (!key) return true;
  const value = preferences?.preferences?.[key];
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && value.enabled !== undefined) return Boolean(value.enabled);
  return true;
}

function isMuted(preferences, now = new Date()) {
  if (!preferences?.mutedUntil) return false;
  const mutedUntil = new Date(preferences.mutedUntil);
  return Number.isFinite(mutedUntil.getTime()) && mutedUntil.getTime() > now.getTime();
}

function notificationPreferenceDecision({type, preferences, now} = {}) {
  const enabledForType = typeEnabled(preferences, type);
  return {
    inApp: preferences?.inAppEnabled !== false && enabledForType,
    push: preferences?.pushEnabled !== false && enabledForType && !isMuted(preferences, now),
  };
}

async function readNotificationPreferences(userId, repository) {
  if (repository?.getForUser) return repository.getForUser(String(userId));
  // Unit tests and non-production compatibility paths do not have to create a
  // PostgreSQL client merely to preserve the existing default-allow behavior.
  if (process.env.NODE_ENV === 'test') return null;
  if (process.env.NODE_ENV !== 'production' && !process.env.DATABASE_URL) return null;
  if (!preferenceRepository) preferenceRepository = createNotificationPreferenceRepository();
  return preferenceRepository.getForUser(String(userId));
}

module.exports = {
  preferenceKeyFor,
  notificationPreferenceDecision,
  readNotificationPreferences,
};
