// routes/chatRoutes.js

const express = require('express');
const router = express.Router();

const { getUserGroups } = require('../controllers/chatController');

// Route: POST /api/chat/groups
router.post('/groups', getUserGroups);

module.exports = router;
