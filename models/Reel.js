const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  user: String,
  text: String,
  createdAt:{
    type:Date,
    default:Date.now
  }
});

const userSchema = new mongoose.Schema({
  username: String,
  profilePic: String,
});

const reelSchema = new mongoose.Schema({
  mood: String,
  reels: [
    {
      id: String,
      uri: String,
      caption: String,
      music: String,
      likeCount: Number,
      comments: [commentSchema],
      user: userSchema,
    },
  ],
});

module.exports = mongoose.model('Reel', reelSchema);