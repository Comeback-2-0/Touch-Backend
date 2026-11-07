const express = require('express');
const auth = require('../../middleware/auth');
const controller = require('./social.controller');
const {createStage1RateLimit} = require('../../middleware/stage1RateLimit');
const {requireStage1Profile} = require('../../middleware/stage1ProfileComplete');

const router = express.Router();
router.use(auth);
router.use(requireStage1Profile);
const socialReadLimit = createStage1RateLimit({key: 'social-read', windowSeconds: 60, accountLimit: 120, ipLimit: 240});
// The follow endpoint also creates private-account requests, so the shared
// mutation ceiling keeps both follow actions and request spam bounded.
const followLimit = createStage1RateLimit({key: 'social-follow', windowSeconds: 3600, accountLimit: 30, ipLimit: 60});
const graphMutationLimit = createStage1RateLimit({key: 'social-graph-mutation', windowSeconds: 3600, accountLimit: 60, ipLimit: 120});
const requestDecisionLimit = createStage1RateLimit({key: 'social-request-decision', windowSeconds: 3600, accountLimit: 60, ipLimit: 120});
router.get('/users/:userId/relationship', socialReadLimit, controller.relationship);
router.get('/follow-requests', socialReadLimit, controller.listRequests);
router.get('/users/:userId/followers', socialReadLimit, (req, res, next) => { req.params.direction = 'followers'; return controller.listUsers(req, res, next); });
router.get('/users/:userId/following', socialReadLimit, (req, res, next) => { req.params.direction = 'following'; return controller.listUsers(req, res, next); });
router.post('/users/:userId/follow', followLimit, controller.follow);
router.delete('/users/:userId/follow', followLimit, controller.unfollow);
router.post('/follow-requests/:requestId/accept', requestDecisionLimit, controller.accept);
router.post('/follow-requests/:requestId/reject', requestDecisionLimit, controller.reject);
router.post('/users/:userId/block', graphMutationLimit, controller.block);
router.delete('/users/:userId/block', graphMutationLimit, controller.unblock);
router.post('/users/:userId/mute', graphMutationLimit, controller.mute);
router.delete('/users/:userId/mute', graphMutationLimit, controller.unmute);

module.exports = router;
