const {createNotificationRepository} = require('./mongo-notification.repository');
const {connectRedis} = require('../../database/redisClient');
const {incrementUnreadCount} = require('./notification-cache.service');
const {deliverCommunityNotification, hasEligiblePushDelivery} = require('./notification-delivery.service');
const {createNotificationDeliveryOutboxRepository} = require('./notification-delivery-outbox.repository');
const {
  notificationPreferenceDecision,
  readNotificationPreferences,
} = require('./notification-preference.policy');

const STAGE1_PUSH_TYPES = new Set(['follow', 'follow_request', 'follow_accepted']);

function notificationId(notification) {
  return String(notification?._id || notification?.id || '');
}

function createNotificationService({
  repository = createNotificationRepository(),
  deliveryOutboxRepository = createNotificationDeliveryOutboxRepository(),
  redisConnector = connectRedis,
  incrementUnread = incrementUnreadCount,
  deliver = deliverCommunityNotification,
  shouldQueuePush = hasEligiblePushDelivery,
  notificationPreferenceRepository,
  getNotificationPreferences,
  logger = console,
} = {}) {
  const readPreferences = getNotificationPreferences || (userId => readNotificationPreferences(userId, notificationPreferenceRepository));

  async function queueStage1Delivery({userId, type, title, content, metadata, dedupeKey, notification}) {
    await deliveryOutboxRepository.enqueue({
      notificationId: notificationId(notification),
      userId: String(userId),
      type,
      title,
      content,
      metadata,
      channel: 'push',
      dedupeKey: `push:${dedupeKey || notificationId(notification)}`,
    });
  }

  async function notifyUser({userId, type, title, content, metadata = {}, dedupeKey}) {
    if (!userId) return null;
    const isStage1Notification = STAGE1_PUSH_TYPES.has(type);
    const preferences = isStage1Notification
      ? await readPreferences(String(userId))
      : null;
    const preferenceDecision = isStage1Notification
      ? notificationPreferenceDecision({type, preferences})
      : {inApp: true, push: true};
    if (!preferenceDecision.inApp) return null;
    const input = {
      userId: String(userId),
      type,
      content,
      metadata,
      dedupeKey,
      seen: false,
    };
    const result = typeof repository.createIdempotent === 'function'
      ? await repository.createIdempotent(input)
      : {notification: await repository.create(input), created: true};
    const notification = result.notification;

    // Relationship notifications are already persisted in MongoDB at this point.
    // Queueing the push separately makes FCM failure retryable and keeps the
    // canonical in-app notification available to the recipient.
    if (isStage1Notification) {
      if (preferenceDecision.push && await shouldQueuePush({userId: String(userId), type, preferences})) {
        await queueStage1Delivery({userId, type, title, content, metadata, dedupeKey, notification});
      }
      if (!result.created) return notification;
    } else if (!result.created) {
      return notification;
    }

    try {
      const redis = await redisConnector();
      await incrementUnread(redis, String(userId), 1);
    } catch {
      // Notification persistence remains authoritative if Redis is unavailable.
    }

    if (isStage1Notification) return notification;

    deliver({userId: String(userId), type, title, content, metadata})
      .then(deliveryResult => {
        if (deliveryResult?.skipped) {
          logger.warn?.('Community push delivery skipped: Firebase Admin is not configured', {userId: String(userId), type});
        }
      })
      .catch(error => {
        logger.warn?.('Community push delivery failed', {
          userId: String(userId),
          type,
          code: error?.code,
          message: error?.message,
        });
      });
    return notification;
  }

  return {notifyUser};
}

const defaultNotificationService = createNotificationService();

module.exports = {
  notifyUser: defaultNotificationService.notifyUser,
  createNotificationService,
  isStage1PushType: type => STAGE1_PUSH_TYPES.has(type),
};
