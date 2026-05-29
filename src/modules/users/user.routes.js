const express = require('express');
const userController = require('./user.controller');
const auth = require('../../middleware/auth');

const router = express.Router();

router.post('/register', userController.register);
router.post('/login', userController.login);

router.get('/check-username/:username', userController.checkUsername);
router.post('/complete-profile', auth, userController.completeProfile);
router.get('/me', auth, userController.getMe);
router.patch('/me', auth, userController.updateMe);

router.get('/profile', auth, userController.getProfile);
router.put('/profile', auth, userController.updateProfile);

module.exports = router;
