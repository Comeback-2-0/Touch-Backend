const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  userId: String,
  text: String,
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  likedBy: [String],
  dislikedBy: [String],
  reportedBy: [String],
  replies: [
    {
      userId: String,
      text: String,
      createdAt: { type: Date, default: Date.now },
      likes: { type: Number, default: 0 },
      dislikes: { type: Number, default: 0 },
      likedBy: [String],
      dislikedBy: [String],
      reportedBy: [String],
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Comment', commentSchema);