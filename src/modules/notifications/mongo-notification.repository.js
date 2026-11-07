const Notification = require('./notification.model');

function createNotificationRepository(model = Notification) {
  return {
    create(input) {
      if (input.dedupeKey) {
        return model.findOneAndUpdate(
          {dedupeKey: String(input.dedupeKey)},
          {$setOnInsert: input},
          {new: true, upsert: true},
        );
      }
      return model.create(input);
    },
    async createIdempotent(input) {
      if (!input.dedupeKey) return {notification: await model.create(input), created: true};

      const filter = {dedupeKey: String(input.dedupeKey)};
      const existing = await model.findOne(filter);
      if (existing) return {notification: existing, created: false};

      try {
        return {notification: await model.create(input), created: true};
      } catch (error) {
        // The unique index arbitrates concurrent workers. A retry that loses
        // that race returns the canonical document without re-delivering it.
        if (error?.code !== 11000) throw error;
        const canonical = await model.findOne(filter);
        if (!canonical) throw error;
        return {notification: canonical, created: false};
      }
    },
    countUnreadForUser(userId) {
      return model.countDocuments({userId: String(userId), seen: false});
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
    async markSeen(notificationId, userId) {
      const filter = {_id: notificationId, userId: String(userId)};
      const now = new Date();
      const updated = await model.findOneAndUpdate(
        {...filter, seen: false},
        {$set: {seen: true, readAt: now}},
        {new: true},
      );
      if (updated) return {notification: updated, changed: true};

      const existing = await model.findOne(filter);
      if (!existing) return null;
      if (!existing.readAt) {
        const withReadAt = await model.findOneAndUpdate(
          {...filter, readAt: null},
          {$set: {readAt: now}},
          {new: true},
        );
        return {notification: withReadAt || existing, changed: false};
      }
      return {notification: existing, changed: false};
    },
  };
}

module.exports = {
  createNotificationRepository,
};
