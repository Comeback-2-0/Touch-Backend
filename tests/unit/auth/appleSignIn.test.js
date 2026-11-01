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
      updateById: async (id, update) => ({_id: id, email: existing?.email || valid.email, ...existing, ...update}),
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
test('Apple relay and missing emails enter email verification without creating users', async () => {
  for (const email of ['', 'a@privaterelay.appleid.com']) {
    const {controller, created} = setup({...valid, email});
    const res = response();
    await controller.signIn({body: {idToken: 'token'}}, res);
    assert.equal(res.statusCode, 422);
    assert.equal(res.body.code, 'APPLE_EMAIL_VERIFICATION_REQUIRED');
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
test('matching verified email automatically links the Apple identity', async () => {
  const {controller, created} = setup(valid, {_id: 'google-user'});
  const res = response();
  await controller.signIn({body: {idToken: 'token'}}, res);
  assert.equal(res.statusCode, 200);
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

test('OTP verification never overwrites a different Apple identity on the email account', async () => {
  const controller = createAppleAuthController({
    verifyToken: async () => ({...valid, email: 'relay@privaterelay.appleid.com'}),
    users: {
      findByAppleSubject: async () => null,
      findByEmail: async () => ({_id: 'email-user', email: 'person@example.com', appleSubject: 'apple-b'}),
      updateById: async () => { throw new Error('must not update a conflicting user'); },
    },
    issueTokenPair: async () => ({accessToken: 'a', refreshToken: 'r'}),
    verifyEmailCode: async () => ({appleSubject: 'apple-sub', email: 'person@example.com'}),
  });
  const res = response();
  await controller.verifyEmailVerification({body: {idToken: 'token', challengeId: 'challenge', code: '123456'}}, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'APPLE_ACCOUNT_ALREADY_LINKED_DIFFERENT_IDENTITY');
});
