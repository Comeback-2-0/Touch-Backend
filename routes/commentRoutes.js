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
const auth = require('../middlewares/auth');

// POST /comments/:commentId/replies
router.post('/:commentId/replies', auth, addReply);

// GET /comments/:commentId/replies
router.get('/:commentId/replies', getReplies);

// POST /comments/:commentId/like
router.post('/:commentId/like', auth, likeComment);
// POST /comments/:commentId/dislike
router.post('/:commentId/dislike', auth, dislikeComment);
// POST /comments/:commentId/report
router.post('/:commentId/report', auth, reportComment);

// POST /comments/:commentId/replies/:replyId/like
router.post('/:commentId/replies/:replyId/like', auth, likeReply);
// POST /comments/:commentId/replies/:replyId/dislike
router.post('/:commentId/replies/:replyId/dislike', auth, dislikeReply);
// POST /comments/:commentId/replies/:replyId/report
router.post('/:commentId/replies/:replyId/report', auth, reportReply);

module.exports = router;
