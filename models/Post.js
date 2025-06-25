// models/Post.js
const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group" },
  content: String,
  image: { type: String, default: null },
  isQueued: { type: Boolean, default: true },
  likes: { type: Number, default: 0 },
  votes: { type: Number, default: 0 },
  comments: [{ type: mongoose.Schema.Types.ObjectId, ref: "Comment" }],
  votedBy: [{ type: String }],
  reportedBy: [{ type: String }],
  approvedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Post", postSchema);
