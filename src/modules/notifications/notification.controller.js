const { connectRedis } = require('../../database/redisClient');
const { createNotificationRepository } = require('./mongo-notification.repository');
const {
  createNotificationPreferenceRepository,
} = require('./notification-preference.repository');
const {
  decrementUnreadCount,
  getUnreadCount,
} = require('./notification-cache.service');

const notificationRepository = createNotificationRepository();
let preferenceRepository;

function getPreferenceRepository() {
  if (!preferenceRepository) {
    preferenceRepository = createNotificationPreferenceRepository();
  }
  return preferenceRepository;
}

async function getUnreadCountWithFallback(userId, {
  redisConnector = connectRedis,
  readCache = getUnreadCount,
  fallback = notificationRepository.countUnreadForUser.bind(notificationRepository),
} = {}) {
  try {
    return await readCache(await redisConnector(), userId);
  } catch {
    return fallback(userId);
  }
}

exports.getMyNotifications = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  try {
    const notifications = await notificationRepository.listForUser(userId, req.query);
    const unreadCount = await getUnreadCountWithFallback(userId);

    return res.status(200).json({ notifications, unreadCount });
  } catch {
    return res.status(503).json({error: 'Notifications are temporarily unavailable', code: 'NOTIFICATIONS_UNAVAILABLE'});
  }
};

exports.markAsSeen = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const result = await notificationRepository.markSeen(req.params.id, userId);
  if (!result) return res.status(404).json({ error: 'Notification not found' });

  // Older injected repositories returned the document directly. Keep that
  // compatibility shape while making the Stage 1 repository report whether
  // an unread counter actually changed.
  const notification = result.notification || result;

  if (result.changed !== false) {
    try {
      const redis = await connectRedis();
      await decrementUnreadCount(redis, userId, 1);
    } catch {
      // MongoDB is authoritative; a Redis counter can be rebuilt safely.
    }
  }

  return res.status(200).json({ notification });
};

exports.getPreferences = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const preferences = await getPreferenceRepository().getForUser(userId);
  return res.status(200).json({ preferences });
};

exports.updatePreferences = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const preferences = await getPreferenceRepository().upsertForUser(userId, req.body || {});
  return res.status(200).json({ preferences });
};

exports.getUnreadCountWithFallback = getUnreadCountWithFallback;
