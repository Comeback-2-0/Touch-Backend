// const express = require('express');
// const Reel = require('../models/Reel');
// const router = express.Router();

// router.get('/reels', async (req, res) => {
//   try {
//     const reels = await Reel.find();
//     res.json(reels);
//   } catch (err) {
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// module.exports = router;
// routes/reelRoutes.js
const express = require('express');
const router = express.Router();
const Reel = require('../models/Reel'); // make sure this path is correct

// GET /api/reels
router.get('/', async (req, res) => {
  try {
    const reels = await Reel.find();
    res.json(reels);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reels' });
  }
});

router.post('/:reelId/comments', async (req, res) => {
  const { reelId } = req.params;
  const { user, text } = req.body;

  try {
    const reel = await Reel.findById(reelId);
    if (!reel) return res.status(404).json({ message: 'Reel not found' });

    reel.comments.push({ user, text });
    await reel.save();
    res.status(201).json({ message: 'Comment added successfully', comments: reel.comments.at(-1) });
  } catch (error) {
    res.status(500).json({ message: 'Error adding comment', error });
  }
});

// GET comments for a reel
// router.get('/:reelId/comments', async (req, res) => {
//   try {
//     const reel = await Reel.findById(req.params.reelId);
//     if (!reel) return res.status(404).json({ message: 'Reel not found' });

//     res.json(reel.comments);
//   } catch (err) {
//     res.status(500).json({ message: 'Error fetching comments', err });
//   }
// });


module.exports = router;
