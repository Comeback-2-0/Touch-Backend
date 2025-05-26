// routes/communityRoutes.js
const express = require('express');
const router  = express.Router();
const communityController = require('../controllers/communityController');

// get list of communities
router.get('/', communityController.getAllCommunities);

// create a new community (for admins/future use)
router.post('/', communityController.createCommunity);

module.exports = router;