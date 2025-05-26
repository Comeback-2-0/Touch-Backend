const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CommunitySchema = new Schema({
  name:        { type: String, required: true },   // Community name/title
  mood:        { type: String, required: true },   // Mood/category that this community is centered on
  description: { type: String },                   // Optional description of the community
  createdAt:   { type: Date, default: Date.now }   // Community creation timestamp
});

module.exports = mongoose.model('Community', CommunitySchema);