const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PostSchema = new Schema({
  mediaUrl:   { type: String, required: true },              // URL to image/video media for the post
  caption:    { type: String },                              // Optional text caption
  mood:       { type: String, required: true },              // Mood tag/category for this post
  authorId:   { type: Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to User who created the post
  likeCount:  { type: Number, default: 0 },                  // Number of likes (default 0)
  createdAt:  { type: Date, default: Date.now }              // Post creation timestamp
});

module.exports = mongoose.model('Post', PostSchema);