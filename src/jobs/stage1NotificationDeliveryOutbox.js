const {createNotificationDeliveryOutboxRepository} = require('../modules/notifications/notification-delivery-outbox.repository');
const {deliverCommunityNotification} = require('../modules/notifications/notification-delivery.service');

function rowId(row) {
  return String(row?.id || row?._id || '');
}

function createStage1NotificationDeliveryOutboxRunner({
  repository = createNotificationDeliveryOutboxRepository(),
  deliver = deliverCommunityNotification,
  logger = console,
} = {}) {
  return async function runStage1NotificationDeliveryOutbox() {
    const rows = await repository.listPending();
    for (const row of rows) {
      const claimed = await repository.claim(rowId(row));
      if (!claimed) continue;
      try {
        const result = await deliver({
          userId: String(claimed.userId),
          type: claimed.type,
          title: claimed.title,
          content: claimed.content,
          metadata: claimed.metadata || {},
        });
        if (Number(result?.failed || 0) > 0) {
          throw new Error('One or more push deliveries failed');
        }
        await repository.markDelivered(rowId(claimed));
      } catch (error) {
        logger.warn?.('[Stage1] notification delivery retry scheduled', error?.message || error);
        await repository.markFailed(rowId(claimed), error, claimed.attempts);
      }
    }
  };
}

module.exports = {createStage1NotificationDeliveryOutboxRunner};
