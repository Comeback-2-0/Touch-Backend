const express = require('express');
const router = express.Router();
const Reel = require('./reel.model');
const {
  getMoodBasedReels,
  recordWatchTime,
  getSavedReels,           
} = require('./reel.controller');
const MoodPreferences = require('./mood-preferences.model');


const asyncHandler = require('../../utils/asyncHandler');
const auth = require('../../middleware/auth');

router.get('/feed', auth, asyncHandler(getMoodBasedReels));

router.post('/watch', auth, recordWatchTime);

const { getMoodPreferencesForUser } = require('./reel.controller');
router.get('/user-moods', auth, getMoodPreferencesForUser);
router.get('/moods', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const pref = await MoodPreferences.findOne({ userId });
    const moodCounts = {};

    if (pref?.watchHistory?.length) {
      for (const { mood, createdAt } of pref.watchHistory) {
        if (new Date(createdAt) >= twoDaysAgo) {
          moodCounts[mood] = (moodCounts[mood] || 0) + 1;
        }
      }
    }

    const allMoods = await Reel.distinct('mood');
    const sortedRecent = Object.entries(moodCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);

    const remaining = allMoods.filter(m => !sortedRecent.includes(m));
    const shuffled = remaining.sort(() => Math.random() - 0.5);

    const finalMoodOrder = [...sortedRecent, ...shuffled];

    res.json(finalMoodOrder);
  } catch (err) {
    console.error('moods fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch moods' });
  }
});

// Get all reels (admin/debug route)
router.get('/reels', asyncHandler(async (req, res) => {
  const reels = await Reel.find();
  res.json(reels);
}));

module.exports = router;
