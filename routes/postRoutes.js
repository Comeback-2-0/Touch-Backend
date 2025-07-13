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
const router = express.Router();

router.get('/:groupId/posts', getApprovedPosts);
router.post('/:postId/like', likePost);
router.post('/:postId/dislike', dislikePost);
router.post('/:postId/comment', createComment);
router.post('/comments/:commentId/reply', replyToComment);
router.post('/create', upload.single('image'), createPost);
router.get('/:postId/comments', require('../controllers/commentController').getComments);

module.exports = router;