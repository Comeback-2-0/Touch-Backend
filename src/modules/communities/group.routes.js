// app/routes/groupRoutes.js
const express = require('express');
const {
  getJoinedGroups,
  getTrendingGroups,
  joinGroup,
  searchGroups,
} = require('./group.controller');
const auth = require('../../middleware/auth');
const router = express.Router();

router.get('/joined/me', auth, getJoinedGroups);
router.get('/joined/:userId', getJoinedGroups);
router.get('/trending', getTrendingGroups);
router.get('/search', searchGroups);
router.post('/:groupId/join', auth, joinGroup);

module.exports = router;
