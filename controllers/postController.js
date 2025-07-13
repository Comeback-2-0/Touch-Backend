// app/controllers/postController.js
const Post = require("../models/Post");
const Comment = require("../models/Comment");

exports.getApprovedPosts = async (req, res) => {
  const posts = await Post.find({
    groupId: req.params.groupId,
    isQueued: false,
  })
    .sort({ approvedAt: -1 })
    .populate("comments");
  res.json(posts);
};

exports.likePost = async (req, res) => {
  const { userId } = req.body;
  const post = await Post.findById(req.params.postId);

  if (!post) return res.status(404).json({ error: "Post not found" });

  const alreadyLiked = post.likedBy.includes(userId);
  const alreadyDisliked = post.dislikedBy.includes(userId);

  if (alreadyLiked) {
    // Unlike
    post.likes -= 1;
    post.likedBy = post.likedBy.filter((id) => id !== userId);
  } else {
    // Like
    post.likes += 1;
    post.likedBy.push(userId);

    // Remove dislike if exists
    if (alreadyDisliked) {
      post.dislikes -= 1;
      post.dislikedBy = post.dislikedBy.filter((id) => id !== userId);
    }
  }

  await post.save();
  res.json(post); // Return updated post
};

exports.dislikePost = async (req, res) => {
  const { userId } = req.body;
  const post = await Post.findById(req.params.postId);

  if (!post) return res.status(404).json({ error: "Post not found" });

  const alreadyDisliked = post.dislikedBy.includes(userId);
  const alreadyLiked = post.likedBy.includes(userId);

  if (alreadyDisliked) {
    // Remove dislike
    post.dislikes -= 1;
    post.dislikedBy = post.dislikedBy.filter((id) => id !== userId);
  } else {
    // Dislike
    post.dislikes += 1;
    post.dislikedBy.push(userId);

    // Remove like if exists
    if (alreadyLiked) {
      post.likes -= 1;
      post.likedBy = post.likedBy.filter((id) => id !== userId);
    }
  }

  await post.save();
  res.json(post); // Return updated post
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

  res.json({ message: "Reply added" });
};

exports.createPost = async (req, res) => {
  try {
    const { content, groupId } = req.body;
    let imageUrl = null;

    if (req.file) {
      const baseDomain = process.env.BASE_DOMAIN;
      imageUrl = `https://${baseDomain}/uploads/${req.file.filename}`;
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
    console.error("Post creation error:", err);
    res.status(500).json({ error: "Post creation failed" });
  }
};
