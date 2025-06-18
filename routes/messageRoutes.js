const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

router.get('/:communityId', messageController.getMessages);
router.post('/', messageController.createMessage);

module.exports = router;