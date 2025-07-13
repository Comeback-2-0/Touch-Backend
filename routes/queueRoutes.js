// app/routes/queueRoutes.js
const express = require('express');
const {
  getQueue,
  voteQueuePost,
  reportQueuePost,
  undoReportQueuePost,
  promoteTopPost,
} = require('../controllers/queueController');
const router = express.Router();

router.get('/:groupId', getQueue);
router.post('/:postId/vote', voteQueuePost);
router.post('/:postId/report', reportQueuePost);
router.post('/:postId/unreport', undoReportQueuePost);
router.post('/promote/:groupId', promoteTopPost);


module.exports = router;