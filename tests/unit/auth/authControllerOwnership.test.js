const assert = require('node:assert/strict');
const test = require('node:test');

const { createAuthController } = require('../../../src/modules/auth/auth.controller');

function createResponse() {
  return {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('google sign-in creates users through the configured user repository', async () => {
  const calls = [];
  const controller = createAuthController({
    googleClient: {
      async verifyIdToken() {
        return {
          getPayload() {
            return {
              name: 'Maya',
              email: 'maya@example.com',
              picture: 'https://cdn.example.com/maya.jpg',
              sub: 'google-1',
            };
          },
        };
      },
    },
    userRepository: {
      async findByEmail(email) {
        calls.push(`find:${email}`);
        return null;
      },
      async create(input) {
        calls.push(`create:${input.email}:${input.firebaseUid}`);
        return {
          _id: 'user-1',
          id: 'user-1',
          ...input,
          role: 'user',
        };
      },
    },
    issueTokenPair: async () => ({
      accessToken: 'access',
      refreshToken: 'refresh',
    }),
  });

  const res = createResponse();
  await controller.googleSignIn({ body: { idToken: 'google-token' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user._id, 'user-1');
  assert.equal(res.body.accessToken, 'access');
  assert.deepEqual(calls, [
    'find:maya@example.com',
    'create:maya@example.com:google-1',
  ]);
});

test('google sign-in updates existing users through the configured user repository', async () => {
  const calls = [];
  const controller = createAuthController({
    googleClient: {
      async verifyIdToken() {
        return {
          getPayload() {
            return {
              name: 'Updated',
              email: 'maya@example.com',
              picture: 'https://cdn.example.com/new.jpg',
              sub: 'google-1',
            };
          },
        };
      },
    },
    userRepository: {
      async findByEmail(email) {
        calls.push(`find:${email}`);
        return {
          _id: 'user-1',
          id: 'user-1',
          email,
          name: 'Old',
          role: 'user',
        };
      },
      async updateById(userId, update) {
        calls.push(`update:${userId}:${update.name}:${update.firebaseUid}`);
        return {
          _id: userId,
          id: userId,
          email: 'maya@example.com',
          ...update,
          role: 'user',
        };
      },
    },
    issueTokenPair: async () => ({
      accessToken: 'access',
      refreshToken: 'refresh',
    }),
  });

  const res = createResponse();
  await controller.googleSignIn({ body: { idToken: 'google-token' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.user.name, 'Updated');
  assert.deepEqual(calls, [
    'find:maya@example.com',
    'update:user-1:Updated:google-1',
  ]);
});
