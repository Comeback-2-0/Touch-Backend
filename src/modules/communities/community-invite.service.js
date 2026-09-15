const crypto = require('crypto');

function createInviteToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

module.exports = {createInviteToken, hashInviteToken};
