const crypto = require('crypto');
const jwt = require('jsonwebtoken');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function createAccessToken({ userId, email, role = 'user', sessionId }) {
  return jwt.sign(
    {
      email,
      role,
      sessionId,
      type: 'access',
    },
    requireEnv('JWT_ACCESS_SECRET'),
    {
      subject: String(userId),
      expiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
    }
  );
}

function createRefreshToken({ userId, sessionId }) {
  return jwt.sign(
    {
      sessionId,
      type: 'refresh',
    },
    requireEnv('JWT_REFRESH_SECRET'),
    {
      subject: String(userId),
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',
    }
  );
}

function verifyAccessToken(token) {
  const decoded = jwt.verify(token, requireEnv('JWT_ACCESS_SECRET'));
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, requireEnv('JWT_REFRESH_SECRET'));
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type');
  }
  return decoded;
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  hashToken,
};
