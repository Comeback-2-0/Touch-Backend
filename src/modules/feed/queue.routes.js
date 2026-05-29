// app/routes/queueRoutes.js
const express = require('express');
const {
  getQueue,
  voteQueuePost,
  reportQueuePost,
  undoReportQueuePost,
  promoteTopPost,
} = require('./queue.controller');
const auth = require('../../middleware/auth');
const router = express.Router();

router.get('/:groupId', auth, getQueue);
router.post('/:postId/vote', auth, voteQueuePost);
router.post('/:postId/report', auth, reportQueuePost);
router.post('/:postId/unreport', auth, undoReportQueuePost);
router.post('/promote/:groupId', auth, promoteTopPost);


module.exports = router;
