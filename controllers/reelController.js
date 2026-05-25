// controllers/reelController.js
const Reel = require('../models/Reel');
const MoodPreferences = require('../models/MoodPreferences');
const Save = require('../models/saveModel'); 
const Like = require('../models/likeModel');
const Comment = require('../models/commentModel');

exports.getMoodBasedReels = async (req, res) => {
  try {
    const mood = req.query.mood;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;

    const userPref = await MoodPreferences.findOne({ userId }) || {
      likedCreators: [],
      watchHistory: [],
    };

    const allReels = await Reel.find({ mood: mood });

    const scoredReels = allReels.map(reel => {
      let score = 0;

      if (userPref.likedCreators.includes(reel.creatorId)) score += 10;

      score += (reel.likes * 2) + (reel.comments * 1.5) + (reel.saves * 3) + (reel.shares * 4);

      const hoursOld = (Date.now() - new Date(reel.createdAt)) / (1000 * 60 * 60);
      if (hoursOld < 24) score += 5;
      else if (hoursOld < 72) score += 2;

      const moodWatchTime = userPref.watchHistory?.filter(r => r.mood === mood)
        .reduce((acc, r) => acc + (r.duration || 0), 0);
      score += (moodWatchTime / 60) * 1.5; // 1.5 pts per min watched of this mood

      score += Math.random() * 3; // small randomness

      return { ...reel._doc, score };
    });

    const watchedIds = userPref.watchHistory.map(r => r.reelId?.toString?.());
    const unseenReels = scoredReels.filter(r => !watchedIds.includes(r._id.toString()));

    unseenReels.sort((a, b) => b.score - a.score);

    const start = (page - 1) * limit;
    const paginated = unseenReels.slice(start, start + limit);

    const formatted = paginated.map((r) => {
      let cleanPath = r.videoPath?.replace(/.*uploads\//, '');
      return {
        _id: r._id,
        mood: r.mood,
        hashtags: r.hashtags,
        creatorId: r.creatorId,
        caption: r.caption,
        likes: r.likes,
        comments: r.comments,
        shares: r.shares,
        saves: r.saves,
        createdAt: r.createdAt,
        videoUrl: `https://${process.env.BASE_DOMAIN}/uploads/${cleanPath}`,
      };
    });

    res.json(formatted);

  } catch (err) {
    console.error('🔥 getMoodBasedReels error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};
exports.getMoodPreferencesForUser = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const prefs = await MoodPreferences.find({ userId });
    const sortedMoods = prefs
      .sort((a, b) => (b.watchTime || 0) - (a.watchTime || 0)) // descending
      .map(p => p.mood);

    const allMoods = await Reel.distinct('mood');
    const remainingMoods = allMoods.filter(m => !sortedMoods.includes(m));

    const final = [...sortedMoods.slice(0, 2), ...shuffleArray(remainingMoods)];

    res.json(final);
  } catch (err) {
    console.error('⚠️ getMoodPreferencesForUser error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};

function shuffleArray(arr) {
  return arr.sort(() => 0.5 - Math.random());
}
exports.recordWatchTime = async (req, res) => {
  try {
    const { reelId, mood, duration } = req.body;
    const userId = req.user.id;
if (!userId || !reelId || !mood || typeof duration !== 'number' || typeof mood !== 'string') {
  return res.status(400).json({ message: 'Missing or invalid parameters' });
}

    await Reel.findByIdAndUpdate(reelId, {
      $inc: { totalViews: 1, totalWatchTime: duration },
    });

       await MoodPreferences.findOneAndUpdate(
      { userId },
      {
        $push: {
          watchHistory: {
            reelId,
            mood,
            duration,
            timestamp: new Date()
          }
        }
      },
      { upsert: true, new: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('⚠️ recordWatchTime error:', err);
    res.status(500).json({ message: 'Failed to record watch time' });
  }
};

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

// Like a reel
exports.likeReel = async (req, res) => {
  try {
    const { reelId } = req.body;
    const userId = req.user.id;

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
    console.log(`Reel ${reelId} liked by user ${userId}`);
  } catch (err) {
    res.status(500).json({ error: 'Failed to like reel', details: err });
  }
};

// Save a reel
exports.saveReel = async (req, res) => {
  try {
    const { reelId } = req.body;
    const userId = req.user.id;

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
exports.commentOnReel = async (req, res) => {
  try {
    const { reelId, text } = req.body;
    const userId = req.user.id;

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

