const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User'); // You'll create this
const client = new OAuth2Client('YOUR_WEB_CLIENT_ID');

const googleSignIn = async (req, res) => {
  const { idToken } = req.body;

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: '160562514921-n7apc9k12tliqgni4ri10k5901qpvpmr.apps.googleusercontent.com',
    });

    const payload = ticket.getPayload();

    const { name, email, picture, sub } = payload;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        photo: picture,
        uid: sub,
      });
    }

    return res.status(200).json({ user });
  } catch (err) {
    console.error('Google Sign-In error:', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { googleSignIn };