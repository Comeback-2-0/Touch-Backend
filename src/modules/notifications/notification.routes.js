// routes/notificationRoutes.js
const express = require('express');
const router  = express.Router();
const notificationController = require('./notification.controller');

// fetch logged-in user’s notifications
router.get('/', notificationController.getMyNotifications);

// mark a notification as seen
router.patch('/:id/seen', notificationController.markAsSeen);

module.exports = router;