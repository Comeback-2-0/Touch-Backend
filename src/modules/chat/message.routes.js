const express = require('express');
const router = express.Router();
const messageController = require('./message.controller');
const auth = require('../../middleware/auth');

router.get('/:communityId', messageController.getMessages);
router.post('/', auth, messageController.createMessage);

module.exports = router;
