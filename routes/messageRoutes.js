const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middlewares/auth');

router.get('/:communityId', messageController.getMessages);
router.post('/', auth, messageController.createMessage);

module.exports = router;
