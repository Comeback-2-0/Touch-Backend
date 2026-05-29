const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, unique: true, sparse: true, index: true },
  uid: String,
  name: String,
  email: { type: String, unique: true, index: true },
  photo: String,
  username: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
    lowercase: true,
    trim: true,
  },
  bio: { type: String, default: '' },
  profilePicture: { type: String, default: '' },
  profilePicturePublicId: { type: String, default: '' },
  isPrivate: { type: Boolean, default: false },
  isProfileComplete: { type: Boolean, default: false },
  followersCount: { type: Number, default: 0, min: 0 },
  followingCount: { type: Number, default: 0, min: 0 },
  postsCount: { type: Number, default: 0, min: 0 },
  role: { type: String, default: 'user' },
  lastLoginAt: Date,
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
