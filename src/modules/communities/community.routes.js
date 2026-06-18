const express = require('express');
const router = express.Router();
const communityRepository = require('./community.repository');

router.get('/', async (req, res) => {
  try {
    const communities = await communityRepository.listAll();
    res.json(communities);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch communities' });
  }
});

module.exports = router;
