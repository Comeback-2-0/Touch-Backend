// routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const { getGroupMessages } = require('../controllers/messageController');

// GET /api/messages/:groupId
router.get('/:groupId', getGroupMessages);

module.exports = router;
