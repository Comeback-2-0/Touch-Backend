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

exports.getMyNotifications = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const notifications = await notificationRepository.listForUser(userId, req.query);
  const redis = await connectRedis();
  const unreadCount = await getUnreadCount(redis, userId);

  return res.status(200).json({ notifications, unreadCount });
};

exports.markAsSeen = async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const notification = await notificationRepository.markSeen(req.params.id, userId);
  if (!notification) return res.status(404).json({ error: 'Notification not found' });

  const redis = await connectRedis();
  await decrementUnreadCount(redis, userId, 1);

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
