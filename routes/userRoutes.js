// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middlewares/auth');  // JWT auth middleware (placeholder)

// Public routes (no auth)
router.post('/register', userController.register);   // User registration
router.post('/login',    userController.login);      // User login (returns JWT on success)

// Protected routes (require JWT auth middleware)
router.get('/profile',    auth, userController.getProfile);    // Get current user's profile
router.put('/profile',    auth, userController.updateProfile); // Update profile details
// (Additional routes like password reset, list of moods, etc., can be added here)

module.exports = router;