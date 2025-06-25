const Post = require('../models/Post');

exports.getQueue = async (req, res) => {
  const posts = await Post.find({
    groupId: req.params.groupId,
    isQueued: true,
  }).sort({ votes: -1 });
  res.json(posts);
};

exports.voteQueuePost = async (req, res) => {
  const { userId } = req.body;
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
  const { userId } = req.body;
  const post = await Post.findById(req.params.postId);

  if (!post.reportedBy.includes(userId)) {
    post.reportedBy.push(userId);
    await post.save();
    return res.json({ message: 'Reported' });
  }

  res.status(400).json({ error: 'Already reported' });
};

exports.undoReportQueuePost = async (req, res) => {
  const { userId } = req.body;

  const post = await Post.findById(req.params.postId);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  post.reportedBy = post.reportedBy.filter(id => id.toString() !== userId);
  await post.save();

  res.json({ message: 'Report undone' });
};