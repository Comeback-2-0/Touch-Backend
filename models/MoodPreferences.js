const mongoose = require('mongoose');

const watchEntrySchema = new mongoose.Schema({
  reelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reel' },
  mood: String,
  duration: Number,
  timestamp: { type: Date, default: Date.now }
});

const moodPreferencesSchema = new mongoose.Schema({
  userId: String,
  likedCreators: [String],
  watchHistory: [watchEntrySchema]
});

module.exports = mongoose.model('MoodPreferences', moodPreferencesSchema);
