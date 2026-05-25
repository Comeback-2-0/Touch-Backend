// app/routes/postRoutes.js
const express = require('express');
const upload = require('../middlewares/upload');
const {
  getApprovedPosts,
  createComment,
  likePost,
  dislikePost,
  replyToComment,
  createPost,
} = require('../controllers/postController');
const auth = require('../middlewares/auth');
const router = express.Router();

router.get('/:groupId/posts', getApprovedPosts);
router.post('/:postId/like', auth, likePost);
router.post('/:postId/dislike', auth, dislikePost);
router.post('/:postId/comment', auth, createComment);
router.post('/comments/:commentId/reply', auth, replyToComment);
router.post('/create', auth, upload.single('image'), createPost);
router.get('/:postId/comments', require('../controllers/commentController').getComments);

module.exports = router;
