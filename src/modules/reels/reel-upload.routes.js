 // routes/reelUploadRoutes.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Reel = require('./reel.model');
const reelController = require('./reel.controller');
const auth = require('../../middleware/auth');
const router = express.Router();

// Storage config (video saved locally)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', '..', '..', 'uploads', 'reels');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, uuidv4() + ext);
  },
});

const upload = multer({ storage });

// @route   POST /api/reels/upload
// @desc    Upload a new reel
router.post('/upload', auth, upload.single('video'), async (req, res) => {
  try {
    const { caption, mood, hashtags  } = req.body;
    const creatorId = req.user.id;
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' });
    }

    if (!caption || !mood || !creatorId) {
      return res.status(400).json({ error: 'Caption, mood, and creatorId are required.' });
    }

    const newReel = new Reel({
      videoPath: `/uploads/reels/${req.file.filename}`,
      mood: mood.split(',').map((m) => m.trim()), // assumes mood is sent as CSV string
      caption,
      creatorId,
      hashtags: hashtags ? hashtags.split(',').map(tag => tag.trim()) : [], // optionally extract from caption later or add custom logic
    });

    await newReel.save();

    res.status(201).json({ message: 'Reel uploaded successfully', reel: newReel });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/like', auth, reelController.likeReel);
router.post('/save', auth, reelController.saveReel); 
router.post('/:reelId/comments', auth, reelController.commentOnReel); 
router.get('/:reelId/comments', reelController.getComments); 

module.exports = router;
