const cron = require('node-cron');
const Post = require('../models/Post');

cron.schedule('0 0 * * *', async () => {
  console.log('[CRON] Running post promotion task');

  const groupIds = await Post.distinct('groupId', { isQueued: true });

  for (const groupId of groupIds) {
    const topPost = await Post.findOne({ groupId, isQueued: true }).sort({ votes: -1 });

    if (topPost) {
      topPost.isQueued = false;
      topPost.approvedAt = new Date();
      topPost.votes = 0;
      await topPost.save();

      // Delete or reset other queue items
      await Post.updateMany(
        { groupId, isQueued: true, _id: { $ne: topPost._id } },
        { $set: { votes: 0 } }
      );
    }
  }
});