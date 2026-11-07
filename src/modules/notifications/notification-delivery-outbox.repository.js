const NotificationDeliveryOutbox = require('./notification-delivery-outbox.model');

function safeLimit(value, fallback = 50) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(1, Math.min(parsed, 200));
}

function errorMessage(error) {
  return String(error?.message || error || 'Notification delivery failed').slice(0, 1000);
}

function retryDelayMs(attempts) {
  const exponent = Math.max(0, Math.min(Number(attempts) || 1, 8));
  return Math.min(5 * 60 * 1000, 1000 * (2 ** exponent));
}

function rowId(row) {
  return String(row?.id || row?._id || '');
}

function createNotificationDeliveryOutboxRepository({
  model = NotificationDeliveryOutbox,
  now = () => new Date(),
  staleAfterMs = 60 * 1000,
} = {}) {
  return {
    async enqueue({
      notificationId,
      userId,
      type,
      title = '',
      content = '',
      metadata = {},
      channel = 'push',
      dedupeKey,
    }) {
      const safeNotificationId = String(notificationId || '');
      if (!safeNotificationId || !userId || !type) throw new Error('Notification delivery outbox input is incomplete');
      const safeDedupeKey = String(dedupeKey || `push:${safeNotificationId}`);
      return model.findOneAndUpdate(
        {dedupeKey: safeDedupeKey},
        {
          $setOnInsert: {
            notificationId: safeNotificationId,
            userId: String(userId),
            type: String(type),
            title: String(title || ''),
            content: String(content || ''),
            metadata: metadata && typeof metadata === 'object' ? metadata : {},
            channel: String(channel || 'push'),
            dedupeKey: safeDedupeKey,
            status: 'pending',
            attempts: 0,
            nextAttemptAt: now(),
          },
        },
        {new: true, upsert: true},
      );
    },

    listPending(limit = 50) {
      const currentTime = now();
      const staleBefore = new Date(currentTime.getTime() - staleAfterMs);
      return model.find({
        channel: 'push',
        $or: [
          {status: 'pending', nextAttemptAt: {$lte: currentTime}},
          {status: 'processing', lockedAt: {$lte: staleBefore}},
        ],
      }).sort({nextAttemptAt: 1, createdAt: 1, _id: 1}).limit(safeLimit(limit));
    },

    claim(rowOrId) {
      const id = rowId(typeof rowOrId === 'object' ? rowOrId : {_id: rowOrId});
      if (!id) return null;
      const currentTime = now();
      const staleBefore = new Date(currentTime.getTime() - staleAfterMs);
      return model.findOneAndUpdate(
        {
          _id: id,
          channel: 'push',
          $or: [
            {status: 'pending', nextAttemptAt: {$lte: currentTime}},
            {status: 'processing', lockedAt: {$lte: staleBefore}},
          ],
        },
        {
          $set: {status: 'processing', lockedAt: currentTime, lastError: ''},
          $inc: {attempts: 1},
        },
        {new: true},
      );
    },

    markDelivered(rowOrId) {
      const id = rowId(typeof rowOrId === 'object' ? rowOrId : {_id: rowOrId});
      return model.findOneAndUpdate(
        {_id: id, channel: 'push'},
        {$set: {status: 'delivered', deliveredAt: now(), lockedAt: null, lastError: ''}},
        {new: true},
      );
    },

    markFailed(rowOrId, error, attempts = 1) {
      const id = rowId(typeof rowOrId === 'object' ? rowOrId : {_id: rowOrId});
      const currentTime = now();
      return model.findOneAndUpdate(
        {_id: id, channel: 'push'},
        {
          $set: {
            status: 'pending',
            lockedAt: null,
            nextAttemptAt: new Date(currentTime.getTime() + retryDelayMs(attempts)),
            lastError: errorMessage(error),
          },
        },
        {new: true},
      );
    },
  };
}

module.exports = {
  createNotificationDeliveryOutboxRepository,
  retryDelayMs,
};
