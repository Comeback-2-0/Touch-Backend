const express = require('express');
const router = express.Router(); // ✅ This line is missing in your error
const Reel = require('../models/Reel');

// Route: Get reels by mood (Query Param Based)
router.get('/', async (req, res) => {
  const mood = req.query.mood;
  try {
    const reels = await Reel.find({ mood: mood });
    if (reels.length > 0) {
      res.json(reels);
    } else {
      res.status(404).json({ message: 'No reels found for this mood' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
