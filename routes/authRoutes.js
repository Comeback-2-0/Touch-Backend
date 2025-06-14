const express = require('express');
const router = express.Router();
const admin = require('../firebase/admin');
const User = require('../models/User');

// POST /api/auth/google
router.post('/google', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ message: 'Missing idToken in request body' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name, picture } = decodedToken;

    let user = await User.findOne({ uid });

    if (!user) {
      user = new User({
        uid,
        email,
        name: name || 'No Name',
        photoURL: picture || '',
      });
      await user.save();
    }

    res.status(200).json({ message: 'Authentication successful', user });
  } catch (error) {
    console.error('Error verifying ID token:', error);
    res.status(401).json({ message: 'Invalid or expired ID token' });
  }
});

module.exports = router;
