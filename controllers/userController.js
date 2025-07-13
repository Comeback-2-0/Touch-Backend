const User = require('../models/User');

// Manual register/login placeholders
exports.register = (req, res) => {
  res.status(501).json({ message: "Register not implemented" });
};

exports.login = (req, res) => {
  res.status(501).json({ message: "Login not implemented" });
};

// 🔐 Used by JWT-protected route
exports.getProfile = async (req, res) => {
  try {
    const { uid, name, email, photo } = req.user;
    res.json({ uid, name, email, photo });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
};

exports.updateProfile = (req, res) => {
  res.status(501).json({ message: "Update profile not implemented" });
};

// ✅ Google login + register
exports.findOrCreateUser = async (req, res) => {
  try {
    const { name, email, googleId, photo } = req.body;

    if (!email || !name || !googleId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = new User({
        name,
        email,
        googleId,
        photo: photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png",
      });
      await user.save();
    }

    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
