const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const NotificationSchema = new Schema({
  userId:    { type: Schema.Types.ObjectId, ref: 'User', required: true }, // The user who receives the notification
  type:      { type: String, required: true },   // Type of notification (e.g. "like", "comment", "new_message")
  content:   { type: String },                  // Notification text or metadata (optional detail about the notification)
  seen:      { type: Boolean, default: false }, // Has the user seen the notification?
  timestamp: { type: Date, default: Date.now }  // Time the notification was created/sent
});

module.exports = mongoose.model('Notification', NotificationSchema);