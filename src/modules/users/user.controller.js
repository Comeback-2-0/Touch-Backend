const userService = require('./user.service');

function sendError(res, err) {
  return res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
}

exports.register = (req, res) => {
  res.status(501).json({ message: 'Register not implemented' });
};

exports.login = (req, res) => {
  res.status(501).json({ message: 'Login not implemented' });
};

exports.completeProfile = async (req, res) => {
  try {
    const user = await userService.completeProfile(req.user.id, req.body);
    return res.status(200).json({ user });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await userService.getCurrentUser(req.user.id);
    return res.status(200).json({ user });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.updateMe = async (req, res) => {
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'PATCH /users/me requires application/json' });
  }

  try {
    const user = await userService.updateProfile(req.user.id, req.body);
    return res.status(200).json({ user });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.checkUsername = async (req, res) => {
  try {
    const available = await userService.isUsernameAvailable(req.params.username);
    return res.status(200).json({ available });
  } catch (err) {
    return sendError(res, err);
  }
};

exports.getProfile = exports.getMe;
exports.updateProfile = exports.updateMe;
