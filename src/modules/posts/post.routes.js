// app/routes/postRoutes.js
const express = require('express');
const upload = require('../../middleware/upload');
const {
  getApprovedPosts,
  createComment,
  likePost,
  dislikePost,
  replyToComment,
  createPost,
} = require('./post.controller');
const auth = require('../../middleware/auth');
const router = express.Router();

router.get('/:groupId/posts', getApprovedPosts);
router.post('/:postId/like', auth, likePost);
router.post('/:postId/dislike', auth, dislikePost);
router.post('/:postId/comment', auth, createComment);
router.post('/comments/:commentId/reply', auth, replyToComment);
router.post('/create', auth, upload.single('image'), createPost);
router.get('/:postId/comments', require('../comments/comment.controller').getComments);

module.exports = router;
