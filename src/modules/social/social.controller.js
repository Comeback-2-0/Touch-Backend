const {createSocialRepository} = require('./social.repository');
const {createSocialService} = require('./social.service');
const {createUserRepository} = require('../users/user.repository');

let socialService;
function getSocialService() {
  if (!socialService) {
    const userRepository = createUserRepository();
    socialService = createSocialService({
      socialRepository: createSocialRepository({userRepository}),
      userRepository,
    });
  }
  return socialService;
}

function safeError(res, error) {
  return res.status(error.statusCode || 500).json({error: error.statusCode ? error.message : 'Unable to update relationship', code: error.code || 'SOCIAL_OPERATION_FAILED'});
}

exports.relationship = async (req, res) => {
  try { return res.json(await getSocialService().relationship({viewerId: req.user.id, targetId: req.params.userId})); } catch (error) { return safeError(res, error); }
};
exports.listRequests = async (req, res) => {
  try { return res.json({requests: await getSocialService().listPendingRequests({viewerId: req.user.id})}); } catch (error) { return safeError(res, error); }
};
exports.listUsers = async (req, res) => {
  try { return res.json({users: await getSocialService().listUsers({viewerId: req.user.id, targetId: req.params.userId, direction: req.params.direction, limit: req.query.limit})}); } catch (error) { return safeError(res, error); }
};
exports.follow = async (req, res) => {
  try { return res.status(200).json(await getSocialService().follow({viewerId: req.user.id, targetId: req.params.userId})); } catch (error) { return safeError(res, error); }
};
exports.unfollow = async (req, res) => {
  try { return res.status(200).json(await getSocialService().unfollow({viewerId: req.user.id, targetId: req.params.userId})); } catch (error) { return safeError(res, error); }
};
exports.accept = async (req, res) => {
  try { return res.json(await getSocialService().acceptRequest({viewerId: req.user.id, requestId: req.params.requestId})); } catch (error) { return safeError(res, error); }
};
exports.reject = async (req, res) => {
  try { return res.json(await getSocialService().rejectRequest({viewerId: req.user.id, requestId: req.params.requestId})); } catch (error) { return safeError(res, error); }
};
exports.block = async (req, res) => {
  try { return res.json(await getSocialService().block({viewerId: req.user.id, targetId: req.params.userId})); } catch (error) { return safeError(res, error); }
};
exports.unblock = async (req, res) => {
  try { return res.json(await getSocialService().unblock({viewerId: req.user.id, targetId: req.params.userId})); } catch (error) { return safeError(res, error); }
};
exports.mute = async (req, res) => {
  try { return res.json(await getSocialService().mute({viewerId: req.user.id, targetId: req.params.userId})); } catch (error) { return safeError(res, error); }
};
exports.unmute = async (req, res) => {
  try { return res.json(await getSocialService().unmute({viewerId: req.user.id, targetId: req.params.userId})); } catch (error) { return safeError(res, error); }
};
