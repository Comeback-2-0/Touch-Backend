const {createNotificationEventOutboxRepository} = require('../modules/notifications/notification-event-outbox.repository');
const {notifyUser} = require('../modules/notifications/notification.service');

function textFor(type, actorName) {
  const actor = actorName || 'Someone';
  if (type === 'follow') return {title: 'New follower', content: `${actor} started following you`};
  if (type === 'follow_request') return {title: 'Follow request', content: `${actor} requested to follow you`};
  if (type === 'follow_accepted') return {title: 'Follow request accepted', content: `${actor} accepted your follow request`};
  return {title: 'New Touch activity', content: 'You have a new Touch notification'};
}

function createStage1NotificationOutboxRunner({repository = createNotificationEventOutboxRepository(), notify = notifyUser, logger = console} = {}) {
  return async function runStage1NotificationOutbox() {
    const rows = await repository.listPending();
    for (const row of rows) {
      const claimed = await repository.markProcessing(row.id);
      if (!claimed) continue;
      try {
        if (typeof repository.isBlockedPair === 'function'
          && await repository.isBlockedPair({firstId: row.actor_id, secondId: row.recipient_id})) {
          if (typeof repository.markSuppressed === 'function') await repository.markSuppressed(row.id);
          else await repository.markDelivered(row.id);
          continue;
        }
        const copy = textFor(row.type, row.actor_name || row.actor_username);
        await notify({
          userId: row.recipient_id,
          type: row.type,
          title: copy.title,
          content: copy.content,
          dedupeKey: row.dedupe_key,
          metadata: {
            ...(row.payload || {}),
            actorUserId: row.actor_id,
            actorName: row.actor_name || '',
            actorUsername: row.actor_username || '',
            actorProfilePicture: row.actor_profile_picture || '',
            targetType: row.target_type,
            targetId: row.target_id || '',
          },
        });
        await repository.markDelivered(row.id);
      } catch (error) {
        logger.warn?.('[Stage1] notification outbox retry scheduled', error?.message || error);
        await repository.markFailed(row.id);
      }
    }
  };
}

module.exports = {createStage1NotificationOutboxRunner, textFor};
