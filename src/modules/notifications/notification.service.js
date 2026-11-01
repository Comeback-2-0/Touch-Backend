const {createNotificationRepository} = require('./mongo-notification.repository');
const {connectRedis} = require('../../database/redisClient');
const {incrementUnreadCount} = require('./notification-cache.service');
const {deliverCommunityNotification} = require('./notification-delivery.service');

const repository = createNotificationRepository();

async function notifyUser({userId, type, title, content, metadata = {}}) {
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
  deliverCommunityNotification({userId: String(userId), type, title, content, metadata})
    .then(result => {
      if (result?.skipped) {
        console.warn('Community push delivery skipped: Firebase Admin is not configured', {userId: String(userId), type});
      }
    })
    .catch(error => {
      console.warn('Community push delivery failed', {
        userId: String(userId),
        type,
        code: error?.code,
        message: error?.message,
      });
    });
  return notification;
}

module.exports = {notifyUser};
