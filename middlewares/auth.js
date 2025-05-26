// middlewares/auth.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  // TODO: Extract token from Authorization header (e.g., "Bearer <token>")
  // TODO: Verify token using jwt.verify with your JWT secret
  // TODO: If valid, attach user info to req.user; if not, return res.status(401) (Unauthorized)
  
  // Placeholder: skip verification for now
  next();
};