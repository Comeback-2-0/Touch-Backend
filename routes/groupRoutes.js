// app/routes/groupRoutes.js
const express = require('express');
const {
  getJoinedGroups,
  getTrendingGroups,
  joinGroup,
  searchGroups,
} = require('../controllers/groupController');
const router = express.Router();

router.get('/joined/:userId', getJoinedGroups);
router.get('/trending', getTrendingGroups);
router.get('/search', searchGroups);
router.post('/:groupId/join', joinGroup);

module.exports = router;