const express = require('express');
const router = express.Router();
const auth = require('../middlewares/auth');
const User = require('../models/User');

// ✅ Import all controllers
const {
  register,
  login,
  getProfile,
  updateProfile,
  findOrCreateUser,
  getUserByEmail,
  createUser,
} = require('../controllers/userController');

// 🔐 Google OAuth login/signup
router.post('/auth/google', findOrCreateUser);

// 🧾 Manual Auth Routes
router.post('/register', register);  // User registration
router.post('/login', login);        // Manual login → returns JWT

// 🛡️ Protected Profile Routes
router.get('/profile', auth, getProfile);       // Get profile
router.put('/profile', auth, updateProfile);    // Update profile

// 🌐 Additional User Utilities
router.get('/user/:email', getUserByEmail);     // Find user by email
router.post('/user', createUser);               // Create user (used by admin/panel maybe)

module.exports = router;

