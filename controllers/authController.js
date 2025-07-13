const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID); // ✅ Use .env

const googleSignIn = async (req, res) => {
  const { idToken } = req.body;

  try {
    // 🔐 Verify Google ID Token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { name, email, picture, sub } = payload;

    // 👤 Check or Create User
    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        photo: picture,
        uid: sub, // optional
      });
      console.log('🆕 New user created:', email);
    } else {
      console.log('✅ Existing user:', email);
    }

    // 🔑 Create JWT
    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name },
      process.env.JWT_SECRET || 'dev-secret-key',
      { expiresIn: '7d' }
    );

    res.status(200).json({ token, user });

  } catch (err) {
    console.error('❌ Google Sign-In Error:', err.message);
    res.status(401).json({ error: 'Invalid token or server error' });
  }
};

module.exports = { googleSignInh };
