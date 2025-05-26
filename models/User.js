const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  email:    { type: String, required: true, unique: true },   // User email (unique identifier)
  phone:    { type: String, unique: true },                   // User phone number (optional, unique if provided)
  password: { type: String, required: true },                 // Hashed password
  moods:    [String],                                         // Array of mood tags or mood history for the user
  savedPosts: [{ type: Schema.Types.ObjectId, ref: 'Post' }], // Posts bookmarked/saved by this user
  alias:    { type: String },                                 // Optional alias (display name) for anonymity
  avatar:   { type: String },                                 // Optional avatar image URL
  pushToken:{ type: String },                                 // Device push notification token (for mobile push notifications)
  createdAt:{ type: Date, default: Date.now }                 // Account creation timestamp
});

module.exports = mongoose.model('User', UserSchema);