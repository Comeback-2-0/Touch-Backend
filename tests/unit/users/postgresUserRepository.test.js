const assert = require('node:assert/strict');
const test = require('node:test');

const {
  createPostgresUserRepository,
  mapUserRow,
} = require('../../../src/modules/users/postgres-user.repository');

test('postgres user rows map to the service-compatible user shape', () => {
  const user = mapUserRow({
    id: 'user-1',
    firebase_uid: 'firebase-1',
    uid: 'legacy-1',
    name: 'Maya',
    email: 'maya@example.com',
    photo: 'https://cdn.example.com/google.jpg',
    username: 'maya',
    bio: 'hello',
    profile_picture: 'https://cdn.example.com/profile.jpg',
    profile_picture_public_id: 'touch/profile/maya',
    is_private: true,
    is_profile_complete: true,
    followers_count: 3,
    following_count: 4,
    posts_count: 5,
    role: 'admin',
    last_login_at: new Date('2026-06-18T00:00:00.000Z'),
  });

  assert.equal(user._id, 'user-1');
  assert.equal(user.id, 'user-1');
  assert.equal(user.firebaseUid, 'firebase-1');
  assert.equal(user.profilePicture, 'https://cdn.example.com/profile.jpg');
  assert.equal(user.profilePicturePublicId, 'touch/profile/maya');
  assert.equal(user.isPrivate, true);
  assert.equal(user.isProfileComplete, true);
  assert.equal(user.postsCount, 5);
  assert.equal(user.role, 'admin');
});

test('create uses empty strings for not-null profile fields when Google sign-in omits them', async () => {
  const calls = [];
  const sql = async (strings, ...values) => {
    calls.push({ query: strings.join('?'), values });
    return [{
      id: values[0],
      firebase_uid: values[1],
      uid: values[2],
      name: values[3],
      email: values[4],
      photo: values[5],
      username: values[6],
      bio: values[7],
      profile_picture: values[8],
      profile_picture_public_id: values[9],
      is_private: values[10],
      is_profile_complete: values[11],
      followers_count: values[12],
      following_count: values[13],
      posts_count: values[14],
      role: values[15],
      last_login_at: values[16],
    }];
  };
  const repository = createPostgresUserRepository(sql);

  const user = await repository.create({
    id: 'user-1',
    firebaseUid: 'google-1',
    uid: 'google-1',
    name: 'Indrajit Roy',
    email: 'roy@example.com',
    photo: 'https://lh3.googleusercontent.com/avatar.jpg',
    lastLoginAt: new Date('2026-06-18T00:00:00.000Z'),
  });

  assert.equal(user.bio, '');
  assert.equal(user.profilePicture, '');
  assert.equal(user.profilePicturePublicId, '');
  assert.notEqual(calls[0].values[7], null);
  assert.notEqual(calls[0].values[8], null);
  assert.notEqual(calls[0].values[9], null);
});
