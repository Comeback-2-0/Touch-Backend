const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  userId: String,
  text: String,
  replies: [
    {
      userId: String,
      text: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Comment', commentSchema);