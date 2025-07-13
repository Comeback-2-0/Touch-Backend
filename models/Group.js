const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: String,
  description: String,
  members: [String], // userIds
  trendingScore: Number,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Group', groupSchema);