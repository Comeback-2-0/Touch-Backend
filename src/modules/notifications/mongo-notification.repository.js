const Notification = require('./notification.model');

function createNotificationRepository(model = Notification) {
  return {
    create(input) {
      return model.create(input);
    },
    listForUser(userId, { limit = 50, cursor } = {}) {
      const query = { userId: String(userId) };
      if (cursor) {
        query.createdAt = { $lt: new Date(cursor) };
      }
      return model.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(Math.min(Number(limit) || 50, 100));
    },
    markSeen(notificationId, userId) {
      return model.findOneAndUpdate(
        { _id: notificationId, userId: String(userId) },
        { $set: { seen: true } },
        { new: true },
      );
    },
  };
}

module.exports = {
  createNotificationRepository,
};
