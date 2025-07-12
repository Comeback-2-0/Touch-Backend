const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  reelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel', required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Like', likeSchema);
