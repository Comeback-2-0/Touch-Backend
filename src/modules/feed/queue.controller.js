const Post = require('../posts/post.model');

exports.getQueue = async (req, res) => {
  const posts = await Post.find({
    groupId: req.params.groupId,
    isQueued: true,
  }).sort({ votes: -1 });
  res.json(posts);
};

exports.voteQueuePost = async (req, res) => {
  const userId = req.user.id;
  const post = await Post.findById(req.params.postId);
  const hasVoted = post.votedBy.includes(userId);
  if (hasVoted) {
    post.votes -= 1;
    post.votedBy = post.votedBy.filter(id => id.toString() !== userId);
  } else {
    post.votes += 1;
    post.votedBy.push(userId);
  }
  await post.save();
  res.json({ message: hasVoted ? 'Vote removed' : 'Voted' });
};


exports.reportQueuePost = async (req, res) => {
  const userId = req.user.id;
  const post = await Post.findById(req.params.postId);

  if (!post.reportedBy.includes(userId)) {
    post.reportedBy.push(userId);
    await post.save();
    return res.json({ message: 'Reported' });
  }

  res.status(400).json({ error: 'Already reported' });
};

exports.undoReportQueuePost = async (req, res) => {
  const userId = req.user.id;

  const post = await Post.findById(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  post.reportedBy = post.reportedBy.filter(id => id.toString() !== userId);
  await post.save();

  res.json({ message: 'Report undone' });
};

exports.promoteTopPost = async (req, res) => {
  const { groupId } = req.params;

  try {
    // 1. Find the top-voted queued post
    const topPost = await Post.findOne({
      groupId,
      isQueued: true
    })
      .sort({ votes: -1, createdAt: 1 }) // Sort by votes (desc), then by oldest
      .exec();

    if (!topPost) {
      return res.status(404).json({ message: 'No queued posts found' });
    }

    // 2. Promote this top post
    topPost.isQueued = false;
    topPost.approvedAt = new Date();
    await topPost.save();

    // 3. Demote all others in queue by setting their votes to -1
    await Post.updateMany(
      {
        groupId,
        isQueued: true,
        _id: { $ne: topPost._id }, // exclude the promoted post
      },
      { $set: { votes: -1 } }
    );

    return res.json({ message: 'Top post promoted', post: topPost });
  } catch (error) {
    console.error('Promotion error:', error);
    return res.status(500).json({ message: 'Failed to promote post' });
  }
};
