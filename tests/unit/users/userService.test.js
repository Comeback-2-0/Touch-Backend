const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';

const User = require('../../../src/modules/users/user.model');
const userService = require('../../../src/modules/users/user.service');

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

async function createUser(overrides = {}) {
  return User.create({
    email: overrides.email || `user-${Date.now()}-${Math.random()}@example.com`,
    firebaseUid: overrides.firebaseUid || `firebase-${Date.now()}-${Math.random()}`,
    uid: overrides.uid || `legacy-${Date.now()}-${Math.random()}`,
    name: overrides.name || 'Test User',
    ...overrides,
  });
}

test('completeProfile stores lowercase username and marks profile complete', async () => {
  const user = await createUser();

  const result = await userService.completeProfile(user._id.toString(), {
    username: 'Touch.User_1',
    bio: 'hello',
    isPrivate: true,
    profilePicture: 'https://cdn.example.com/pic.jpg',
    profilePicturePublicId: 'touch/profile-pictures/new',
  });

  assert.equal(result.username, 'touch.user_1');
  assert.equal(result.bio, 'hello');
  assert.equal(result.isPrivate, true);
  assert.equal(result.profilePicture, 'https://cdn.example.com/pic.jpg');
  assert.equal(result.isProfileComplete, true);
});

test('completeProfile rejects invalid usernames', async () => {
  const user = await createUser();

  await assert.rejects(
    () => userService.completeProfile(user._id.toString(), { username: 'bad name' }),
    /Username can only contain/
  );
});

test('completeProfile rejects duplicate usernames', async () => {
  const user = await createUser();
  await createUser({ email: 'taken@example.com', firebaseUid: 'taken-firebase', username: 'taken' });

  await assert.rejects(
    () => userService.completeProfile(user._id.toString(), { username: 'TAKEN' }),
    /Username is already taken/
  );
});

test('getCurrentUser returns only public profile fields', async () => {
  const user = await createUser({
    username: 'maya',
    bio: 'bio',
    profilePicture: 'https://cdn.example.com/maya.jpg',
    profilePicturePublicId: 'internal-public-id',
    isPrivate: false,
    followersCount: 3,
    followingCount: 4,
    postsCount: 5,
    isProfileComplete: true,
  });

  const result = await userService.getCurrentUser(user._id.toString());

  assert.deepEqual(Object.keys(result).sort(), [
    'bio',
    'followersCount',
    'followingCount',
    'id',
    'isPrivate',
    'isProfileComplete',
    'postsCount',
    'profilePicture',
    'username',
  ].sort());
  assert.equal(result.id, user._id.toString());
  assert.equal(result.username, 'maya');
  assert.equal(result.profilePicturePublicId, undefined);
  assert.equal(result.firebaseUid, undefined);
  assert.equal(result.email, undefined);
});

test('updateProfile updates JSON profile fields', async () => {
  const user = await createUser({ username: 'oldname', profilePicturePublicId: 'old-id' });

  const result = await userService.updateProfile(user._id.toString(), {
    username: 'New.Name',
    bio: 'updated bio',
    isPrivate: true,
    profilePicture: 'https://cdn.example.com/new.jpg',
    profilePicturePublicId: 'new-id',
  }, {
    deleteProfileImage: async () => {},
  });

  assert.equal(result.username, 'new.name');
  assert.equal(result.bio, 'updated bio');
  assert.equal(result.isPrivate, true);
  assert.equal(result.profilePicture, 'https://cdn.example.com/new.jpg');
});

test('updateProfile deletes old profile image only after database update succeeds', async () => {
  const user = await createUser({
    username: 'oldname',
    profilePicture: 'https://cdn.example.com/old.jpg',
    profilePicturePublicId: 'old-id',
  });
  const deleted = [];

  const result = await userService.updateProfile(
    user._id.toString(),
    {
      profilePicture: 'https://cdn.example.com/new.jpg',
      profilePicturePublicId: 'new-id',
    },
    {
      deleteProfileImage: async (publicId) => deleted.push(publicId),
    }
  );

  const saved = await User.findById(user._id);
  assert.equal(saved.profilePicturePublicId, 'new-id');
  assert.equal(result.profilePicture, 'https://cdn.example.com/new.jpg');
  assert.deepEqual(deleted, ['old-id']);
});

test('updateProfile does not delete old profile image when database update fails', async () => {
  const user = await createUser({
    username: 'oldname',
    profilePicturePublicId: 'old-id',
  });
  await createUser({ email: 'taken@example.com', firebaseUid: 'taken-firebase', username: 'taken' });
  const deleted = [];

  await assert.rejects(
    () => userService.updateProfile(
      user._id.toString(),
      {
        username: 'taken',
        profilePicture: 'https://cdn.example.com/new.jpg',
        profilePicturePublicId: 'new-id',
      },
      {
        deleteProfileImage: async (publicId) => deleted.push(publicId),
      }
    ),
    /Username is already taken/
  );

  const saved = await User.findById(user._id);
  assert.equal(saved.profilePicturePublicId, 'old-id');
  assert.deepEqual(deleted, []);
});

test('isUsernameAvailable returns false for invalid usernames and taken names', async () => {
  await createUser({ email: 'taken@example.com', firebaseUid: 'taken-firebase', username: 'taken' });

  assert.equal(await userService.isUsernameAvailable('bad name'), false);
  assert.equal(await userService.isUsernameAvailable('TAKEN'), false);
  assert.equal(await userService.isUsernameAvailable('free_name'), true);
});
