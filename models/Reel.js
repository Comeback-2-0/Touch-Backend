const mongoose = require('mongoose');

// const commentSchema = new mongoose.Schema({
//   user: String,
//   text: String,
//   createdAt:{
//     type:Date,
//     default:Date.now
//   }
// });

const userSchema = new mongoose.Schema({
  username: String,
  profilePic: String,
});

const reelSchema = new mongoose.Schema({
  videoPath: String,
  mood: [String],
  hashtags: [String],
  creatorId: String,
  caption: String,
  likes: { type: Number, default: 0 },
  comments: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  saves: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  totalViews: { type: Number, default: 0 },
  totalWatchTime: { type: Number, default: 0 },
});

module.exports = mongoose.model('Reel', reelSchema);