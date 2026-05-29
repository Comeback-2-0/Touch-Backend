const express = require('express');
const { googleSignIn, refresh, logout, me } = require('./auth.controller');
const auth = require('../../middleware/auth');

const router = express.Router();

router.post('/google', googleSignIn);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', auth, me);

module.exports = router;
