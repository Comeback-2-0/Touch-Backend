// controllers/userController.js
exports.register = (req, res) => {
  // TODO: Validate input, hash password, create new User
  res.status(501).json({ message: "Register not implemented" });
};

exports.login = (req, res) => {
  // TODO: Authenticate user (check password), generate JWT
  res.status(501).json({ message: "Login not implemented" });
};

exports.getProfile = (req, res) => {
  // TODO: Fetch user profile from DB (use req.user from auth middleware)
  res.status(501).json({ message: "Get profile not implemented" });
};

exports.updateProfile = (req, res) => {
  // TODO: Update user profile in DB
  res.status(501).json({ message: "Update profile not implemented" });
};