const {createNotificationRepository} = require('./mongo-notification.repository');
const {connectRedis} = require('../../database/redisClient');
const {incrementUnreadCount} = require('./notification-cache.service');

const repository = createNotificationRepository();

async function notifyUser({userId, type, content, metadata = {}}) {
  if (!userId) return null;
  const notification = await repository.create({
    userId: String(userId),
    type,
    content,
    metadata,
    seen: false,
  });
  try {
    const redis = await connectRedis();
    await incrementUnreadCount(redis, String(userId), 1);
  } catch {
    // Notification persistence remains authoritative if Redis is unavailable.
  }
  return notification;
}

module.exports = {notifyUser};
