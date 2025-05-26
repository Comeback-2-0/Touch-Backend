// routes/messageRoutes.js
const express = require('express');
const router  = express.Router();
const messageController = require('../controllers/messageController');

// list recent messages in a community  →  GET /api/messages/:communityId
router.get('/:communityId', messageController.getMessages);

// post a new message to a community   →  POST /api/messages/:communityId
router.post('/:communityId', messageController.postMessage);

module.exports = router;