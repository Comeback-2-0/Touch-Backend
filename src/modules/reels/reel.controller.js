// controllers/reelController.js
const Reel = require('./reel.model');
const Comment = require('./reel-comment.model');
const { createEngagementRepository } = require('../graph/engagement.repository');
const { createAstraEventRepository } = require('../feed/astra-event.repository');

exports.getMoodBasedReels = async (req, res) => {
  try {
    const mood = req.query.mood;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;

    const allReels = await Reel.find({ mood: mood });

    const scoredReels = allReels.map(reel => {
      let score = 0;

      score += (reel.likes * 2) + (reel.comments * 1.5) + (reel.saves * 3) + (reel.shares * 4);

      const hoursOld = (Date.now() - new Date(reel.createdAt)) / (1000 * 60 * 60);
      if (hoursOld < 24) score += 5;
      else if (hoursOld < 72) score += 2;

      score += Math.random() * 3; // small randomness

      return { ...reel._doc, score };
    });

    scoredReels.sort((a, b) => b.score - a.score);

    const start = (page - 1) * limit;
    const paginated = scoredReels.slice(start, start + limit);

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
    console.error('getMoodBasedReels error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};
exports.getMoodPreferencesForUser = async (req, res) => {
  try {
    const userId = req.user.id;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const allMoods = await Reel.distinct('mood');
    const final = shuffleArray(allMoods);

    res.json(final);
  } catch (err) {
    console.error('getMoodPreferencesForUser error:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};

function shuffleArray(arr) {
  return arr.sort(() => 0.5 - Math.random());
}
function createReelWatchHandlers({
  reelModel = Reel,
  eventRepository,
} = {}) {
  const repository = eventRepository || createAstraEventRepository();

  async function recordWatchTime(req, res) {
    try {
      const { reelId, mood, duration } = req.body;
      const userId = req.user.id;
      if (!userId || !reelId || typeof duration !== 'number' || typeof mood !== 'string') {
        return res.status(400).json({ message: 'Missing or invalid parameters' });
      }

      await repository.recordWatchEvent({
        userId,
        contentId: reelId,
        contentType: 'reel',
        durationMs: duration,
        completed: false,
      });

      await reelModel.findByIdAndUpdate(reelId, {
        $inc: { totalViews: 1, totalWatchTime: duration },
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ message: 'Failed to record watch time' });
    }
  }

  return { recordWatchTime };
}

let defaultReelWatchHandlers;

function getDefaultReelWatchHandlers() {
  if (!defaultReelWatchHandlers) {
    defaultReelWatchHandlers = createReelWatchHandlers();
  }
  return defaultReelWatchHandlers;
}

exports.createReelWatchHandlers = createReelWatchHandlers;
exports.recordWatchTime = (req, res) => getDefaultReelWatchHandlers().recordWatchTime(req, res);

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

function createReelEngagementHandlers({
  reelModel = Reel,
  engagementRepository,
} = {}) {
  const repository = engagementRepository || createEngagementRepository();

  async function likeReel(req, res) {
    try {
      const { reelId } = req.body;
      const userId = req.user.id;
      if (!reelId) return res.status(400).json({ error: 'reelId is required' });

      const input = { userId, contentId: reelId, contentType: 'reel' };
      const liked = await repository.hasLiked(input);

      if (liked) {
        await repository.unlikeContent(input);
        await reelModel.findByIdAndUpdate(reelId, { $inc: { likes: -1 } });
        return res.status(200).json({ message: 'Like removed successfully', liked: false });
      }

      await repository.likeContent(input);
      await reelModel.findByIdAndUpdate(reelId, { $inc: { likes: 1 } });
      return res.status(200).json({ message: 'Like added successfully', liked: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to like reel' });
    }
  }

  async function saveReel(req, res) {
    try {
      const { reelId } = req.body;
      const userId = req.user.id;
      if (!reelId) return res.status(400).json({ error: 'reelId is required' });

      const input = { userId, contentId: reelId, contentType: 'reel' };
      const saved = await repository.hasSaved(input);

      if (saved) {
        await repository.unsaveContent(input);
        await reelModel.findByIdAndUpdate(reelId, { $inc: { saves: -1 } });
        return res.status(200).json({ message: 'Save removed successfully', saved: false });
      }

      await repository.saveContent(input);
      await reelModel.findByIdAndUpdate(reelId, { $inc: { saves: 1 } });
      return res.status(200).json({ message: 'Save added successfully', saved: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save reel' });
    }
  }

  return { likeReel, saveReel };
}

let defaultReelEngagementHandlers;

function getDefaultReelEngagementHandlers() {
  if (!defaultReelEngagementHandlers) {
    defaultReelEngagementHandlers = createReelEngagementHandlers();
  }
  return defaultReelEngagementHandlers;
}

exports.createReelEngagementHandlers = createReelEngagementHandlers;
exports.likeReel = (req, res) => getDefaultReelEngagementHandlers().likeReel(req, res);
exports.saveReel = (req, res) => getDefaultReelEngagementHandlers().saveReel(req, res);

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

