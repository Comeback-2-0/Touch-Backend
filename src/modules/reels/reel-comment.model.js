const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  reelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel', required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'reel_comments' });

module.exports = mongoose.models.ReelComment || mongoose.model('ReelComment', commentSchema);
