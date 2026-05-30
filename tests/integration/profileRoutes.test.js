const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';

const { createAccessToken } = require('../../src/modules/auth/auth.tokens');
const User = require('../../src/modules/users/user.model');
const userRoutes = require('../../src/modules/users/user.routes');
const uploadRoutes = require('../../src/modules/uploads/upload.routes');

let mongo;

test.before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.syncIndexes();
});

test.after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test.beforeEach(async () => {
  await User.deleteMany({});
});

function makeApp(uploadService) {
  const app = express();
  app.use(express.json());
  app.use('/users', userRoutes);
  app.use('/uploads', uploadRoutes({ uploadService }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    return res.status(err.statusCode || 500).json({ error: err.message });
  });
  return app;
}

async function withServer(app, fn) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function createUser(overrides = {}) {
  return User.create({
    email: overrides.email || `user-${Date.now()}-${Math.random()}@example.com`,
    firebaseUid: overrides.firebaseUid || `firebase-${Date.now()}-${Math.random()}`,
    uid: overrides.uid || `legacy-${Date.now()}-${Math.random()}`,
    name: overrides.name || 'Test User',
    ...overrides,
  });
}

function authHeader(user) {
  const token = createAccessToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role || 'user',
    sessionId: 'session-123',
  });
  return { authorization: `Bearer ${token}` };
}

test('profile routes complete, retrieve, and update profile using JSON', async () => {
  const user = await createUser();
  const app = makeApp();

  await withServer(app, async (baseUrl) => {
    const complete = await fetch(`${baseUrl}/users/complete-profile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeader(user) },
      body: JSON.stringify({
        name: 'Maya Singh',
        username: 'Maya.Touch',
        bio: 'first bio',
        isPrivate: false,
        profilePicture: 'https://cdn.example.com/first.jpg',
        profilePicturePublicId: 'first-id',
      }),
    });
    assert.equal(complete.status, 200);
    assert.equal((await complete.json()).user.username, 'maya.touch');

    const update = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...authHeader(user) },
      body: JSON.stringify({
        name: 'Maya Updated',
        username: 'maya_new',
        bio: 'second bio',
        isPrivate: true,
        profilePicture: 'https://cdn.example.com/second.jpg',
        profilePicturePublicId: 'second-id',
      }),
    });
    assert.equal(update.status, 200);

    const me = await fetch(`${baseUrl}/users/me`, { headers: authHeader(user) });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), {
      user: {
        id: user._id.toString(),
        name: 'Maya Updated',
        username: 'maya_new',
        bio: 'second bio',
        profilePicture: 'https://cdn.example.com/second.jpg',
        isPrivate: true,
        followersCount: 0,
        followingCount: 0,
        postsCount: 0,
        isProfileComplete: true,
      },
    });
  });
});

test('PATCH /users/me rejects multipart profile picture upload', async () => {
  const user = await createUser({ username: 'maya' });
  const app = makeApp();

  await withServer(app, async (baseUrl) => {
    const form = new FormData();
    form.append('profilePicture', new Blob(['fake-image'], { type: 'image/png' }), 'profile.png');
    form.append('bio', 'multipart bio');

    const response = await fetch(`${baseUrl}/users/me`, {
      method: 'PATCH',
      headers: authHeader(user),
      body: form,
    });

    assert.equal(response.status, 415);
    assert.match((await response.json()).error, /application\/json/i);
  });
});

test('username availability endpoint reports valid, invalid, and taken names', async () => {
  await createUser({ username: 'taken', email: 'taken@example.com', firebaseUid: 'taken-firebase' });
  const app = makeApp();

  await withServer(app, async (baseUrl) => {
    const taken = await fetch(`${baseUrl}/users/check-username/TAKEN`);
    assert.deepEqual(await taken.json(), { available: false });

    const invalid = await fetch(`${baseUrl}/users/check-username/bad%20name`);
    assert.deepEqual(await invalid.json(), { available: false });

    const available = await fetch(`${baseUrl}/users/check-username/free.name`);
    assert.deepEqual(await available.json(), { available: true });
  });
});

test('upload profile picture endpoint validates auth, type, size, and returns Cloudinary result', async () => {
  const user = await createUser();
  const uploadService = {
    uploadProfilePicture: async (file) => ({
      url: `https://cdn.example.com/${file.originalname}`,
      publicId: `touch/profile-pictures/${file.originalname}`,
    }),
  };
  const app = makeApp(uploadService);

  await withServer(app, async (baseUrl) => {
    const unauthenticated = await fetch(`${baseUrl}/uploads/profile-picture`, { method: 'POST' });
    assert.equal(unauthenticated.status, 401);

    const badType = new FormData();
    badType.append('profilePicture', new Blob(['text'], { type: 'text/plain' }), 'note.txt');
    const badTypeResponse = await fetch(`${baseUrl}/uploads/profile-picture`, {
      method: 'POST',
      headers: authHeader(user),
      body: badType,
    });
    assert.equal(badTypeResponse.status, 400);

    const tooLarge = new FormData();
    tooLarge.append('profilePicture', new Blob([Buffer.alloc(5 * 1024 * 1024 + 1)], { type: 'image/png' }), 'large.png');
    const tooLargeResponse = await fetch(`${baseUrl}/uploads/profile-picture`, {
      method: 'POST',
      headers: authHeader(user),
      body: tooLarge,
    });
    assert.equal(tooLargeResponse.status, 400);

    const valid = new FormData();
    valid.append('profilePicture', new Blob(['png'], { type: 'image/png' }), 'profile.png');
    const validResponse = await fetch(`${baseUrl}/uploads/profile-picture`, {
      method: 'POST',
      headers: authHeader(user),
      body: valid,
    });
    assert.equal(validResponse.status, 200);
    assert.deepEqual(await validResponse.json(), {
      url: 'https://cdn.example.com/profile.png',
      publicId: 'touch/profile-pictures/profile.png',
    });
  });
});
