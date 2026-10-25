const express = require('express');
const { googleSignIn, refresh, logout, me } = require('./auth.controller');
const auth = require('../../middleware/auth');

const router = express.Router();

router.post('/google', googleSignIn);
const apple = require('./apple-auth.controller').createAppleAuthController();
router.post('/apple', apple.signIn);
router.post('/apple/link', auth, apple.link);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', auth, me);

module.exports = router;
