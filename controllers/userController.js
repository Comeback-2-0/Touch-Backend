// controllers/userController.js
const User = require("../models/User");

// Google Login – find or create user
exports.findOrCreateUser = async (req, res) => {
  try {
    const { uid, name, email, photo } = req.body;

    let user = await User.findOne({ email });

    if (!user) {
      user = new User({ uid, name, email, photo });
      await user.save();
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("User create/find error:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Future implementation placeholders
exports.register = (req, res) => {
  res.status(501).json({ message: "Register not implemented" });
};

exports.login = (req, res) => {
  res.status(501).json({ message: "Login not implemented" });
};

exports.getProfile = (req, res) => {
  res.status(501).json({ message: "Get profile not implemented" });
};

exports.updateProfile = (req, res) => {
  res.status(501).json({ message: "Update profile not implemented" });
};
