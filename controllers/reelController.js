const Reel = require('../models/Reel');
const MoodPreferences = require('../models/MoodPreferences');
const Save = require('../models/saveModel'); 
const mongoose = require('mongoose'); 
exports.getMoodBasedReels = async (req, res) => {
  try {
    const mood = req.query.mood;
    const userId = req.query.userId;
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
        videoUrl: `http://${req.hostname}:3333/uploads/${cleanPath}`,
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
    const { userId } = req.query;
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
    const { userId, reelId, mood, duration } = req.body;
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

//const Reel = require('../models/Reel');  // Assuming your Reel model is defined in models/Reel.js
 // Assuming your Save model is defined in models/saveModel.js

// Fetch saved reels for a specific user