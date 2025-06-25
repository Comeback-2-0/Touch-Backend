// app/routes/queueRoutes.js
const express = require('express');
const {
  getQueue,
  voteQueuePost,
  reportQueuePost,
  undoReportQueuePost
} = require('../controllers/queueController');
const router = express.Router();

router.get('/:groupId', getQueue);
router.post('/:postId/vote', voteQueuePost);
router.post('/:postId/report', reportQueuePost);
router.post('/:postId/unreport', undoReportQueuePost);


module.exports = router;