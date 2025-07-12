const multer = require('multer');
const path = require('path');
const Reel = require('../models/Reel'); // Assuming your model is stored in models/Reel.js
const Like = require('../models/likeModel');
const Save = require('../models/saveModel');
const Comment = require('../models/commentModel');
const fs = require('fs');


// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Save files in 'uploads/reels' directory
    cb(null, 'uploads/reels/');
  },
  filename: (req, file, cb) => {
    // Create a unique file name using the current timestamp and the file extension
    const ext = path.extname(file.originalname);
    const fileName = `${Date.now()}${ext}`;
    cb(null, fileName); // Save the file with the new name
  },
});

const upload = multer({ storage }).single('video'); // 'video' is the field name in the form

// Controller function to handle video upload and metadata saving
exports.createPost = (req, res) => {
  // Use multer to handle the file upload
  upload(req, res, async (err) => {
    if (err) {
      console.error('Error during file upload:', err);
      return res.status(400).json({ message: 'File upload failed' });
    }

    // Ensure required fields are present in the request body
    const { caption, mood, hashtags, creatorId } = req.body;
    const videoPath = req.file?.path; // Path to the uploaded video file

    // Check if all required fields are provided
    if (!videoPath || !caption || !mood || !hashtags || !creatorId) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      // Create a new Reel document and save it to MongoDB
      const newReel = new Reel({
        videoPath,          // Video file path saved by multer
        mood: mood.split(','),   // Convert comma-separated string into array
        hashtags: hashtags.split(','), // Convert comma-separated string into array
        caption,
        creatorId,
        createdAt: new Date(),  // Set the current date/time as the creation time
      });

      await newReel.save(); // Save the new reel to the database

      // Return the created reel data in the response
      return res.status(201).json({
        success: true,
        message: 'Reel uploaded successfully!',
        reel: newReel,
      });
    } catch (err) {
      console.error('Error saving reel to database:', err);
      return res.status(500).json({ message: 'Server error while saving reel' });
    }
  });
};

// If you need a function to handle fetching all posts
exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Reel.find().sort({ createdAt: -1 }); // Fetch all posts, sorted by date
    return res.status(200).json({ success: true, posts });
  } catch (err) {
    console.error('Error fetching posts:', err);
    return res.status(500).json({ message: 'Server error while fetching posts' });
  }
};

//const Reel = require('../models/Reel');
// const Like = require('../models/likeModel');
// const Save = require('../models/saveModel');
// const Comment = require('../models/commentModel');

// Like a reel
// Like a reel
exports.likeReel = async (req, res) => {
  try {
    const { reelId, userId } = req.body;

    // Check if user has already liked the reel
    const existingLike = await Like.findOne({ reelId, userId });

    if (existingLike) {
      // If already liked, remove the like
      await Like.findOneAndDelete({ reelId, userId });

      // Decrement the like count in Reel model
      await Reel.findByIdAndUpdate(reelId, { $inc: { likes: -1 } });
    } else {
      // If not liked, add the like
      const newLike = new Like({ reelId, userId });
      await newLike.save();

      // Increment the like count in Reel model
      await Reel.findByIdAndUpdate(reelId, { $inc: { likes: 1 } });
    }

    res.status(200).json({ message: 'Like toggled successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to like reel', details: err });
  }
};

// Save a reel
// Save a reel
exports.saveReel = async (req, res) => {
  try {
    const { reelId, userId } = req.body;

    // Check if user has already saved the reel
    const existingSave = await Save.findOne({ reelId, userId });

    if (existingSave) {
      // If already saved, remove the save
      await Save.findOneAndDelete({ reelId, userId });

      // Decrement the save count in Reel model
      await Reel.findByIdAndUpdate(reelId, { $inc: { saves: -1 } });
    } else {
      // If not saved, add the save
      const newSave = new Save({ reelId, userId });
      await newSave.save();

      // Increment the save count in Reel model
      await Reel.findByIdAndUpdate(reelId, { $inc: { saves: 1 } });
    }

    res.status(200).json({ message: 'Save toggled successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save reel', details: err });
  }
};

// Comment on a reel
// Comment on a reel
exports.commentOnReel = async (req, res) => {
  try {
    const { reelId, userId, text } = req.body;

    console.log('Comment Data:', { reelId, userId, text });
    const newComment = new Comment({ reelId, userId, text });
    console.log('New Comment:', newComment);
    
    await newComment.save();

    // Increment the comment count in Reel model
    await Reel.findByIdAndUpdate(reelId, { $inc: { comments: 1 } });

    res.status(200).json({ message: 'Comment added successfully', comment: newComment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to comment on reel', details: err });
  }
};

// In postController.js
exports.getComments = async (req, res) => {
  try {
    const { reelId } = req.params;  // Get reelId from URL params
    const comments = await Comment.find({ reelId }) // Find comments related to this reelId
      .populate('userId', 'username profilePic')  // Populate username and profilePic from User model
      .sort({ createdAt: -1 }); 

    if (!comments) {
      return res.status(404).json({ error: 'No comments found' });
    }

    res.status(200).json({ comments });
  } catch (err) {
    console.error('Error fetching comments:', err);
    res.status(500).json({ error: 'Server error while fetching comments' });
  }
};


