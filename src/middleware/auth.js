const { verifyAccessToken } = require('../modules/auth/auth.tokens');

module.exports = function (req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization bearer token required' });
  }

  const token = header.slice('Bearer '.length).trim();

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role || 'user',
      sessionId: decoded.sessionId,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
