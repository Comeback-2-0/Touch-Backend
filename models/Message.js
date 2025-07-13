const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    communityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Community', required: true },
    content: { type: String, required: true },
    senderAnonymousId: { type: String, required: true }, // This will be an anonymous ID
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);