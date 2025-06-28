const express = require('express');
const router = express.Router();
const {
  addReply,
  likeComment,
  dislikeComment,
  reportComment,
  likeReply,
  dislikeReply,
  reportReply,
  getReplies
} = require('../controllers/commentController');

// POST /comments/:commentId/replies
router.post('/:commentId/replies', addReply);

// GET /comments/:commentId/replies
router.get('/:commentId/replies', getReplies);

// POST /comments/:commentId/like
router.post('/:commentId/like', likeComment);
// POST /comments/:commentId/dislike
router.post('/:commentId/dislike', dislikeComment);
// POST /comments/:commentId/report
router.post('/:commentId/report', reportComment);

// POST /comments/:commentId/replies/:replyId/like
router.post('/:commentId/replies/:replyId/like', likeReply);
// POST /comments/:commentId/replies/:replyId/dislike
router.post('/:commentId/replies/:replyId/dislike', dislikeReply);
// POST /comments/:commentId/replies/:replyId/report
router.post('/:commentId/replies/:replyId/report', reportReply);

module.exports = router;