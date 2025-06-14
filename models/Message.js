// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  groupId: { type: String, required: true },
  senderUid: { type: String, required: true },
  senderName: { type: String, required: true },
  message: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Message', messageSchema);
