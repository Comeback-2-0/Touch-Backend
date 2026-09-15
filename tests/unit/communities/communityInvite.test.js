const assert = require('node:assert/strict');
const test = require('node:test');

const {createInviteToken, hashInviteToken} = require('../../../src/modules/communities/community-invite.service');

test('community invite tokens are random and only their irreversible hash is persisted', () => {
  const token = createInviteToken();
  assert.match(token, /^[A-Za-z0-9_-]{32,}$/);
  assert.notEqual(hashInviteToken(token), token);
  assert.equal(hashInviteToken(token), hashInviteToken(token));
});
