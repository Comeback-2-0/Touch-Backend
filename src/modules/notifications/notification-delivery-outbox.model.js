const mongoose = require('mongoose');

const {Schema} = mongoose;

const NotificationDeliveryOutboxSchema = new Schema({
  notificationId: {type: String, required: true, index: true},
  userId: {type: String, required: true, index: true},
  type: {type: String, required: true},
  title: {type: String, default: ''},
  content: {type: String, default: ''},
  metadata: {type: Schema.Types.Mixed, default: {}},
  channel: {type: String, enum: ['push', 'in_app'], default: 'push', index: true},
  dedupeKey: {type: String, required: true, unique: true, index: true},
  status: {type: String, enum: ['pending', 'processing', 'delivered'], default: 'pending', index: true},
  attempts: {type: Number, default: 0},
  nextAttemptAt: {type: Date, required: true, default: Date.now, index: true},
  lockedAt: {type: Date, default: null},
  deliveredAt: {type: Date, default: null},
  lastError: {type: String, default: ''},
}, {timestamps: true, collection: 'notification_delivery_outbox'});

NotificationDeliveryOutboxSchema.index({status: 1, nextAttemptAt: 1, createdAt: 1});

module.exports = mongoose.models.NotificationDeliveryOutbox
  || mongoose.model('NotificationDeliveryOutbox', NotificationDeliveryOutboxSchema);
