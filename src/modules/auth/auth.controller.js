const { OAuth2Client } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');
const userRepository = require('../users/user.repository');
const { connectRedis } = require('../../database/redisClient');
const {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require('./auth.tokens');
const {
  storeRefreshSession,
  getRefreshSession,
  deleteRefreshSession,
} = require('./auth.sessions');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function userIdOf(user) {
  return String(user.id || user._id);
}

function toPublicUser(user) {
  return {
    _id: userIdOf(user),
    uid: user.uid,
    firebaseUid: user.firebaseUid,
    name: user.name,
    email: user.email,
    photo: user.photo,
    username: user.username,
    profilePicture: user.profilePicture,
    isProfileComplete: user.isProfileComplete,
    role: user.role || 'user',
  };
}

async function issueTokenPair(user, existingSessionId) {
  const redis = await connectRedis();
  const sessionId = existingSessionId || uuidv4();
  const userId = userIdOf(user);
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

function createAuthController({
  googleClient = client,
  users = userRepository,
  issueTokenPair: createTokens = issueTokenPair,
  userRepository: injectedUserRepository,
} = {}) {
  const repository = injectedUserRepository || users;

  const googleSignIn = async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();

      const { name, email, picture, sub } = payload;

      let user = await repository.findByEmail(email);

      if (!user) {
        user = await repository.create({
          name,
          email,
          photo: picture,
          firebaseUid: sub,
          uid: sub,
          lastLoginAt: new Date(),
        });
      } else {
        user = await repository.updateById(userIdOf(user), {
          name: name || user.name,
          photo: picture || user.photo,
          firebaseUid: user.firebaseUid || sub,
          uid: user.uid || sub,
          lastLoginAt: new Date(),
        });
      }

      const tokens = await createTokens(user);
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

      const user = await repository.findById(decoded.sub);
      if (!user) {
        await deleteRefreshSession(redis, decoded.sessionId);
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      await deleteRefreshSession(redis, decoded.sessionId);
      const tokens = await createTokens(user);

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
    const user = await repository.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.status(200).json({ user: toPublicUser(user) });
  };

  return { googleSignIn, refresh, logout, me };
}

module.exports = {
  ...createAuthController(),
  createAuthController,
  issueTokenPair,
  toPublicUser,
};
