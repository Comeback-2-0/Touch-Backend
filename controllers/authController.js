const { OAuth2Client } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');
const { connectRedis } = require('../services/redisClient');
const {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('../services/tokenService');
const {
  storeRefreshSession,
  getRefreshSession,
  deleteRefreshSession,
} = require('../services/refreshSessionService');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function toPublicUser(user) {
  return {
    _id: user._id,
    uid: user.uid,
    name: user.name,
    email: user.email,
    photo: user.photo,
    role: user.role || 'user',
  };
}

async function issueTokenPair(user, existingSessionId) {
  const redis = await connectRedis();
  const sessionId = existingSessionId || uuidv4();
  const userId = user._id.toString();
  const accessToken = createAccessToken({
    userId,
    email: user.email,
    role: user.role || 'user',
    sessionId,
  });
  const refreshToken = createRefreshToken({ userId, sessionId });

  await storeRefreshSession(redis, {
    sessionId,
    userId,
    refreshToken,
  });

  return { accessToken, refreshToken };
}

const googleSignIn = async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'idToken is required' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
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
        lastLoginAt: new Date(),
      });
    } else {
      user.name = name || user.name;
      user.photo = picture || user.photo;
      user.uid = user.uid || sub;
      user.lastLoginAt = new Date();
      await user.save();
    }

    const tokens = await issueTokenPair(user);
    return res.status(200).json({ user: toPublicUser(user), ...tokens });
  } catch (err) {
    console.error('Google Sign-In error:', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const refresh = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  try {
    const decoded = verifyRefreshToken(refreshToken);
    const redis = await connectRedis();
    const session = await getRefreshSession(redis, decoded.sessionId);

    if (!session || session.userId !== decoded.sub || session.tokenHash !== hashToken(refreshToken)) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await User.findById(decoded.sub);
    if (!user) {
      await deleteRefreshSession(redis, decoded.sessionId);
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    await deleteRefreshSession(redis, decoded.sessionId);
    const tokens = await issueTokenPair(user);

    return res.status(200).json(tokens);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
};

const logout = async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    try {
      const decoded = verifyRefreshToken(refreshToken);
      const redis = await connectRedis();
      await deleteRefreshSession(redis, decoded.sessionId);
    } catch (err) {
      // Logout should be idempotent from the client perspective.
    }
  }

  return res.status(200).json({ message: 'Logged out' });
};

const me = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json({ user: toPublicUser(user) });
};

module.exports = { googleSignIn, refresh, logout, me };
