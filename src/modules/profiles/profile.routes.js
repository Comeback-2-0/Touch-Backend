const express = require('express');
const auth = require('../../middleware/auth');
const {createPublicProfileService} = require('./public-profile.service');
const {createUserRepository} = require('../users/user.repository');
const {createSocialRepository} = require('../social/social.repository');
const {createStage1RateLimit} = require('../../middleware/stage1RateLimit');
const {requireStage1Profile} = require('../../middleware/stage1ProfileComplete');

const router = express.Router();
let service;
function getService() {
  if (!service) service = createPublicProfileService({userRepository: createUserRepository(), socialRepository: createSocialRepository()});
  return service;
}

router.get('/:userId', auth, requireStage1Profile, createStage1RateLimit({key: 'profile-lookup', accountLimit: 120, ipLimit: 240}), async (req, res) => {
  try {
    return res.json({user: await getService().getProfile({viewerId: req.user.id, targetId: req.params.userId})});
  } catch (error) {
    return res.status(error.statusCode || 500).json({error: error.statusCode ? error.message : 'Unable to load profile', code: error.code || 'PROFILE_UNAVAILABLE'});
  }
});

module.exports = router;
