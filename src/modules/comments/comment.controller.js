const Comment = require('./comment.model');

// GET all comments for a post, sorted by likes + replies count
exports.getComments = async (req, res) => {
  const comments = await Comment.find({ postId: req.params.postId })
    .sort({
      likes: -1,
      'replies.length': -1,
    });
  res.json(comments);
};

// GET all replies for a specific comment, sorted oldest→newest
exports.getReplies = async (req, res) => {
  const { commentId } = req.params;
  const comment = await Comment.findById(commentId).select('replies');
  if (!comment) {
    return res.status(404).json({ error: 'Comment not found' });
  }

  // sort replies by creation time (oldest first)
  const sorted = comment.replies
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);

  res.json(sorted);
};

// POST a new reply to a comment
exports.addReply = async (req, res) => {
  const { text } = req.body;
  const userId = req.user.id;
  const comment = await Comment.findById(req.params.commentId);
  comment.replies.push({ text, userId });
  await comment.save();
  res.json({ message: 'Reply added', reply: comment.replies.slice(-1)[0] });
};

// Helper to update a “likes” or “dislikes” or “reportedBy” array
async function updateCommentField(req, res, type, action) {
  const { commentId, replyId } = req.params;
  const userId = req.user.id;

  const comment = await Comment.findById(commentId);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  let target = comment;
  if (replyId) {
    target = comment.replies.id(replyId);
    if (!target) return res.status(404).json({ error: 'Reply not found' });
  }

  const likeArr = target.likedBy || [];
  const dislikeArr = target.dislikedBy || [];
  const reportArr = target.reportedBy || [];

  if (action === 'like') {
    if (likeArr.includes(userId)) {
      // Unlike
      target.likedBy = likeArr.filter(u => u !== userId);
      target.likes--;
    } else {
      // Like
      target.likedBy.push(userId);
      target.likes++;
      // Remove from dislike if present
      if (dislikeArr.includes(userId)) {
        target.dislikedBy = dislikeArr.filter(u => u !== userId);
        target.dislikes--;
      }
    }
  }

  if (action === 'dislike') {
    if (dislikeArr.includes(userId)) {
      // Remove dislike
      target.dislikedBy = dislikeArr.filter(u => u !== userId);
      target.dislikes--;
    } else {
      // Add dislike
      target.dislikedBy.push(userId);
      target.dislikes++;
      // Remove like if present
      if (likeArr.includes(userId)) {
        target.likedBy = likeArr.filter(u => u !== userId);
        target.likes--;
      }
    }
  }

  if (action === 'report') {
    if (!reportArr.includes(userId)) {
      target.reportedBy.push(userId);
    }
  }

  await comment.save();
  res.json({ message: `${action}${replyId ? ' reply' : ''} updated` });
}

exports.likeComment    = (req, res) => updateCommentField(req, res, null, 'like');
exports.dislikeComment = (req, res) => updateCommentField(req, res, null, 'dislike');
exports.reportComment  = (req, res) => updateCommentField(req, res, null, 'report');
exports.likeReply      = (req, res) => updateCommentField(req, res, 'reply', 'like');
exports.dislikeReply   = (req, res) => updateCommentField(req, res, 'reply', 'dislike');
exports.reportReply    = (req, res) => updateCommentField(req, res, 'reply', 'report');
