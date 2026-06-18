const express = require('express');
const router = express.Router();
const notificationController = require('./notification.controller');
const auth = require('../../middleware/auth');

router.use(auth);

router.get('/', notificationController.getMyNotifications);
router.get('/preferences', notificationController.getPreferences);
router.put('/preferences', notificationController.updatePreferences);
router.patch('/:id/seen', notificationController.markAsSeen);

module.exports = router;
