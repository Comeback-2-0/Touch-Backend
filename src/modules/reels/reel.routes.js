const express = require('express');
const router = express.Router();
const Reel = require('./reel.model');
const {
  getMoodBasedReels,
  recordWatchTime,
  getSavedReels,           
} = require('./reel.controller');


const asyncHandler = require('../../utils/asyncHandler');
const auth = require('../../middleware/auth');

router.get('/feed', auth, asyncHandler(getMoodBasedReels));

router.post('/watch', auth, recordWatchTime);

const { getMoodPreferencesForUser } = require('./reel.controller');
router.get('/user-moods', auth, getMoodPreferencesForUser);
router.get('/moods', auth, async (req, res) => {
  try {
    const allMoods = await Reel.distinct('mood');
    const finalMoodOrder = allMoods.sort(() => Math.random() - 0.5);

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
