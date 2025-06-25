// app/controllers/postController.js
const Post = require('../models/Post');
const Comment = require('../models/Comment');

exports.getApprovedPosts = async (req, res) => {
  const posts = await Post.find({
    groupId: req.params.groupId,
    isQueued: false,
  })
    .sort({ approvedAt: -1 })
    .populate('comments');
  res.json(posts);
};

exports.likePost = async (req, res) => {
  const post = await Post.findById(req.params.postId);
  post.likes += 1;
  await post.save();
  res.json({ message: 'Liked' });
};

exports.createComment = async (req, res) => {
  const { text, userId } = req.body;
  const comment = new Comment({ postId: req.params.postId, text, userId });
  await comment.save();

  await Post.findByIdAndUpdate(req.params.postId, {
    $push: { comments: comment._id },
  });

  res.json(comment);
};

exports.replyToComment = async (req, res) => {
  const { text, userId } = req.body;
  const comment = await Comment.findById(req.params.commentId);

  comment.replies.push({ text, userId });
  await comment.save();

  res.json({ message: 'Reply added' });
};

exports.createPost = async (req, res) => {
  try {
    const { content, groupId } = req.body;
    let imageUrl = null;

    if (req.file) {
      imageUrl = `https://api.comeback.website/uploads/${req.file.filename}`;
    }

    const newPost = new Post({
      groupId,
      content,
      isQueued: true,
      image: imageUrl,
    });

    await newPost.save();
    res.status(201).json(newPost);
  } catch (err) {
    console.error('Post creation error:', err);
    res.status(500).json({ error: 'Post creation failed' });
  }
};
