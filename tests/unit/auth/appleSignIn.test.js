const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAppleAuthController,
} = require('../../../src/modules/auth/apple-auth.controller');
const response = () => ({
  statusCode: 200,
  status(n) {
    this.statusCode = n;
    return this;
  },
  json(b) {
    this.body = b;
    return this;
  },
});
function setup(claims, existing = null) {
  const created = [];
  const controller = createAppleAuthController({
    verifyToken: async () => claims,
    users: {
      findByAppleSubject: async () => null,
      findByEmail: async () => existing,
      create: async x => {
        created.push(x);
        return {_id: 'u1', ...x};
      },
    },
    issueTokenPair: async () => ({accessToken: 'a', refreshToken: 'r'}),
    sendWelcome: async () => {},
  });
  return {controller, created};
}
const valid = {
  email: 'a@gmail.com',
  email_verified: true,
  firebase: {
    sign_in_provider: 'apple.com',
    identities: {'apple.com': ['apple-sub']},
  },
};
test('Apple relay and missing emails are rejected without creating users', async () => {
  for (const email of ['', 'a@privaterelay.appleid.com']) {
    const {controller, created} = setup({...valid, email});
    const res = response();
    await controller.signIn({body: {idToken: 'token'}}, res);
    assert.equal(res.statusCode, 400);
    assert.equal(created.length, 0);
  }
});
test('Google tokens cannot authenticate via Apple endpoint', async () => {
  const {controller} = setup({
    ...valid,
    firebase: {sign_in_provider: 'google.com'},
  });
  const res = response();
  await controller.signIn({body: {idToken: 'token'}}, res);
  assert.equal(res.statusCode, 401);
});
test('matching email requires explicit linking, never silently merges accounts', async () => {
  const {controller, created} = setup(valid, {_id: 'google-user'});
  const res = response();
  await controller.signIn({body: {idToken: 'token'}}, res);
  assert.equal(res.statusCode, 409);
  assert.equal(created.length, 0);
});
test('verified Apple identity creates an account and returns session', async () => {
  const {controller, created} = setup(valid);
  const res = response();
  await controller.signIn({body: {idToken: 'token'}}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(created[0].appleSubject, 'apple-sub');
  assert.equal(res.body.accessToken, 'a');
});
